import io
import logging
import os
import platform
import re
import stat
import subprocess
import zipfile
from threading import Thread
from typing import Optional

import jwt
from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http.auth import DATA_SIGN_SECRET, SIGN_QUERY_PARAM
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_component import EntityComponent, DATA_INSTANCES

_LOGGER = logging.getLogger(__name__)

DOMAIN = "webrtc"

BINARY_VERSION = "1.1.1"

SYSTEM = {
    "Windows": {"AMD64": "go2rtc_win64.zip"},
    "Darwin": {"x86_64": "go2rtc_mac_amd64.zip", "arm64": "go2rtc_mac_arm64.zip"},
    "Linux": {
        "armv7l": "go2rtc_linux_arm",
        "armv8l": "go2rtc_linux_arm",  # https://github.com/AlexxIT/WebRTC/issues/18
        "aarch64": "go2rtc_linux_arm64",
        "x86_64": "go2rtc_linux_amd64",
        "i386": "go2rtc_linux_386",
        "i486": "go2rtc_linux_386",
        "i586": "go2rtc_linux_386",
        "i686": "go2rtc_linux_386",
    },
}

DEFAULT_URL = "http://localhost:1984/"

BINARY_NAME = re.compile(
    r"^(go2rtc-\d\.\d\.\d+|go2rtc_v0\.1-rc\.[5-9]|rtsp2webrtc_v[1-5])(\.exe)?$"
)


def get_arch() -> Optional[str]:
    system = SYSTEM.get(platform.system())
    if not system:
        return None
    return system.get(platform.machine())


def unzip(content: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for filename in zf.namelist():
            with zf.open(filename) as f:
                return f.read()


async def validate_binary(hass: HomeAssistant) -> Optional[str]:
    filename = f"go2rtc-{BINARY_VERSION}"
    if platform.system() == "Windows":
        filename += ".exe"

    filename = hass.config.path(filename)
    if os.path.isfile(filename) and os.access(filename, os.X_OK):
        return filename

    # remove all old binaries
    for file in os.listdir(hass.config.config_dir):
        if BINARY_NAME.match(file):
            _LOGGER.debug(f"Remove old binary: {file}")
            os.remove(hass.config.path(file))

    # download new binary
    url = (
        f"https://github.com/AlexxIT/go2rtc/releases/download/"
        f"v{BINARY_VERSION}/{get_arch()}"
    )
    _LOGGER.debug(f"Download new binary: {url}")
    r = await async_get_clientsession(hass).get(url)
    if not r.ok:
        return None

    raw = await r.read()

    # unzip binary for windows
    if url.endswith(".zip"):
        raw = unzip(raw)

    # save binary to config folder
    with open(filename, "wb") as f:
        f.write(raw)

    # change binary access rights
    os.chmod(filename, os.stat(filename).st_mode | stat.S_IEXEC)

    return filename


# noinspection PyTypeChecker
async def get_stream_source(hass: HomeAssistant, entity: str) -> str:
    try:
        component: EntityComponent = hass.data["camera"]
        camera: Camera = next(e for e in component.entities if e.entity_id == entity)
        return await camera.stream_source()
    except Exception:
        return None


def register_static_path(app: web.Application, url_path: str, path):
    """Register static path with CORS for Chromecast"""

    async def serve_file(request):
        return web.FileResponse(path)

    route = app.router.add_route("GET", url_path, serve_file)
    if "allow_all_cors" in app:
        app["allow_all_cors"](route)
    elif "allow_cors" in app:
        app["allow_cors"](route)


async def init_resource(hass: HomeAssistant, url: str, ver: str) -> bool:
    """Add extra JS module for lovelace mode YAML and new lovelace resource
    for mode GUI. It's better to add extra JS for all modes, because it has
    random url to avoid problems with the cache. But chromecast don't support
    extra JS urls and can't load custom card.
    """
    resources: ResourceStorageCollection = hass.data["lovelace"]["resources"]
    # force load storage
    await resources.async_get_info()

    url2 = f"{url}?{ver}"

    for item in resources.async_items():
        if not item.get("url", "").startswith(url):
            continue

        # no need to update
        if item["url"].endswith(ver):
            return False

        _LOGGER.debug(f"Update lovelace resource to: {url2}")

        if isinstance(resources, ResourceStorageCollection):
            await resources.async_update_item(
                item["id"], {"res_type": "module", "url": url2}
            )
        else:
            # not the best solution, but what else can we do
            item["url"] = url2

        return True

    if isinstance(resources, ResourceStorageCollection):
        _LOGGER.debug(f"Add new lovelace resource: {url2}")
        await resources.async_create_item({"res_type": "module", "url": url2})
    else:
        _LOGGER.debug(f"Add extra JS module: {url2}")
        add_extra_js_url(hass, url2)

    return True


# noinspection PyProtectedMember
def dash_cast(hass: HomeAssistant, cast_entities: list, url: str):
    """Cast webpage to chromecast device via DashCast application."""
    try:
        entities = [
            e
            for e in hass.data[DATA_INSTANCES]["media_player"].entities
            if e.entity_id in cast_entities and getattr(e, "_chromecast", 0)
        ]
        if not entities:
            _LOGGER.warning(f"Can't find {cast_entities} for DashCast")

        for entity in entities:
            from pychromecast.controllers.dashcast import DashCastController

            if not hasattr(entity, "dashcast"):
                entity.dashcast = DashCastController()
                entity._chromecast.register_handler(entity.dashcast)

            _LOGGER.debug(f"DashCast to {entity.entity_id}")
            entity.dashcast.load_url(url)

    except Exception:
        _LOGGER.exception(f"Can't DashCast to {cast_entities}")


def validate_signed_request(request: web.Request) -> bool:
    try:
        hass = request.app["hass"]
        secret = hass.data.get(DATA_SIGN_SECRET)
        signature = request.query.get(SIGN_QUERY_PARAM)
        claims = jwt.decode(signature, secret, algorithms=["HS256"])
        return claims["path"] == request.path
    except Exception:
        return False


async def check_go2rtc(hass: HomeAssistant, url: str = DEFAULT_URL) -> Optional[str]:
    session = async_get_clientsession(hass)
    try:
        r = await session.head(url, timeout=2)
        return url if r.ok else None
    except Exception:
        return None


class Server(Thread):
    def __init__(self, binary: str):
        super().__init__(name=DOMAIN, daemon=True)
        self.binary = binary
        self.process = None

    @property
    def available(self):
        return self.process.poll() is None if self.process else False

    def run(self):
        while self.binary:
            self.process = subprocess.Popen(
                [self.binary], stdout=subprocess.PIPE, stderr=subprocess.STDOUT
            )

            # check alive
            while self.process.poll() is None:
                line = self.process.stdout.readline()
                if line == b"":
                    break
                _LOGGER.debug(line[:-1].decode())

    def stop(self, *args):
        self.binary = None
        self.process.terminate()
