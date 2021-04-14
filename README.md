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

## FAQ

**Q. I can't see video stream**  
A.
- If your camera works with another integration - it **doesn’t mean** it will work with this integration
- If your camera works in VLC - it **doesn’t mean** it will work with this integration
- If your camera works remotely with another integration - it **doesn’t mean** it will work remotely with this integration

In case of any problems, check:

1. Check that you have installed the integration on the "Configuration > Integrations" page
2. Check that you are on the same network as your Hass server
3. Check that you don't setup Hass server with forward only 8123 port (users with Virtual Machine or Docker installation or firewall), because WebRTC using 50000-50009 UDP ports for video streaming
4. Check that you don't have any erros in "Configuration > Logs" page
5. Check if default video with Bunny works:

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov'
```

PS. Some mobile browsers can't show stream without HTTPS. There are also problems with the stream in the Firefox browser.

**Q. Error: Custom element doesn't exist: webrtc-camera.**  
A. Component automatically adds custom card `/webrtc/webrtc-camera.js` to your resources.

Check if you install component in "Integrations" page. And try to clear your browser cache. Also, you can try to add this card to your resources manually.

**Q. How to setup exernal access?**  
A. External access will work **only** if you have [public IP-address](https://help.keenetic.com/hc/en-us/articles/213965789) (without provider NAT). Dynamic address is also supported.

You need to forward UDP ports 50000-50009 to Hass server on your router.

50000-50009 ports are used only during video streaming. At each start of the streaming, a random port is occupied. The port is released when the streaming ends. The data should theoretically be encrypted, but I haven't tested :)

WebRTC can't work with external access via [Nabu Casa](https://www.nabucasa.com/) or [Dataplicity](https://github.com/AlexxIT/Dataplicity) if you have private IP-address.

**Q. Some streams are not loaded when there are many cameras on the page.**  
A. The default settings only support 10 simultaneous streams (from Hass server to app or browser). Go to "Configuration > Integrations > WebRTC Camera > Options" and increase port range. You also need forward new port range on your router if you want external access to cameras.

**Q. Which codecs are supported?**  
A. WebRTC [supported](https://developer.mozilla.org/en-US/docs/Web/Media/Formats/WebRTC_codecs): `AVC/H.264` for video and `G.711 PCM (A-law)`, `G.711 PCM (µ-law)` for audio.

WebRTC technology doesn't support `HEVC/H.265` for video and `AAC` for audio.

## Install

You can install component with [HACS](https://hacs.xyz/) custom repo: HACS > Integrations > 3 dots (upper top corner) > Custom repositories > URL: `AlexxIT/WebRTC` > Category: Integration

Or manually copy `webrtc` folder from [latest release](https://github.com/AlexxIT/WebRTC/releases/latest) to `custom_components` folder in your config folder. 

## Config

**Video DEMO**

[![WebRTC Camera real time streaming component for Home Assistant](https://img.youtube.com/vi/2otE2dc6OAA/mqdefault.jpg)](https://www.youtube.com/watch?v=2otE2dc6OAA)

With GUI. Configuration > Integration > Add Integration > WebRTC Camera.

If the integration is not in the list, you need to clear the browser cache.

Component **doesn't create devices/entities/services**. It creates only lovelace custom card:

**Minimal**

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0'
```

**Full**

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0'
poster: https://home-assistant.io/images/cast/splash.png  # still image when stream is loading
intersection: 0.75  # auto pause stream when less than 75% of video element is in the screen, 50% by default
```

## About

Supported clients:
- macOS: Google Chrome, Safari
- Windows: Google Chrome
- Android: Google Chrome, Home Assistant Mobile App
- iOS: Home Assistant Mobile App

Limitations:
- works only with H.264 camaras
- for external access you need a public IP-address (without provider NAT), dynamic IP is also supported

Known work cameras:
- ActiveCam AC-D2121IR3 
- ActiveCam AC-D7121IR1W (support sound)
- EZVIZ C3S  
- Hikvision DS-2CD2T47G1-L, DS-2CD1321-I, DS-2CD2143G0-IS  
- Reolink: RLC-410, RLC-410W, E1 Pro, 4505MP
- Sonoff GK-200MP2-B (support sound)  
- TP-Link Tapo C200
- Wyze Cam v2 (support sound)
- Dahua DH-IPC-HDPW1431FP-AS-0280B (support sound)
- Yi 1080p Dome Hi3518e Chipset ([with hack](https://github.com/alienatedsec/yi-hack-v5))
- Yi 1080p Dome MStar Infinity Chipset ([with hack](https://github.com/roleoroleo/yi-hack-MStar))
