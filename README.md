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
3. Check that you don't setup Hass server with forward only 8123 port (users with Virtual Machine or Docker installation or firewall), because WebRTC using random UDP ports for video streaming
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

**Q. Exernal access to streams doesn't work**  
A. WebRTC technology can't use your HTTP/HTTPS-access to Hass. It uses a random UDP port to connect. And it can handle access to stream even if you have [private IP-address](https://help.keenetic.com/hc/en-us/articles/213965789), but not in all cases.

At each start of the streaming, a random UDP port is occupied. The port is released when the streaming ends. The data should theoretically be encrypted, but I haven't tested :)

If your stream does not start with an external connection (stuck on status `Trying to connect`), you may be behind a [symmetric NAT](https://en.wikipedia.org/wiki/Network_address_translation#Symmetric_NAT). Some users are helped by UDP port forwarding on the router. You can customize the range of ports in the integration options. It is recommended to use at least 10 ports per camera.

For more tech info read about [STUN](https://en.wikipedia.org/wiki/STUN) and [UDP hole punching](https://en.wikipedia.org/wiki/UDP_hole_punching).

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

**or**

```yaml
type: 'custom:webrtc-camera'
entity: camera.generic_stream  # change to your camera entity_id
```

**Full**

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0'

title: My super camera  # optional card title
poster: https://home-assistant.io/images/cast/splash.png  # still image when stream is loading
intersection: 0.75  # auto pause stream when less than 75% of video element is in the screen, 50% by default
ui: true  # custom video controls, default false

ptz:  # optional PTZ controls
  opacity: 0.4  # optional default contols opacity
  service: sonoff.send_command  # service for control PTZ (check Hass docs to your camera)
  data_left:  # service data for each direction
    device: '048123'
    cmd: left
  data_right:
    device: '048123'
    cmd: right
  data_up:
    device: '048123'
    cmd: up
  data_down:
    device: '048123'
    cmd: down
```

## Cast or share stream

Component support streaming to [Google Cast](https://www.home-assistant.io/integrations/cast/) Chromecast devices (including Android TV and Google Smart Screen). Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

Also component support creating a temporary or permanent link to a stream without sharing access to you Home Assistant. Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

## Known work clients

- Google Chrome (macOS, Windows, Android)
- Safar (macOS, iOS)
- Firefox (macOS, Windows)
- Home Assistant Mobile App (Android, iOS)

## Known work cameras

Brand | Models | Comment
------|--------|--------
ActiveCam | AC-D2121IR3 | 
ActiveCam | AC-D7121IR1W | support sound
Android | [IP Webcam Pro](https://play.google.com/store/apps/details?id=com.pas.webcam.pro) | support sound, `rtsp://192.168.1.123:8080/h264_ulaw.sdp`
Dahua | DH-IPC-HDPW1431FP-AS-0280B | support sound
EZVIZ | C3S | `rtsp://admin:pass@192.168.1.123:554/h264/ch01/main/av_stream` and `/h264/ch01/sub/av_stream`
Hikvision | DS-2CD2T47G1-L, DS-2CD1321-I, DS-2CD2143G0-IS | `rtsp://user:pass@192.168.1.123:554/ISAPI/Streaming/Channels/102`
Reolink | RLC-410, RLC-410W, E1 Pro, 4505MP |
Sonoff | GK-200MP2-B | support sound and [PTZ](https://github.com/AlexxIT/SonoffLAN#sonoff-gk-200mp2-b-camera), `rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0` and `/av_stream/ch1`
TP-Link | Tapo C200 |
Wyze | Cam v2 | support sound
Xiaomi | Dafang | [with hack](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks), `rtsp://192.168.1.123:8554/unicast` <br> Video: H264, size: 1920x1080, bitrate: 1000, format: VBR, frame rate: 10 <br> Audio: PCMU, rate in: 8000, rate out: 44100
Yi | Hi3518e Chipset | [with hack](https://github.com/alienatedsec/yi-hack-v5)
Yi | MStar Infinity Chipset | [with hack](https://github.com/roleoroleo/yi-hack-MStar)

## Debug

Add to your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.webrtc: debug
```