from datetime import timedelta

import voluptuous as vol
from homeassistant.components import media_source
from homeassistant.components.media_player import (
    async_process_play_media_url,
    BrowseMedia,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    PLATFORM_SCHEMA,
)
from homeassistant.const import (
    CONF_NAME,
    STATE_IDLE,
    STATE_PLAYING,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.reload import async_setup_reload_service
from homeassistant.helpers.typing import ConfigType

from . import utils
from .utils import DOMAIN

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend(
    {
        vol.Required(CONF_NAME): cv.string,
        vol.Required("stream"): cv.string,
        vol.Required("audio"): cv.string,
        vol.Optional("volume_entity"): cv.entity_id,
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
    def __init__(
        self, name: str, stream: str, audio: str, volume_entity: str = None, **kwargs
    ):
        self._attr_supported_features = (
            MediaPlayerEntityFeature.PLAY_MEDIA
            | MediaPlayerEntityFeature.BROWSE_MEDIA
            | MediaPlayerEntityFeature.STOP
        )
        if volume_entity:
            self._attr_supported_features |= MediaPlayerEntityFeature.VOLUME_SET

        self._attr_name = name
        self._attr_unique_id = stream
        self.audio = audio
        self.volume_entity = volume_entity

    async def async_added_to_hass(self) -> None:
        if self.volume_entity:
            self.async_on_remove(
                async_track_state_change_event(
                    self.hass, self.volume_entity, self._async_volume_state_changed
                )
            )

    @callback
    def _async_volume_state_changed(self, event) -> None:
        self.async_write_ha_state()

    @property
    def volume_level(self) -> float | None:
        if not self.volume_entity:
            return None

        state = self.hass.states.get(self.volume_entity)
        if not state or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            return None

        try:
            value = float(state.state)
            min_value = float(state.attributes.get("min", 0))
            max_value = float(state.attributes.get("max", 100))
        except (TypeError, ValueError):
            return None

        if max_value <= min_value:
            return None

        return min(1, max(0, (value - min_value) / (max_value - min_value)))

    async def async_set_volume_level(self, volume: float) -> None:
        if not self.volume_entity:
            return

        state = self.hass.states.get(self.volume_entity)
        if not state:
            return

        try:
            min_value = float(state.attributes.get("min", 0))
            max_value = float(state.attributes.get("max", 100))
        except (TypeError, ValueError):
            min_value = 0
            max_value = 100

        volume = min(1, max(0, volume))
        value = min_value + volume * (max_value - min_value)
        domain = self.volume_entity.split(".", 1)[0]
        await self.hass.services.async_call(
            domain,
            "set_value",
            {"entity_id": self.volume_entity, "value": value},
            blocking=True,
        )
        self.async_write_ha_state()

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
        except Exception:
            pass

    async def async_browse_media(
        self, media_content_type: str = None, media_content_id: str = None
    ) -> BrowseMedia:
        return await media_source.async_browse_media(self.hass, media_content_id)
