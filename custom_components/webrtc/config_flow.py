import platform

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, OptionsFlow, ConfigEntry
from homeassistant.core import callback

from . import DOMAIN, utils


class FlowHandler(ConfigFlow, domain=DOMAIN):

    async def async_step_user(self, user_input=None):
        if utils.get_arch():
            return self.async_create_entry(title="WebRTC Camera", data={})

        return self.async_abort(reason='arch', description_placeholders={
            'uname': str(platform.uname())
        })

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry):
        return OptionsFlowHandler(entry)


class OptionsFlowHandler(OptionsFlow):
    def __init__(self, entry: ConfigEntry):
        self.entry = entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title='', data=user_input)

        udp_min = self.entry.options.get('udp_min', 0)
        udp_max = self.entry.options.get('udp_max', 0)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional('udp_min', default=udp_min): int,
                vol.Optional('udp_max', default=udp_max): int
            })
        )
