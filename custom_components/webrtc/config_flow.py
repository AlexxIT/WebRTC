import platform

import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant.config_entries import ConfigFlow
from homeassistant.const import CONF_URL

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
            # check if go2rtc url from user input available
            if url and not await utils.check_go2rtc(self.hass, url):
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
        if await utils.check_go2rtc(self.hass):
            url = "http://localhost:1984/"
        else:
            url = vol.UNDEFINED

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional(CONF_URL, default=url): cv.string,
                }
            ),
        )
