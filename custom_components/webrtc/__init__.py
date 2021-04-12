import logging
import os
import pathlib
from urllib.parse import urlparse

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import HomeAssistantType, ConfigType

from . import utils
from .utils import DOMAIN, Server

_LOGGER = logging.getLogger(__name__)

BINARY_VERSION = 'v1'


async def async_setup(hass: HomeAssistantType, config: ConfigType):
    curdir = pathlib.Path(__file__).parent.absolute()

    # check and download file if needed
    filepath = hass.config.path(utils.get_binary_name(BINARY_VERSION))
    if not os.path.isfile(filepath):
        for file in os.listdir(hass.config.config_dir):
            if file.startswith('rtsp2webrtc_'):
                _LOGGER.debug(f"Remove old binary: {file}")
                os.remove(file)

        url = utils.get_binary_url(BINARY_VERSION)
        _LOGGER.debug(f"Download new binary: {url}")

        session = async_get_clientsession(hass)
        r = await session.get(url)
        raw = await r.read()
        open(filepath, 'wb').write(raw)
        os.chmod(filepath, 744)

    Server.filepath = filepath

    # serve lovelace card
    path = curdir / 'www/webrtc-camera.js'
    url_path = '/webrtc/webrtc-camera.js'
    hass.http.register_static_path(url_path, path, cache_headers=False)

    # register lovelace card
    if await utils.init_resource(hass, url_path):
        _LOGGER.debug(f"Init new lovelace custom card: {url_path}")

    websocket_api.async_register_command(hass, websocket_webrtc_stream)

    return True


async def async_setup_entry(hass: HomeAssistantType, entry: ConfigEntry):
    hass.data[DOMAIN] = server = Server()
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, server.stop)

    server.start()

    return True


async def async_unload_entry(hass: HomeAssistantType, entry: ConfigEntry):
    server = hass.data[DOMAIN]
    server.stop()
    return True


@websocket_api.websocket_command({
    vol.Required('type'): 'webrtc/stream',
    vol.Required('url'): str,
    vol.Required('sdp64'): str
})
@websocket_api.async_response
async def websocket_webrtc_stream(hass: HomeAssistantType, connection, msg):
    try:
        # just check if url valid, e.g. wrong chars in password
        urlparse(msg['url'])

        server = hass.data[DOMAIN]
        if not server.available:
            _LOGGER.warning("WebRTC server not available")
            return

        session = async_get_clientsession(hass)
        r = await session.post(f"http://localhost:{server.port}/stream", data={
            'url': msg['url'], 'sdp64': msg['sdp64']
        })
        raw = await r.json()

        _LOGGER.debug(f"New stream to url: {msg['url']}")
        connection.send_result(msg['id'], raw)

    except Exception as e:
        _LOGGER.error(f"Can't start stream: {msg['url']}, because: {e}")
