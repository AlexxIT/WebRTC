import logging
import os
import time
import uuid
from urllib.parse import urlparse

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from aiohttp import web
from aiohttp.web_exceptions import HTTPUnauthorized, HTTPGone, HTTPNotFound
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView, KEY_AUTHENTICATED
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, ATTR_ENTITY_ID
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import get_url
from homeassistant.helpers.typing import HomeAssistantType, ConfigType, \
    ServiceCallType

from . import utils
from .utils import DOMAIN, Server

_LOGGER = logging.getLogger(__name__)

BINARY_VERSION = 'v3'

CREATE_LINK_SCHEMA = vol.Schema(
    {
        vol.Required('link_id'): cv.string,
        vol.Exclusive('url', 'url'): cv.string,
        vol.Exclusive('entity', 'url'): cv.entity_id,
        vol.Optional('open_limit', default=1): cv.positive_int,
        vol.Optional('time_to_live', default=60): cv.positive_int,
    },
    required=True,
)

DASH_CAST_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Exclusive('url', 'url'): cv.string,
        vol.Exclusive('entity', 'url'): cv.entity_id,
    },
    required=True,
)

LINKS = {}  # 2 3 4


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
    utils.register_static_path(hass.http.app, url_path, path)

    # remove lovelace card from previous version
    await utils.init_resource(hass, url_path)

    # serve html page
    path = hass.config.path('custom_components/webrtc/www/index.html')
    utils.register_static_path(hass.http.app, '/webrtc/embed', path)

    # component uses websocket, but some users can use REST API for integrate
    # WebRTC to their software
    websocket_api.async_register_command(hass, websocket_webrtc_stream)
    hass.http.register_view(WebRTCStreamView)

    async def create_link(call: ServiceCallType):
        link_id = call.data['link_id']
        ttl = call.data['time_to_live']
        LINKS[link_id] = {
            'data': {
                'url': call.data.get('url'),
                'entity': call.data.get('entity')
            },
            'limit': call.data['open_limit'],
            'ts': time.time() + ttl if ttl else 0
        }

    async def dash_cast(call: ServiceCallType):
        link_id = uuid.uuid4().hex
        LINKS[link_id] = {
            'data': {
                'url': call.data.get('url'),
                'entity': call.data.get('entity')
            },
            'limit': 3,  # 3 attempts
            'ts': time.time() + 30  # for 30 seconds
        }

        await hass.async_add_executor_job(
            utils.dash_cast, hass,
            call.data[ATTR_ENTITY_ID],
            f"{get_url(hass)}/webrtc/embed?url={link_id}"
        )

    hass.services.async_register(DOMAIN, 'create_link', create_link,
                                 CREATE_LINK_SCHEMA)
    hass.services.async_register(DOMAIN, 'dash_cast', dash_cast,
                                 DASH_CAST_SCHEMA)

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
    requires_auth = False

    async def post(self, request: web.Request):
        """Must be authorized or url must be in the streams list."""
        data = await request.post()

        # with link_id without auth
        if 'link_id' in data:
            link_id = data['link_id']
            if link_id not in LINKS:
                raise HTTPNotFound()

            link = LINKS[link_id]
            if link['ts'] and time.time() > link['ts']:
                LINKS.pop(link_id)
                raise HTTPGone()

            if link['limit']:
                link['limit'] -= 1
                if link['limit'] == 0:
                    LINKS.pop(link_id)

            data = {**link['data'], 'sdp64': data['sdp64']}

        elif not request.get(KEY_AUTHENTICATED, False):
            # you shall not pass
            raise HTTPUnauthorized()

        hass = request.app['hass']
        result = await start_stream(hass, **data)
        return web.json_response(result)
