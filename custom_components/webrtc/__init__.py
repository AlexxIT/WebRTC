import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Union
from urllib.parse import urlencode, urljoin

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from aiohttp import web
from aiohttp.web_exceptions import HTTPUnauthorized, HTTPGone, HTTPNotFound
from homeassistant.components.hassio.ingress import _websocket_forward
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    EVENT_HOMEASSISTANT_STOP,
    ATTR_ENTITY_ID,
    CONF_URL,
)
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import get_url
from homeassistant.helpers.template import Template
from homeassistant.helpers.typing import HomeAssistantType, ConfigType, ServiceCallType

from . import utils
from .utils import DOMAIN, Server

_LOGGER = logging.getLogger(__name__)

CREATE_LINK_SCHEMA = vol.Schema(
    {
        vol.Required("link_id"): cv.string,
        vol.Exclusive("url", "url"): cv.string,
        vol.Exclusive("entity", "url"): cv.entity_id,
        vol.Optional("open_limit", default=1): cv.positive_int,
        vol.Optional("time_to_live", default=60): cv.positive_int,
    },
    required=True,
)

DASH_CAST_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Exclusive("url", "url"): cv.string,
        vol.Exclusive("entity", "url"): cv.entity_id,
        vol.Optional("force", default=False): bool,
        vol.Optional("extra"): dict,
    },
    required=True,
)

LINKS = {}  # 2 3 4

# DDoS protection against requests to HLS proxy
# streams are additionally protected by a random playlist identifier
HLS_COOKIE = "webrtc-hls-session"
HLS_SESSION = str(uuid.uuid4())


async def async_setup(hass: HomeAssistantType, config: ConfigType):
    # 1. Serve lovelace card
    path = Path(__file__).parent / "www"
    for name in ("video-rtc.js", "webrtc-camera.js", "digital-ptz.js"):
        utils.register_static_path(hass.http.app, "/webrtc/" + name, path / name)

    # 2. Add card to resources
    version = getattr(hass.data["integrations"][DOMAIN], "version", 0)
    await utils.init_resource(hass, "/webrtc/webrtc-camera.js", str(version))

    # 3. Serve html page
    path = Path(__file__).parent / "www/embed.html"
    utils.register_static_path(hass.http.app, "/webrtc/embed", path)

    # 4. Serve WebSocket API
    hass.http.register_view(WebSocketView)

    # 5. Serve HLS proxy
    hass.http.register_view(HLSView)

    # 6. Register webrtc.create_link and webrtc.dash_cast services:

    async def create_link(call: ServiceCallType):
        link_id = call.data["link_id"]
        ttl = call.data["time_to_live"]
        LINKS[link_id] = {
            "url": call.data.get("url"),
            "entity": call.data.get("entity"),
            "limit": call.data["open_limit"],
            "ts": time.time() + ttl if ttl else 0,
        }

    async def dash_cast(call: ServiceCallType):
        link_id = uuid.uuid4().hex
        LINKS[link_id] = {
            "url": call.data.get("url"),
            "entity": call.data.get("entity"),
            "limit": 1,  # 1 attempt
            "ts": time.time() + 30,  # for 30 seconds
        }

        query = call.data.get("extra", {})
        query["url"] = link_id

        await hass.async_add_executor_job(
            utils.dash_cast,
            hass,
            call.data[ATTR_ENTITY_ID],
            f"{get_url(hass)}/webrtc/embed?" + urlencode(query),
            call.data.get("force"),
        )

    hass.services.async_register(DOMAIN, "create_link", create_link, CREATE_LINK_SCHEMA)
    hass.services.async_register(DOMAIN, "dash_cast", dash_cast, DASH_CAST_SCHEMA)

    return True


async def async_setup_entry(hass: HomeAssistantType, entry: ConfigEntry):
    # 1. If user set custom url
    go_url = entry.data.get(CONF_URL)

    # 2. Check if go2rtc running on same server
    if not go_url:
        go_url = await utils.check_go2rtc(hass)

    if go_url:
        # netloc example: admin:admin@192.168.1.123:1984
        hass.data[DOMAIN] = go_url
        return True

    # 3. Serve go2rtc binary manually
    binary = await utils.validate_binary(hass)
    if not binary:
        return False

    hass.data[DOMAIN] = server = Server(binary)
    server.start()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, server.stop)

    return True


