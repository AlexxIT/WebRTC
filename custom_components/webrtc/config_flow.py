import os

from homeassistant.config_entries import ConfigFlow

from . import DOMAIN, utils


class FlowHandler(ConfigFlow, domain=DOMAIN):

    async def async_step_user(self, user_input=None):
        if utils.get_arch():
            return self.async_create_entry(title="WebRTC Camera", data={})

        return self.async_abort(reason='arch', description_placeholders={
            'uname': os.uname() if os.name != 'nt' else os.name
        })
