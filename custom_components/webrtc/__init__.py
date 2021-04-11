import logging
import os
import pathlib
import subprocess
from threading import Thread

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import HomeAssistantType, ConfigType

from . import utils

_LOGGER = logging.getLogger(__name__)
DOMAIN = 'webrtc'

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
        _LOGGER.debug(f"Donwload new binary: {url}")

        session = async_get_clientsession(hass)
        r = await session.get(url)
        raw = await r.read()
        open(filepath, 'wb').write(raw)
        os.chmod(filepath, 744)

    # serve lovelace card
    path = curdir / 'www/webrtc-camera.js'
    url_path = '/webrtc/webrtc-camera.js'
    hass.http.register_static_path(url_path, path, cache_headers=False)

    # register lovelace card
    if await utils.init_resource(hass, url_path):
        _LOGGER.debug(f"Init new lovelace custom card: {url_path}")

    websocket_api.async_register_command(hass, websocket_webrtc_stream)

    hass.data[DOMAIN] = {
        'filepath': filepath
    }

    return True


async def async_setup_entry(hass: HomeAssistantType, entry: ConfigEntry):
    filepath = hass.data[DOMAIN]['filepath']

    # run communication webserver on localhost:8083
    process = subprocess.Popen([filepath], stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT)

    hass.data[DOMAIN][entry.entry_id] = process

    def run():
        # check alive
        while process.poll() is None:
            line = process.stdout.readline()
            if line == b'':
                break
            _LOGGER.debug(line[:-1].decode())

    def stop(*args):
        process.terminate()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, stop)

    Thread(name=DOMAIN, target=run).start()

    return True


async def async_unload_entry(hass: HomeAssistantType, entry: ConfigEntry):
    process = hass.data[DOMAIN][entry.entry_id]
    process.terminate()
    return True


@websocket_api.websocket_command({
    vol.Required('type'): 'webrtc/stream',
    vol.Required('url'): str,
    vol.Required('sdp64'): str
})
@websocket_api.async_response
async def websocket_webrtc_stream(hass: HomeAssistantType, connection, msg):
    try:
        session = async_get_clientsession(hass)
        r = await session.post('http://localhost:8083/stream', data={
            'url': msg['url'], 'sdp64': msg['sdp64']
        })
        raw = await r.json()

        _LOGGER.debug(f"New stream to url: {msg['url']}")
        connection.send_result(msg['id'], raw)

    except Exception as e:
        _LOGGER.error(f"Can't start stream: {msg['url']}, because: {e}")