async def async_unload_entry(hass: HomeAssistantType, entry: ConfigEntry):
    server = hass.data[DOMAIN]
    if isinstance(server, Server):
        server.stop()
    return True


async def ws_connect(hass: HomeAssistantType, params: dict) -> str:
    # 1. Server URL from card param
    server: str = params.get("server")
    # 2. Server URL from integration settings
    if not server:
        server: Union[str, Server] = hass.data[DOMAIN]
    # 3. Server is manual binary
    if isinstance(server, Server):
        assert server.available, "WebRTC server not available"
        server = "http://localhost:1984/"

    if name := params.get("entity"):
        src = await utils.get_stream_source(hass, name)
        assert src, f"Can't get URL for {name}"
        query = {"src": src, "name": name}
    elif src := params.get("url"):
        if "{{" in src or "{%" in src:
            src = Template(src, hass).async_render()
        query = {"src": src}
    else:
        raise Exception("Missing url or entity")

    return urljoin("ws" + server[4:], "api/ws") + "?" + urlencode(query)


class WebSocketView(HomeAssistantView):
    url = "/api/webrtc/ws"
    name = "api:webrtc:ws"
    requires_auth = False

    async def get(self, request: web.Request):
        params = request.query
        _LOGGER.debug(f"New client: {dict(params)}")

        if request.query.get("embed"):
            link_id = request.query.get("url")
            if link_id not in LINKS:
                raise HTTPNotFound()

            link = LINKS[link_id]
            if link["ts"] and time.time() > link["ts"]:
                LINKS.pop(link_id)
                raise HTTPGone()

            if link["limit"]:
                link["limit"] -= 1
                if link["limit"] == 0:
                    LINKS.pop(link_id)

            params = link

        # fix for https://github.com/AlexxIT/WebRTC/pull/320
        elif not utils.validate_signed_request(request):
            # you shall not pass
            raise HTTPUnauthorized()

        ws_server = web.WebSocketResponse(autoclose=False, autoping=False)
        ws_server.set_cookie(HLS_COOKIE, HLS_SESSION)
        await ws_server.prepare(request)

        try:
            hass = request.app["hass"]
            url = await ws_connect(hass, params)

            remote = request.headers.get("X-Forwarded-For")
            remote = remote + ", " + request.remote if remote else request.remote

            # https://www.nginx.com/resources/wiki/start/topics/examples/forwarded/
            async with async_get_clientsession(hass).ws_connect(
                url,
                autoclose=False,
                autoping=False,
                headers={
                    "User-Agent": request.headers.get("User-Agent"),
                    "X-Forwarded-For": remote,
                    "X-Forwarded-Host": request.host,
                    "X-Forwarded-Proto": request.scheme,
                },
            ) as ws_client:
                # Proxy requests
                await asyncio.wait(
                    [
                        asyncio.create_task(_websocket_forward(ws_server, ws_client)),
                        asyncio.create_task(_websocket_forward(ws_client, ws_server)),
                    ],
                    return_when=asyncio.FIRST_COMPLETED,
                )

        except Exception as e:
            await ws_server.send_json({"type": "error", "value": str(e)})

        return ws_server


class HLSView(HomeAssistantView):
    url = "/api/webrtc/hls/{filename}"
    name = "api:webrtc:hls"
    requires_auth = False

    async def get(self, request: web.Request, filename: str):
        if request.cookies.get(HLS_COOKIE) != HLS_SESSION:
            raise HTTPUnauthorized()

        if filename not in ("playlist.m3u8", "init.mp4", "segment.m4s", "segment.ts"):
            raise HTTPNotFound()

        hass: HomeAssistantType = request.app["hass"]
        entry = hass.data[DOMAIN]
        url = "http://localhost:1984/" if isinstance(entry, Server) else entry
        url = urljoin(url, "api/hls/" + filename) + "?" + request.query_string

        async with async_get_clientsession(hass).get(url) as r:
            if not r.ok:
                raise HTTPNotFound()

            body = await r.read()
            return web.Response(body=body, content_type=r.content_type)
