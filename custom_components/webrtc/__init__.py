import logging
import os
import random
from urllib.parse import urlparse

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import HomeAssistantType, ConfigType

from . import utils
from .utils import DOMAIN, Server

_LOGGER = logging.getLogger(__name__)

BINARY_VERSION = 'v3'


async def async_setup(hass: HomeAssistantType, config: ConfigType):
    # check and download file if needed
    filepath = hass.config.path(utils.get_binary_name(BINARY_VERSION))
    if not os.path.isfile(filepath):
        for file in os.listdir(hass.config.config_dir):
            if file.startswith('rtsp2webrtc_'):
                _LOGGER.debug(f"Remove old binary: {file}")
                os.remove(hass.config.path(file))

        url = utils.get_binary_url(BINARY_VERSION)
        _LOGGER.debug(f"Download new binary: {url}")

        session = async_get_clientsession(hass)
        r = await session.get(url)
        raw = await r.read()
        open(filepath, 'wb').write(raw)
        os.chmod(filepath, 744)

    Server.filepath = filepath

    # serve lovelace card
    url_path = '/webrtc/webrtc-camera.js'
    path = hass.config.path('custom_components/webrtc/www/webrtc-camera.js')
    hass.http.register_static_path(url_path, path, cache_headers=False)

    # remove lovelace card from previous version
    await utils.delete_resource(hass, url_path)

    # register lovelace card
    add_extra_js_url(hass, f"{url_path}?{random.random()}")

    # component uses websocket, but some users can use REST API for integrate
    # WebRTC to their software
    websocket_api.async_register_command(hass, websocket_webrtc_stream)
    hass.http.register_view(WebRTCStreamView)

    return True


async def async_setup_entry(hass: HomeAssistantType, entry: ConfigEntry):
    hass.data[DOMAIN] = server = Server(entry.options)
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, server.stop)

    server.start()

    # add options handler
    if not entry.update_listeners:
        entry.add_update_listener(async_update_options)

    return True


async def async_unload_entry(hass: HomeAssistantType, entry: ConfigEntry):
    server = hass.data[DOMAIN]
    server.stop()
    return True


async def async_update_options(hass: HomeAssistantType, entry: ConfigEntry):
    await hass.config_entries.async_reload(entry.entry_id)


async def start_stream(hass: HomeAssistantType, sdp64: str, url: str = None,
                       entity: str = None, **kwargs):
    try:
        if entity:
            url = await utils.get_stream_source(hass, entity)
            assert url, f"Can't get URL for {entity}"

        # also check if url valid, e.g. wrong chars in password
        assert urlparse(url).scheme == 'rtsp', "Support only RTSP-stream"

        server = hass.data[DOMAIN]
        assert server.available, "WebRTC server not available"

        session = async_get_clientsession(hass)
        r = await session.post(f"http://localhost:{server.port}/stream", data={
            'url': url, 'sdp64': sdp64
        })
        raw = await r.json()

        _LOGGER.debug(f"New stream to url: {url}")
        return raw

    except Exception as e:
        return {'error': str(e)}


@websocket_api.websocket_command({
    vol.Required('type'): 'webrtc/stream',
    vol.Optional('url'): vol.Any(cv.string, None),
    vol.Optional('entity'): vol.Any(cv.entity_id, None),
    vol.Required('sdp64'): str
})
@websocket_api.async_response
async def websocket_webrtc_stream(hass: HomeAssistantType, connection, msg):
    result = await start_stream(hass, **msg)
    connection.send_result(msg['id'], result)


class WebRTCStreamView(HomeAssistantView):
    url = '/api/webrtc/stream'
    name = 'api:webrtc:stream'

    async def post(self, request: web.Request):
        hass = request.app['hass']
        data = await request.post()
        result = await start_stream(hass, **data)
        return web.json_response(result)
