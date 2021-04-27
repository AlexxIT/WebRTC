import logging
import os
import random
import subprocess
from threading import Thread
from typing import Optional

from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.lovelace.resources import \
    ResourceStorageCollection
from homeassistant.helpers.entity_component import EntityComponent, \
    DATA_INSTANCES
from homeassistant.helpers.typing import HomeAssistantType

_LOGGER = logging.getLogger(__name__)

DOMAIN = 'webrtc'

ARCH = {
    'armv7l': 'armv7',
    'aarch64': 'aarch64',
    'x86_64': 'amd64',
    'i386': 'i386',
    'i486': 'i386',
    'i586': 'i386',
    'i686': 'i386',
}


def get_arch() -> Optional[str]:
    uname = ('Windows',) if os.name == 'nt' else os.uname()
    if uname[0] == 'Windows':
        return 'amd64.exe'
    elif uname[0] == 'Darwin':
        return 'darwin'
    elif uname[0] == 'Linux' and uname[4] in ARCH:
        return ARCH[uname[4]]
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


def register_static_path(app: web.Application, url_path: str, path: str):
    """Register static path with CORS for Chromecast"""

    async def serve_file(request):
        return web.FileResponse(path)

    route = app.router.add_route("GET", url_path, serve_file)
    app['allow_cors'](route)


async def init_resource(hass: HomeAssistantType, url: str) -> bool:
    """Add extra JS module for lovelace mode YAML and new lovelace resource
    for mode GUI. It's better to add extra JS for all modes, because it has
    random url to avoid problems with the cache. But chromecast don't support
    extra JS urls and can't load custom card.
    """
    resources: ResourceStorageCollection = hass.data['lovelace']['resources']
    # force load storage
    await resources.async_get_info()

    for item in resources.async_items():
        if item['url'] == url:
            return False

    if isinstance(resources, ResourceStorageCollection):
        _LOGGER.debug(f"Add new lovelace resource: {url}")
        await resources.async_create_item({'res_type': 'module', 'url': url})
    else:
        _LOGGER.debug(f"Add extra JS module: {url}")
        add_extra_js_url(hass, f"{url}?{random.random()}")

    return True


# noinspection PyProtectedMember
def dash_cast(hass: HomeAssistantType, cast_entities: list, url: str):
    """Cast webpage to chromecast device via DashCast application."""
    try:
        entities = [
            e for e in hass.data[DATA_INSTANCES]['media_player'].entities
            if e.entity_id in cast_entities and e._chromecast
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


class Server(Thread):
    filepath = None
    port = 8083

    def __init__(self, options: dict):
        super().__init__(name=DOMAIN, daemon=True)
        self.process = None
        self.args = [
            self.filepath, '--ice_server', 'stun:stun.l.google.com:19302'
        ]
        if options.get('udp_min', 0) or options.get('udp_max', 0):
            self.args += [
                '--udp_min', str(options['udp_min']),
                '--udp_max', str(options['udp_max'])
            ]

    @property
    def available(self):
        return self.process.poll() is None if self.process else False

    def run(self):
        while self.args:
            self.process = subprocess.Popen(
                self.args + ['--listen', f"localhost:{self.port}"],
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
        self.args = None
        self.process.terminate()
