import os
from typing import Optional

from homeassistant.components.lovelace.resources import \
    ResourceStorageCollection
from homeassistant.helpers.typing import HomeAssistantType

ARCH = {
    'armv7l': 'armv7',
    'aarch64': 'aarch64',
    'x86_64': 'amd64',
}


def get_arch() -> Optional[str]:
    uname = ('Windows',) if os.name == 'nt' else os.uname()
    if uname[0] == 'Windows':
        return 'amd64.exe'
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

    await resources.async_create_item({'res_type': 'module', 'url': url})
    return True
