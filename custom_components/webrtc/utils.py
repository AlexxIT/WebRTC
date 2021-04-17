import logging
import os
import subprocess
from threading import Thread
from typing import Optional

from homeassistant.components.lovelace.resources import \
    ResourceStorageCollection
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


async def init_resource(hass: HomeAssistantType, url: str) -> bool:
    resources: ResourceStorageCollection = hass.data['lovelace']['resources']
    # force load storage
    await resources.async_get_info()

    for item in resources.async_items():
        if item['url'] == url:
            return False

    try:
        await resources.async_create_item({'res_type': 'module', 'url': url})
    except:
        resources.data.append({'type': 'module', 'url': url})

    return True


class Server(Thread):
    filepath = None
    port = 8083

    def __init__(self, options: dict):
        super().__init__(name=DOMAIN, daemon=True)
        self.enabled = None
        self.process = None
        self.udp_min = str(options.get('udp_min', 50000))
        self.udp_max = str(options.get('udp_max', 59999))

    @property
    def available(self):
        return self.process.poll() is None if self.process else False

    def run(self):
        self.enabled = True

        while self.enabled:
            self.process = subprocess.Popen(
                [self.filepath, '--listen', f"localhost:{self.port}",
                 '--udp_min', self.udp_min, '--udp_max', self.udp_max],
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
        self.enabled = False
        self.process.terminate()
