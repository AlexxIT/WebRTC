# WebRTC Camera

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/hacs/integration)
![](https://img.shields.io/github/stars/AlexxIT/WebRTC?style=flat-square&logo=github) 
![](https://img.shields.io/github/forks/AlexxIT/WebRTC?style=flat-square&logo=github) 

[Home Assistant](https://www.home-assistant.io/) custom component for viewing almost any camera stream in real time using [WebRTC](https://en.wikipedia.org/wiki/WebRTC) and other technologies.

**Starting with version 3** the streaming server has been changed from [RTSPtoWebRTC](https://github.com/deepch/RTSPtoWebRTC) to [go2rtc](https://github.com/AlexxIT/go2rtc).

---

<!-- TOC -->
* [go2rtc](#go2rtc)
* [Installation](#installation)
* [Configuration](#configuration)
* [Custom card](#custom-card)
* [Snapshots to Telegram](#snapshots-to-telegram)
* [Cast or share stream](#cast-or-share-stream)
* [Stream to camera](#stream-to-camera)
* [FAQ](#faq)
* [Debug](#debug)
* [Known work cameras](#known-work-cameras)
<!-- TOC -->

## go2rtc

![](https://img.shields.io/github/stars/AlexxIT/go2rtc?style=flat-square&logo=github) 
![](https://img.shields.io/docker/pulls/alexxit/go2rtc?style=flat-square&logo=docker&logoColor=white&label=pulls)
![](https://img.shields.io/github/downloads/AlexxIT/go2rtc/total?color=blue&style=flat-square&logo=github)  

This component uses the [go2rtc](https://github.com/AlexxIT/go2rtc) application as streaming server:

- lowest possible streaming latency for many supported protocols
- streaming from RTSP, RTMP, HTTP (FLV/MJPEG/JPEG), HomeKit Cameras, USB Cameras and other sources
- streaming to RTSP, WebRTC, MSE/MP4 or MJPEG
- support popular codec H264/H265, AAC, PCMU/PCMA, OPUS
- on the fly transcoding for unsupported codecs via FFmpeg
- autoselect streaming technology based on stream codecs, browser capabilities, network configuration

**Read more in the go2rtc [docs](https://github.com/AlexxIT/go2rtc)!**

You can install go2rtc in several ways:

1. **Basic users** - this component will automatically download and run the latest version of go2rtc, you don't need to do anything yourself.
2. **Advanced users** - install the [go2rtc](https://github.com/AlexxIT/go2rtc#go2rtc-home-assistant-add-on) or [Frigate 12+](https://docs.frigate.video/) add-on.
3. **Hakers** - install go2rtc as [binary](https://github.com/AlexxIT/go2rtc#go2rtc-binary) or [Docker](https://github.com/AlexxIT/go2rtc#go2rtc-docker) on any server in LAN.

You can change the go2rtc settings by adding the `go2rtc.yaml` file to your Hass configuration folder.

**Important.** go2rtc runs its own web interface on port `1984` without a password. There you can see a list of active streams from cameras. And anyone on your LAN can access them without password. You can disable this in the go2rtc config.

**PS.** There is also another nice card with go2rtc support - [Frigate Lovelace Card](https://github.com/dermotduffy/frigate-hass-card).

## Installation

**Method 1.** [HACS](https://hacs.xyz/) > Integrations > Plus > **WebRTC** > Install

**Method 2.** Manually copy `webrtc` folder from [latest release](https://github.com/AlexxIT/WebRTC/releases/latest) to `/config/custom_components` folder.

<details>
  <summary>Additional steps if you are using the UI in YAML mode: add card to resources</summary>

  The `custom_card` will be automatically registered with the Home Assistant UI, except when you are managing the UI in YAML mode.
  If you are managing the UI in YAML mode then add this to your UI resources for the `custom:webrtc-camera` card to work:
  ```yaml
  url: /webrtc/webrtc-camera.js
  type: module
  ```
  - Refresh your browser 

</details>

## Configuration

Settings > Devices & Services > Add Integration > **WebRTC**

If the integration is not in the list, you need to clear the browser cache.

Component **doesn't create devices and entities**. It creates only two services and lovelace custom card.

## Custom card

As a `url` you can use any protocol supported in go2rtc or specify the stream name from the go2rtc config.  
As a `entity` you can use almost any camera from Hass.

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

ui: true  # custom video controls, default false
digital_ptz:
  touch_drag_pan: false # can interfere with scrolling
  touch_tap_drag_zoom: false # can interfere with scrolling
  mouse_drag_pan: true
  mouse_wheel_zoom: true
  mouse_double_click_zoom: true
  touch_pinch_zoom: true
  touch_double_tap_zoom: true
  persist: true # zoom factor and viewport position survive page reloads
title: My super camera  # optional card title
poster: https://home-assistant.io/images/cast/splash.png  # still image when stream is loading
muted: true  # disable sound, default false

intersection: 0.75  # auto stop stream when less than 75% of video element is in the screen, 50% by default
background: true  # run stream when not displayed (ex. for quick video loading), default false

shortcuts: # custom shortcuts, default none
- name: Record
  icon: mdi:record-circle-outline
  service: switch.toggle
  service_data:
    entity_id: switch.camera_record

mode: webrtc,mse,mp4,mjpeg
```

Pan, tilt, zoom controls: [PTZ config examples](https://github.com/AlexxIT/WebRTC/wiki/PTZ-Config-Examples).

**Video aspect ratio** [issue](https://github.com/AlexxIT/WebRTC/issues/21)

```yaml
style: "video {aspect-ratio: 16/9; object-fit: fill;}"
```

**Video rotation**

1. On client (free CPU):

```yaml
style: 'video {transform: rotate(90deg); aspect-ratio: 1}'
```

2. On server - [FFmpeg transcoding](https://github.com/AlexxIT/go2rtc#source-ffmpeg) (high CPU cost)

**Shortcuts position**

```yaml
style: ".shortcuts {left: unset; top: 25px; right: 5px; display: flex; flex-direction: column}"
```

**Hide mode label**

```yaml
style: '.mode {display: none}'
```

**Move mode label**

```yaml
style: '.header {bottom: 6px} .mode {position: absolute; bottom: 0px}'
```

**Move header line**

```yaml
style: '.header {top: unset; bottom: 6px}'
```

## Snapshots to Telegram

[read more](https://github.com/AlexxIT/go2rtc/wiki/Snapshot-to-Telegram)

## Cast or share stream

Component support streaming to [Google Cast](https://www.home-assistant.io/integrations/cast/) Chromecast devices (including Android TV and Google Smart Screen). Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

Also component support creating a temporary or permanent link to a stream without sharing access to you Home Assistant. Read more in [wiki](https://github.com/AlexxIT/WebRTC/wiki/Cast-or-share-camera-stream).

## Stream to camera

go2rtc support play audio files (ex. [music](https://www.home-assistant.io/integrations/media_source/) or [TTS](https://www.home-assistant.io/integrations/#text-to-speech)) and live streams (ex. radio) on cameras with [two way audio](https://github.com/AlexxIT/go2rtc#two-way-audio) support. You need to:

1. Check if your camera has supported [two way audio](https://github.com/AlexxIT/go2rtc#two-way-audio) source
2. Setup camera stream in [go2rtc.yaml config](https://github.com/AlexxIT/go2rtc#configuration)
3. Check audio codec, that your [camera supports](https://github.com/AlexxIT/go2rtc#stream-to-camera)
4. Create virtual [Media Players](https://www.home-assistant.io/integrations/media_player/) for your cameras in `configuration.yaml`:

```yaml
media_player:
  - platform: webrtc
    name: Dahua Camera
    stream: dahua
    audio: pcmu/48000
  - platform: webrtc
    name: Tapo Camera
    stream: tapo
    audio: pcma
```

## FAQ

**Q. Exernal access with WebRTC doesn't work**  
A. [Read more](https://github.com/AlexxIT/WebRTC/issues/378) and don't create new issues.

**Q. Audio doesn't work**  
A. Check what audio codec your camera outputs. And what technology do you use to watch videos. Different technologies support different codecs.

**Q. External access on the iPhone not in real time**  
A. The iPhone browser does not support [modern web technologies](https://caniuse.com/mediasource). It's hard to believe, but it's true. If you haven't setup external access for WebRTC - you will get a chopped stream of keyframes in MP4 format.

**Q. Stream in macOS app not in real time**  
A. Support for modern web technologies is blocked in the macOS app. You will get a chopped stream of keyframes in MP4 format.

## Debug

Add to your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.webrtc: debug
```

## Known work cameras

| Brand          | Models                                                | Comment                                                                                                                                                                                                                              |
|----------------|-------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ActiveCam      | AC-D2121IR3                                           |                                                                                                                                                                                                                                      |
| ActiveCam      | AC-D7121IR1W                                          | support sound                                                                                                                                                                                                                        |
| Android        | [IP Webcam Pro][1]                                    | support sound, `rtsp://192.168.1.123:8080/h264_ulaw.sdp`                                                                                                                                                                             |
| Dahua          | DH-IPC-HDPW1431FP-AS-0280B, VTO2211G-P                | support sound                                                                                                                                                                                                                        |
| Dahua          | VTO2202F-P-S2                                         | [read more](https://github.com/blakeblackshear/frigate/discussions/2572)                                                                                                                                                             |
| EZVIZ          | C3S                                                   | `rtsp://admin:pass@192.168.1.123:554/h264/ch01/main/av_stream` and `/h264/ch01/sub/av_stream`                                                                                                                                        |
| EZVIZ          | C3W, C3WN, C6CN, C6T                                  | `rtsp://admin:pass@192.168.1.123:554/h264_stream`                                                                                                                                                                                    |
| EZVIZ          | C8C                                                   | `rtsp://admin:pass@192.168.1.123:554/channel80`                                                                                                                                                                                      |
| Foscam         | C1                                                    | `rtsp://user:pass@192.168.1.123:554/videoMain`                                                                                                                                                                                       |
| Foscam         | C2M, R2M                                              | `rtsp://user:pass@192.168.1.123:88/videoMain`                                                                                                                                                                                        |
| GW Security    | GW5088IP                                              | `rtsp://192.168.1.123:554/mpeg4cif?username=admin&password=123456`                                                                                                                                                                   |
| GW Security    | GW5078IP                                              | `rtsp://192.168.1.123:554/stream0?username=admin&password=123456`                                                                                                                                                                    |
| GW Security    | GW5071IP                                              | Not working yet, something similar to `rtsp://admin:123456@192.168.0.207:554/live/main` or `rtsp://192.168.0.207:554/live/main?username=admin&password=123456`                                                                       |
| Hikvision      | DS-2CD2T47G1-L, DS-2CD1321-I, DS-2CD2143G0-IS         | `rtsp://user:pass@192.168.1.123:554/ISAPI/Streaming/Channels/102`                                                                                                                                                                    |
| Hikvision      | IPC-HDW3849H-AS-PV, IPC-EW5531-AS                     | wired to nvr DHI-NVR2108HS-8P-I using [custom component](https://github.com/rroller/dahua)                                                                                                                                           |
| Imou           | IPC-F42-B2E3 (Bullet 2C 4MP)                          | `rtsp://admin:password@192.168.1.123:554/cam/realmonitor?channel=1&subtype=0`                                                                                                                               |
| QNAP           | QUSBCam2                                              | `rtsp://username:password@192.168.1.123:554/channel1` [docs](https://www.qnap.com/en/how-to/faq/article/what-is-the-qusbcam2-rtsp-url-format)                                                                                        |
| Raspberry Pi   | PiCam                                                 | [read more](https://github.com/AlexxIT/WebRTC/issues/261)                                                                                                                                                                            |
| Reolink        | RLC-410, RLC-410W, RLC-510WA, E1 Pro, E1 Zoom, 4505MP | RLC-510WA support sound, E1 Zoom support sound, PTZ and zoom                                                                                                                                                                         |
| Reolink        | E1                                                    | `rtsp://admin:password@192.168.1.123:554/h264Preview_01_main`                                                                                                                                                                        |
| Sonoff         | GK-200MP2-B                                           | support sound and [PTZ](https://github.com/AlexxIT/SonoffLAN#sonoff-gk-200mp2-b-camera), `rtsp://rtsp:12345678@192.168.1.123:554/av_stream/ch0` and `/av_stream/ch1`                                                                 |
| SriHome        | SH035                                                 | `rtsp://192.168.xxx.xxx:8554/profile0` and `/profile1` and `/profile2`                                                                                                                                                               |
| TP-Link        | Tapo C100/C200/C310                                   | `rtsp://user:pass@192.168.1.123:554/stream1` and `/stream2`                                                                                                                                                                          |
| Unifi          | G4 Dome, G3 Bullet, G3 Flex                           |                                                                                                                                                                                                                                      |
| Wyze           | Cam v2/v3, Cam Pan v1/v2                                    | support sound                                                                                                                                                                                                                        |
| Xiaomi         | Dafang                                                | [with hack](https://github.com/EliasKotlyar/Xiaomi-Dafang-Hacks), `rtsp://192.168.1.123:8554/unicast` <br> Video: H264, size: 1920x1080, bitrate: 1000, format: VBR, frame rate: 10 <br> Audio: PCMU, rate in: 8000, rate out: 44100 |
| Yi             | Hi3518e Chipset                                       | [with hack](https://github.com/alienatedsec/yi-hack-v5)                                                                                                                                                                              |
| Yi             | MStar Infinity Chipset                                | [with hack](https://github.com/roleoroleo/yi-hack-MStar)                                                                                                                                                                             |

[1]: https://play.google.com/store/apps/details?id=com.pas.webcam.pro
