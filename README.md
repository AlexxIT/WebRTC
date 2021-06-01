# WebRTC Camera

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)
[![Donate](https://img.shields.io/badge/donate-Coffee-yellow.svg)](https://www.buymeacoffee.com/AlexxIT)
[![Donate](https://img.shields.io/badge/donate-Yandex-red.svg)](https://money.yandex.ru/to/41001428278477)

Home Assistant custom component for viewing IP cameras [RTSP](https://en.wikipedia.org/wiki/Real_Time_Streaming_Protocol) stream in real time using [WebRTC](https://en.wikipedia.org/wiki/WebRTC) and [MSE](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) technology.

Based on:
- [Pion](https://github.com/pion/webrtc) - pure Go implementation of WebRTC
- [RTSPtoWebRTC](https://github.com/deepch/RTSPtoWebRTC) - Go app by [@deepch](https://github.com/deepch) and [@vdalex25](https://github.com/vdalex25)
- [RTSPtoWSMP4f](https://github.com/deepch/RTSPtoWSMP4f) - Go app by [@deepch](https://github.com/deepch) and [@vdalex25](https://github.com/vdalex25)

Starting with version 2 the component supports two protocols automatically and simultaneously. WebRTC in some cases may not work with remote access, then the video will play using MSE. As soon as WebRTC is able to connect - video will play through it, MSE will be stopped.

Why WebRTC:
- works in any modern browser, even on mobiles
- the only browser technology with minimal camera stream delays (0.5 seconds and below)
- works well with unstable channel
- does not use transcoding and does not load the CPU
- support camera stream with sound

Pros, Cons and Browsers     | WebRTC                             | MSE
----------------------------|------------------------------------|-----------
Pros                        | best delay                         | good delay
Cons                        | complicated external access        | jumps over frames
Chrome, Firefox, Chromecast | video: H264<br />audio: PCMA, PCMU | video: H264<br />audio: AAC
Safari PC, iPadOS 13+       | video: H264<br />audio: PCMA, PCMU | video: H264, H265<br />audio: AAC
Safari iOS                  | video: H264<br />audio: PCMA, PCMU | doesn't supported
Opera PC                    | doesn't supported                  | video: H264<br />audio: AAC

- Home Assistant Mobile App for Android and iOS - has the same capabilities as the main mobile browser
- H264: AVC/H.264
- H265: HEVC/H.265 - not tested
- PCMA: G.711 PCM (A-law)
- PCMU: G.711 PCM (µ-law)

## FAQ

**Q. I can't see video stream**

- If your camera works with another integration - it **doesn’t mean** it will work with this integration
- If your camera works in VLC - it **doesn’t mean** it will work with this integration

In case of any problems, check:

1. Check that you have installed the integration on the "Configuration > Integrations" page
2. Check that you don't have any erros in "Configuration > Logs" page
3. Check if default video with Bunny works:

```yaml
type: 'custom:webrtc-camera'
url: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov'
```

If you are using an iPhone - also read the **Why is WebRTC not working?**, because your phone does not support MSE technology.

**Q. How to use secrets?**

A. You can't use `secrets.yaml` in lovelace card setting. But you can config [Generic](https://www.home-assistant.io/integrations/generic/) or [FFmpeg](https://www.home-assistant.io/integrations/camera.ffmpeg/) or [ONVIF](https://www.home-assistant.io/integrations/onvif/) or any [other camera](https://www.home-assistant.io/integrations/#camera). And use its entity in card config:

```yaml
type: 'custom:webrtc-camera'
entity: camera.generic_stream  # change to your camera entity_id
```

**Q. Error: Custom element doesn't exist: webrtc-camera.**

A. Component automatically adds custom card `/webrtc/webrtc-camera.js` to your resources.

Check if you install component in "Integrations" page. And try to clear your browser cache. Also, you can try to add this card to your resources manually.

**Q. Why is WebRTC not working?**

- Check the **I can't see video stream**
- Check that you are on the same network as your Hass server
- Check that you don't setup Hass server with forward only 8123 port (users with Virtual Machine or Docker installation or firewall), because WebRTC using random UDP ports for video streaming

**Q. Exernal access with WebRTC doesn't work**

A. WebRTC technology can't use your HTTP/HTTPS-access to Hass. It uses a random UDP port to connect. And it can handle access to stream even if you have [private IP-address](https://help.keenetic.com/hc/en-us/articles/213965789), but not in all cases.

At each start of the streaming, a random UDP port is occupied. The port is released when the streaming ends. The data should theoretically be encrypted, but I haven't tested :)

If your stream does not start with an external connection, you may be behind a [symmetric NAT](https://en.wikipedia.org/wiki/Network_address_translation#Symmetric_NAT).

Read how to [fix this](#webrtc-external-access).

For more tech info read about [STUN](https://en.wikipedia.org/wiki/STUN) and [UDP hole punching](https://en.wikipedia.org/wiki/UDP_hole_punching).

## Install

You can install component with [HACS](https://hacs.xyz/) custom repo: HACS > Integrations > 3 dots (upper top corner) > Custom repositories > URL: `AlexxIT/WebRTC` > Category: Integration

Or manually copy `webrtc` folder from [latest release](https://github.com/AlexxIT/WebRTC/releases/latest) to `custom_components` folder in your config folder.

## Config

**Video DEMO**

[![WebRTC Camera real time streaming component for Home Assistant](https://img.youtube.com/vi/2otE2dc6OAA/mqdefault.jpg)](https://www.youtube.com/watch?v=2otE2dc6OAA)

With GUI. Configuration > Integration > Add Integration > WebRTC Camera.

If the integration is not in the list, you need to clear the browser cache.

Component **doesn't create devices and entities**. It creates only two services and lovelace custom card:

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
muted: false  # disable sound, default true
ui: true  # custom video controls, default false
should_run_in_background: true # makes the component run when not displayed (ex. for quick video loading), default false

ptz:  # check full examples in wiki

mse: false  # disable MSE mode, if you want save NabuCasa traffic 
webrtc: false  # disable WebRTC mode, if you want stream with AAC sound
```

Pan, tilt, zoom controls: [PTZ config examples](https://github.com/AlexxIT/WebRTC/wiki/PTZ-Config-Examples).

## Cast or share stream

Component support streaming to [Google Cast](https://www.home-assistant.io/integrations/cast/) Chromecast devices (including Android TV and Google Smart Screen). Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

Also component support creating a temporary or permanent link to a stream without sharing access to you Home Assistant. Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

## Known work cameras

Brand | Models | Comment
------|--------|--------
ActiveCam | AC-D2121IR3 |
ActiveCam | AC-D7121IR1W | support sound
Android | [IP Webcam Pro](https://play.google.com/store/apps/details?id=com.pas.webcam.pro) | support sound, `rtsp://192.168.1.123:8080/h264_ulaw.sdp`
Dahua | DH-IPC-HDPW1431FP-AS-0280B | support sound
EZVIZ | C3S | `rtsp://admin:pass@192.168.1.123:554/h264/ch01/main/av_stream` and `/h264/ch01/sub/av_stream`
Foscam | C1 | `rtsp://user:pass@192.168.1.123:554/videoMain`
Hikvision | DS-2CD2T47G1-L, DS-2CD1321-I, DS-2CD2143G0-IS | `rtsp://user:pass@192.168.1.123:554/ISAPI/Streaming/Channels/102`
Reolink | RLC-410, RLC-410W, E1 Pro, 4505MP |
Sonoff | GK-200MP2-B | support sound and [PTZ](https://github.com/AlexxIT/SonoffLAN#sonoff-gk-200mp2-b-camera), `rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0` and `/av_stream/ch1`
TP-Link | Tapo C200 |
Wyze | Cam v2 | support sound
Xiaomi | Dafang | [with hack](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks), `rtsp://192.168.1.123:8554/unicast` <br> Video: H264, size: 1920x1080, bitrate: 1000, format: VBR, frame rate: 10 <br> Audio: PCMU, rate in: 8000, rate out: 44100
Yi | Hi3518e Chipset | [with hack](https://github.com/alienatedsec/yi-hack-v5)
Yi | MStar Infinity Chipset | [with hack](https://github.com/roleoroleo/yi-hack-MStar)

## WebRTC external access

How to fix external access if it doesn't works?

**1. Easy tech way**

Don't do anything. The component will automatically use MSE technology instead of WebRTC. It will definitely work with external access. But it doesn't work on iPhones.

**2. Medium tech way**

If you have [public IP-address](https://help.keenetic.com/hc/en-us/articles/213965789), you can:

- go to "Configuration > Integrations > WebRTC Camera > Options" and select the list of ports as you like (e.g. 50000-51000)
- you also need forward this **UDP port range** on your router
- it is recommended to use at least 10 ports per camera

**3. Hard tech way**

If you have [private IP-address](https://help.keenetic.com/hc/en-us/articles/213965789) and your own [VPS](https://en.wikipedia.org/wiki/Virtual_private_server), you can:

- install TURN server (e.g. [coturn](https://github.com/coturn/coturn), config [example](https://github.com/AlexxIT/WebRTC/wiki/Coturn-Example))
- add config to your cameras:

```yaml
type: 'custom:webrtc-camera'
entity: ...
ice_servers:
  - urls: 'stun:stun.l.google.com:19302'  # optional change to your STUN if you want
  - urls: 'turn:123.123.123.123:3478'  # change to your VPS IP and port
    username: your_user  # change to your username
    credential: your_pass  # change to your password
```

You need to use both TURN and STUN servers in your config.

## Status Icons

icon | description
-----|------------
![](https://api.iconify.design/mdi-download-network-outline.svg?height=24) | starting connection (MSE)  
![](https://api.iconify.design/mdi-play-network-outline.svg?height=24) | stream is played with MSE  
![](https://api.iconify.design/mdi-lan-pending.svg?height=24) | starting connection (WebRTC)  
![](https://api.iconify.design/mdi-lan-connect.svg?height=24) | connecting to remote (WebRTC)  
![](https://api.iconify.design/mdi-lan-check.svg?height=24) | loading video (WebRTC)  
![](https://api.iconify.design/mdi-lan-disconnect.svg?height=24) | restarting connection (WebRTC)  
![](https://api.iconify.design/mdi-webrtc.svg?height=24) | stream is played with WebRTC

## Debug

Add to your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.webrtc: debug
```
