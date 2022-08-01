import json
import logging
import platform
import subprocess
from threading import Thread
from typing import Optional

import jwt
from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http.auth import DATA_SIGN_SECRET, \
    SIGN_QUERY_PARAM
from homeassistant.components.lovelace.resources import \
    ResourceStorageCollection
from homeassistant.helpers.entity_component import EntityComponent, \
    DATA_INSTANCES
from homeassistant.helpers.typing import HomeAssistantType

_LOGGER = logging.getLogger(__name__)

DOMAIN = 'webrtc'

SYSTEM = {
    'Windows': 'amd64.exe',
    'Darwin': 'darwin',
    'FreeBSD': 'freebsd',
    'Linux': {
        'armv7l': 'armv7',
        'armv8l': 'armv7',  # https://github.com/AlexxIT/WebRTC/issues/18
        'aarch64': 'aarch64',
        'x86_64': 'amd64',
        'i386': 'i386',
        'i486': 'i386',
        'i586': 'i386',
        'i686': 'i386',
    }
}


def get_arch() -> Optional[str]:
    system = SYSTEM.get(platform.system())
    if isinstance(system, dict):
        return system.get(platform.machine())
    elif system:
        return system
    return None


def get_binary_name(version: str) -> str:
    return f"rtsp2webrtc_{version}_{get_arch()}"


def get_binary_url(version: str) -> str:
    return "https://github.com/AlexxIT/RTSPtoWebRTC/releases/download/" \
           f"{version}/rtsp2webrtc_{get_arch()}"


# noinspection PyTypeChecker
async def get_stream_source(hass: HomeAssistantType, entity: str) -> str:
    try:
        component: EntityComponent = hass.data['camera']
        camera: Camera = next(e for e in component.entities
                              if e.entity_id == entity)
        return await camera.stream_source()
    except:
        return None


def register_static_path(app: web.Application, url_path: str, path):
    """Register static path with CORS for Chromecast"""

    async def serve_file(request):
        return web.FileResponse(path)

    route = app.router.add_route("GET", url_path, serve_file)
    if 'allow_all_cors' in app:
        app['allow_all_cors'](route)
    elif 'allow_cors' in app:
        app['allow_cors'](route)


async def init_resource(hass: HomeAssistantType, url: str, ver: str) -> bool:
    """Add extra JS module for lovelace mode YAML and new lovelace resource
    for mode GUI. It's better to add extra JS for all modes, because it has
    random url to avoid problems with the cache. But chromecast don't support
    extra JS urls and can't load custom card.
    """
    resources: ResourceStorageCollection = hass.data['lovelace']['resources']
    # force load storage
    await resources.async_get_info()

    url2 = f"{url}?{ver}"

    for item in resources.async_items():
        if not item['url'].startswith(url):
            continue

        # no need to update
        if item['url'].endswith(ver):
            return False

        _LOGGER.debug(f"Update lovelace resource to: {url2}")

        if isinstance(resources, ResourceStorageCollection):
            await resources.async_update_item(item['id'], {
                'res_type': 'module', 'url': url2
            })
        else:
            # not the best solution, but what else can we do
            item['url'] = url2

        return True

    if isinstance(resources, ResourceStorageCollection):
        _LOGGER.debug(f"Add new lovelace resource: {url2}")
        await resources.async_create_item({'res_type': 'module', 'url': url2})
    else:
        _LOGGER.debug(f"Add extra JS module: {url2}")
        add_extra_js_url(hass, url2)

    return True


# noinspection PyProtectedMember
def dash_cast(hass: HomeAssistantType, cast_entities: list, url: str):
    """Cast webpage to chromecast device via DashCast application."""
    try:
        entities = [
            e for e in hass.data[DATA_INSTANCES]['media_player'].entities
            if e.entity_id in cast_entities and getattr(e, '_chromecast', 0)
        ]
        if not entities:
            _LOGGER.warning(f"Can't find {cast_entities} for DashCast")

        for entity in entities:
            from pychromecast.controllers.dashcast import DashCastController

            if not hasattr(entity, 'dashcast'):
                entity.dashcast = DashCastController()
                entity._chromecast.register_handler(entity.dashcast)

            _LOGGER.debug(f"DashCast to {entity.entity_id}")
            entity.dashcast.load_url(url)

    except:
        _LOGGER.exception(f"Can't DashCast to {cast_entities}")


def validate_signed_request(request: web.Request) -> bool:
    try:
        hass = request.app['hass']
        secret = hass.data.get(DATA_SIGN_SECRET)
        signature = request.query.get(SIGN_QUERY_PARAM)
        claims = jwt.decode(signature, secret, algorithms=["HS256"])
        return claims["path"] == request.path
    except Exception:
        return False


class Server(Thread):
    filepath = None
    port = 8083

    def __init__(self, options: dict):
        super().__init__(name=DOMAIN, daemon=True)
        self.process = None
        self.config = {
            'ice_servers': ['stun:stun.l.google.com:19302']
        }
        if options.get('udp_min', 0) or options.get('udp_max', 0):
            self.config['webrtc_port_min'] = options['udp_min']
            self.config['webrtc_port_max'] = options['udp_max']

    @property
    def available(self):
        return self.process.poll() is None if self.process else False

    def run(self):
        while self.config:
            arg = json.dumps({
                'server': {
                    'http_port': f"localhost:{self.port}",
                    **self.config
                },
                'streams': {}
            }, separators=(',', ':'))

            self.process = subprocess.Popen(
                [self.filepath, arg],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT
            )

            # check alive
            while self.process.poll() is None:
                line = self.process.stdout.readline()
                if line == b'':
                    break
                _LOGGER.debug(line[:-1].decode())

            # increase port number on each next try
            self.port += 1
            if self.port > 10000:
                _LOGGER.exception("Can't run WebRTC server")
                break

    def stop(self, *args):
        self.config = None
        self.process.terminate()
