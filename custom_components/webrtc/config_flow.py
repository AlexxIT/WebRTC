import platform

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, OptionsFlow, ConfigEntry
from homeassistant.core import callback

from . import CONFIG_ENTRY_VALIDATOR, CONF_UDP_MAX, CONF_UDP_MIN, DEFAULT_UDP_MAX, DEFAULT_UDP_MIN, \
    DOMAIN, ZERO_PORT_VALIDATOR, utils


class FlowHandler(ConfigFlow, domain=DOMAIN):
    VERSION = 2

    async def async_create_config_entry(self, user_input):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if utils.get_arch():
            return self.async_create_entry(title="WebRTC Camera", data={},
                                           options=user_input)

        return self.async_abort(reason='arch', description_placeholders={
            'uname': str(platform.uname())
        })

    async def async_step_user(self, user_input=None):
        return await self.async_create_config_entry(CONFIG_ENTRY_VALIDATOR(user_input or {}))

    async def async_step_import(self, user_input=None):
        if not user_input:
            return self.async_abort("user_input_empty")
        return await self.async_create_config_entry(user_input)

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry):
        return OptionsFlowHandler(entry)


class OptionsFlowHandler(OptionsFlow):
    def __init__(self, entry: ConfigEntry):
        self.entry = entry

    async def async_step_init(self, user_input=None):
        errors = {}
        if user_input:
            udp_min, udp_max = user_input[CONF_UDP_MIN], user_input[CONF_UDP_MAX]
            if udp_max != 0 and udp_min > udp_max:
                errors[CONF_UDP_MIN] = "above_max"

            if not errors:
                return self.async_create_entry(title='', data=user_input)

        if user_input:
            user_input = {**self.entry.options, **user_input}
        else:
            user_input = self.entry.options

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(CONF_UDP_MIN,
                             default=user_input.get(
                                 CONF_UDP_MIN) or DEFAULT_UDP_MIN): ZERO_PORT_VALIDATOR,
                vol.Optional(CONF_UDP_MAX,
                             default=user_input.get(
                                 CONF_UDP_MAX) or DEFAULT_UDP_MAX): ZERO_PORT_VALIDATOR
            }),
            errors=errors,
        )
