import asyncio
import os.path
import platform

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
import yaml
from homeassistant.config_entries import ConfigFlow
from homeassistant.const import CONF_URL, CONF_USERNAME, CONF_PASSWORD

from . import DOMAIN, utils


class FlowHandler(ConfigFlow, domain=DOMAIN):
    async def async_step_user(self, user_input=None):
        # check if only one integration instance
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        # check if we support this arch
        if not utils.get_arch():
            return self.async_abort(
                reason="arch",
                description_placeholders={"uname": str(platform.uname())},
            )

        if user_input is not None:
            url = user_input.get(CONF_URL)
            if not url:
                # create config file first time
                config = self.hass.config.path("go2rtc.yaml")
                if not os.path.isfile(config):
                    return await self.async_step_config(None)

            # check if go2rtc url from user input available
            elif not await utils.check_go2rtc(self.hass, url):
                return self.async_show_form(
                    step_id="user",
                    data_schema=vol.Schema(
                        {
                            vol.Optional(CONF_URL, default=url): cv.string,
                        }
                    ),
                    errors={"base": "connect"},
                )

            return self.async_create_entry(title="WebRTC Camera", data=user_input)

        # check if go2rtc already exists on same server
        tests = await asyncio.gather(
            utils.check_go2rtc(self.hass),
            # if go2rtc inside frigate addon with closed public port
            utils.check_go2rtc(self.hass, "http://ccab4aaf-frigate:1984"),
            utils.check_go2rtc(self.hass, "http://ccab4aaf-frigate-fa:1984"),
            utils.check_go2rtc(self.hass, "http://ccab4aaf-frigate-beta:1984"),
        )

        url = next((url for url in tests if url), vol.UNDEFINED)

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_URL, default=url): cv.string,
                }
            ),
        )

    async def async_step_config(self, user_input: dict = None):
        path = self.hass.config.path("go2rtc.yaml")

        if user_input:
            config = {}

            if not user_input["api"]:
                config.setdefault("api", {}).setdefault("listen", "127.0.0.1:1984")

            if not user_input["rtsp"]:
                config.setdefault("rtsp", {}).setdefault("listen", "127.0.0.1:8554")

            if user := user_input.get(CONF_USERNAME):
                config.setdefault("api", {}).setdefault("username", user)
                config.setdefault("rtsp", {}).setdefault("username", user)

            if pasw := user_input.get(CONF_PASSWORD):
                config.setdefault("api", {}).setdefault("password", pasw)
                config.setdefault("rtsp", {}).setdefault("password", pasw)

            if config:
                with open(path, "w") as f:
                    yaml.dump(config, f)

            return self.async_create_entry(title="WebRTC Camera", data={})

        return self.async_show_form(
            step_id="config",
            data_schema=vol.Schema(
                {
                    vol.Required("api", default=True): cv.boolean,
                    vol.Required("rtsp", default=True): cv.boolean,
                    vol.Optional(CONF_USERNAME): cv.string,
                    vol.Optional(CONF_PASSWORD): cv.string,
                }
            ),
            description_placeholders={"path": path},
        )
