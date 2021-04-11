# WebRTC Camera

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![Donate](https://img.shields.io/badge/donate-Coffee-yellow.svg)](https://www.buymeacoffee.com/AlexxIT)
[![Donate](https://img.shields.io/badge/donate-Yandex-red.svg)](https://money.yandex.ru/to/41001428278477)

Home Assistant custom component for viewing IP cameras [RTSP](https://en.wikipedia.org/wiki/Real_Time_Streaming_Protocol) stream in real time using [WebRTC](https://en.wikipedia.org/wiki/WebRTC) technology.

Based on:
 - [Pion](https://github.com/pion/webrtc) - pure Go implementation of WebRTC 
 - [RTSPtoWebRTC](https://github.com/deepch/RTSPtoWebRTC) - Go app by [@deepch](https://github.com/deepch) and [@vdalex25](https://github.com/vdalex25)
 
Why WebRTC:
- works in any modern browser, even on mobiles
- the only browser technology with minimal camera stream delays (0.5 seconds and below)
- works well with unstable channel
- does not use transcoding and does not load the CPU
- support camera stream with sound

## Install

You can install component with [HACS](https://hacs.xyz/) custom repo: HACS > Integrations > 3 dots (upper top corner) > Custom repositories > URL: `AlexxIT/WebRTC` > Category: Integration

Or manually copy `webrtc` folder from [latest release](https://github.com/AlexxIT/WebRTC/releases/latest) to `custom_components` folder in your config folder. 

## Config

With GUI. Configuration > Integration > Add Integration > WebRTC Camera.

If the integration is not in the list, you need to clear the browser cache.

Component **doesn't create devices/entities/services**. It creates only lovelace custom card:

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0'
```

# About

Supported clients:
- macOS: Google Chrome, Safari
- Windows: Google Chrome
- Android: Google Chrome, Home Assistant Mobile App
- iOS: Home Assistant Mobile App

Limitations:
- works only with H.264 camaras
- for external access you need a white IP address (without provider NAT), dynamic IP is also supported

Known work cameras:
- Sonoff GK-200MP2-B (support sound)  
- EZVIZ C3S  
- Hikvision: DS-2CD2T47G1-L, DS-2CD1321-I, DS-2CD2143G0-IS  
- Reolink: RLC-410, RLC-410W, E1 Pro, 4505MP
- TP-Link: Tapo C200

Support external camera access. You need to forward UDP ports 50000-50009 to Hass.io server on your router.

50000-50009 ports are used only during video streaming. At each start of the streaming, a random port is occupied. The port is released when the streaming ends. The data should theoretically be encrypted, but I haven't tested :)