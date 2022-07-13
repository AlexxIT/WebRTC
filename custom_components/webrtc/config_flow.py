import platform

import voluptuous as vol
from homeassistant.config_entries import ConfigFlow, OptionsFlow, ConfigEntry
from homeassistant.core import callback
from homeassistant.const import CONF_URL
from urllib.parse import urlparse
from . import DOMAIN, utils

DATA_SCHEMA = vol.Schema({vol.Required(CONF_URL): str})

class FlowHandler(ConfigFlow, domain=DOMAIN):

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=DATA_SCHEMA)
        
        url = user_input[CONF_URL].rstrip('/')
        result  = urlparse(url) 
      
        if not all([result.scheme, result.netloc]) or result.scheme not in ('ws'):
            return self.async_show_form(
                step_id="user",
                data_schema=DATA_SCHEMA,
                errors={CONF_URL: "invalid_url"},        
            )

        user_input[CONF_URL] = url
        return self.async_create_entry(
            title=url,
            data=user_input,
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: ConfigEntry):
        return OptionsFlowHandler(entry)


class OptionsFlowHandler(OptionsFlow):
    def __init__(self, entry: ConfigEntry):
        self.entry = entry

    async def async_step_init(self, user_input=None):

        if user_input is not None:
            
            url = user_input[CONF_URL].rstrip('/')
            result  = urlparse(url) 
      
            if not all([result.scheme, result.netloc]) or result.scheme not in ('ws'):
                return self.async_show_form(
                    step_id="init",
                    data_schema=vol.Schema({vol.Required(CONF_URL, default=url): str}),
                    errors={CONF_URL: "invalid_url"},        
                )

            user_input[CONF_URL] = url
            self.hass.config_entries.async_update_entry(
                self.entry, title=user_input[CONF_URL], data=user_input, options=self.entry.options
            )

            return self.async_create_entry(title="", data={})

        url = self.entry.data.get(CONF_URL)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({vol.Required(CONF_URL, default=url): str})
        )
