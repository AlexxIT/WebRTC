import asyncio
import logging
import os
import stat
import time
import uuid
from pathlib import Path
from typing import Final
from urllib.parse import urlencode, urlparse

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from aiohttp import web
from aiohttp.web_exceptions import HTTPUnauthorized, HTTPGone, HTTPNotFound
from homeassistant.components.hassio.ingress import _websocket_forward
from homeassistant.components.http import HomeAssistantView, KEY_AUTHENTICATED
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.const import EVENT_HOMEASSISTANT_STOP, ATTR_ENTITY_ID
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import get_url
from homeassistant.helpers.typing import HomeAssistantType, ConfigType, \
    ServiceCallType

from . import utils
from .utils import DOMAIN, Server

_LOGGER = logging.getLogger(__name__)

BINARY_VERSION = 'v5'

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

CONF_UDP_MIN: Final = "udp_min"
CONF_UDP_MAX: Final = "udp_max"

DEFAULT_UDP_MIN: Final = 0
DEFAULT_UDP_MAX: Final = 0

ZERO_PORT_VALIDATOR = vol.All(vol.Coerce(int),
                              vol.Range(min=0, max=65535, min_included=True, max_included=True))


def max_less_or_equal_to_min(mapping: dict):
    udp_min, udp_max = mapping[CONF_UDP_MIN], mapping[CONF_UDP_MAX]
    if udp_max != 0 and udp_min > udp_max:
        raise vol.Invalid("min cannot be greater than max if max != 0", path=[CONF_UDP_MIN])
    return mapping


CONFIG_ENTRY_VALIDATOR: Final = vol.All(vol.Schema(
    {
        vol.Optional(CONF_UDP_MIN, default=DEFAULT_UDP_MIN): ZERO_PORT_VALIDATOR,
        vol.Optional(CONF_UDP_MAX, default=DEFAULT_UDP_MAX): ZERO_PORT_VALIDATOR,
    },
), max_less_or_equal_to_min)


def ingest(value):
    print(value)
    return value


CONFIG_SCHEMA: Final = vol.Schema(
    {
        vol.Optional(DOMAIN): CONFIG_ENTRY_VALIDATOR,
    },
    extra=vol.ALLOW_EXTRA,
)


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
        os.chmod(filepath, os.stat(filepath).st_mode | stat.S_IEXEC)

    Server.filepath = filepath

    # serve lovelace card
    url_path = '/webrtc/webrtc-camera.js'
    path = Path(__file__).parent / 'www' / 'webrtc-camera.js'
    utils.register_static_path(hass.http.app, url_path, path)

    # version supported only after 2021.3.0
    version = getattr(hass.data['integrations'][DOMAIN], 'version', 0)

    # remove lovelace card from previous version
    await utils.init_resource(hass, url_path, str(version))

    # serve html page
    path = Path(__file__).parent / 'www' / 'index.html'
    utils.register_static_path(hass.http.app, '/webrtc/embed', path)

    # component uses websocket, but some users can use REST API for integrate
    # WebRTC to their software
    hass.http.register_view(WebSocketView())
    hass.http.register_view(WebRTCStreamView())

    async def create_link(call: ServiceCallType):
        link_id = call.data['link_id']
        ttl = call.data['time_to_live']
        LINKS[link_id] = {
            'url': call.data.get('url'),
            'entity': call.data.get('entity'),
            'limit': call.data['open_limit'],
            'ts': time.time() + ttl if ttl else 0
        }

    async def dash_cast(call: ServiceCallType):
        link_id = uuid.uuid4().hex
        LINKS[link_id] = {
            'url': call.data.get('url'),
            'entity': call.data.get('entity'),
            'limit': 1,  # 1 attempt
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

    # create configuration entry from YAML
    domain_config = config.get(DOMAIN)
    if domain_config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data=domain_config
            )
        )

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


async def async_migrate_entry(hass: HomeAssistantType, entry: ConfigEntry):
    unique_id = entry.unique_id
    options = dict(entry.options)

    if entry.version < 2:
        # force unique id
        entry.version = 2
        unique_id = DOMAIN
        options.setdefault(CONF_UDP_MIN, DEFAULT_UDP_MIN)
        options.setdefault(CONF_UDP_MAX, DEFAULT_UDP_MAX)

    hass.config_entries.async_update_entry(
        entry,
        unique_id=unique_id,
        options=options,
    )

    return True


async def ws_connect(hass: HomeAssistantType, params):
    entity = params.get('entity')
    if entity:
        url = await utils.get_stream_source(hass, entity)
        assert url, f"Can't get URL for {entity}"
    else:
        url = params.get('url')

    # also check if url valid, e.g. wrong chars in password
    assert urlparse(url).scheme == 'rtsp', "Support only RTSP-stream"

    server = hass.data[DOMAIN]
    assert server.available, "WebRTC server not available"

    query = urlencode({'url': url})
    return f"ws://localhost:{server.port}/ws?{query}"


class WebSocketView(HomeAssistantView):
    url = '/api/webrtc/ws'
    name = 'api:webrtc:ws'
    requires_auth = False

    async def get(self, request: web.Request):
        params = request.query

        if request.query.get('embed'):
            link_id = request.query.get('url')
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

            params = link

        elif not request.get(KEY_AUTHENTICATED, False):
            # you shall not pass
            raise HTTPUnauthorized()

        ws_server = web.WebSocketResponse(autoclose=False, autoping=False)
        await ws_server.prepare(request)

        try:
            hass = request.app['hass']
            url = await ws_connect(hass, params)
            async with async_get_clientsession(hass).ws_connect(
                    url, autoclose=False, autoping=False
            ) as ws_client:
                # Proxy requests
                await asyncio.wait([
                    _websocket_forward(ws_server, ws_client),
                    _websocket_forward(ws_client, ws_server),
                ], return_when=asyncio.FIRST_COMPLETED)

        except Exception as e:
            await ws_server.send_json({'error': str(e)})

        return ws_server


class WebRTCStreamView(HomeAssistantView):
    url = '/api/webrtc/stream'
    name = 'api:webrtc:stream'
    requires_auth = True

    async def post(self, request: web.Request):
        try:
            hass = request.app['hass']
            params = await request.post()
            url = await ws_connect(hass, params)
            async with async_get_clientsession(hass).ws_connect(url) as ws:
                await ws.send_json({'type': 'webrtc', 'sdp': params['sdp']})
                resp = await ws.receive_json(timeout=15)

        except Exception as e:
            resp = {'error': str(e)}

        return web.json_response(resp)
