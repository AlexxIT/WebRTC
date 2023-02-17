from datetime import timedelta

import voluptuous as vol
from homeassistant.components import media_source
from homeassistant.components.media_player import (
    MediaPlayerEntity,
    SUPPORT_PLAY_MEDIA,
    async_process_play_media_url,
    SUPPORT_BROWSE_MEDIA,
    BrowseMedia,
    SUPPORT_STOP,
    PLATFORM_SCHEMA,
)
from homeassistant.const import STATE_PLAYING, STATE_IDLE, CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.reload import async_setup_reload_service
from homeassistant.helpers.typing import ConfigType

from . import utils
from .utils import DOMAIN

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend(
    {
        vol.Required(CONF_NAME): cv.string,
        vol.Required("stream"): cv.string,
        vol.Required("audio"): cv.string,
    },
    extra=vol.REMOVE_EXTRA,
)

SCAN_INTERVAL = timedelta(seconds=60)


async def async_setup_platform(
    hass: HomeAssistant, config: ConfigType, async_add_entities, discovery_info=None
) -> None:
    await async_setup_reload_service(hass, DOMAIN, ["media_player"])

    player = WebRTCPlayer(**config)

    async_add_entities([player])


class WebRTCPlayer(MediaPlayerEntity):
    def __init__(self, name: str, stream: str, audio: str, **kwargs):
        self._attr_supported_features = (
            SUPPORT_PLAY_MEDIA | SUPPORT_BROWSE_MEDIA | SUPPORT_STOP
        )
        self._attr_name = name
        self._attr_unique_id = stream
        self.audio = audio

    async def async_play_media(self, media_type: str, media_id: str, **kwargs) -> None:
        if media_source.is_media_source_id(media_id):
            sourced_media = await media_source.async_resolve_media(
                self.hass, media_id, self.entity_id
            )
            media_id = sourced_media.url

        media_id = async_process_play_media_url(self.hass, media_id)
        if not media_type.startswith("#"):
            media_type = "#input=file"

        r = await async_get_clientsession(self.hass).post(
            utils.api_streams(self.hass),
            params={
                "dst": self.unique_id,
                "src": f"ffmpeg:{media_id}#audio={self.audio}{media_type}",
            },
            timeout=9,
        )
        assert r.ok

    async def async_media_stop(self) -> None:
        r = await async_get_clientsession(self.hass).post(
            utils.api_streams(self.hass),
            params={"dst": self.unique_id, "src": ""},
            timeout=3,
        )
        assert r.ok

    async def async_update(self):
        try:
            r = await async_get_clientsession(self.hass).get(
                utils.api_streams(self.hass), params={"src": self.unique_id}, timeout=9
            )
            self._attr_available = r.ok
            resp = await r.json(content_type=None)
            playing = any("type" in p for p in resp["producers"])
            self._attr_state = STATE_PLAYING if playing else STATE_IDLE
        except:
            pass

    async def async_browse_media(
        self, media_content_type: str = None, media_content_id: str = None
    ) -> BrowseMedia:
        return await media_source.async_browse_media(self.hass, media_content_id)
