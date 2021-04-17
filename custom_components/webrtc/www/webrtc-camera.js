class WebRTCCamera extends HTMLElement {
    async _connect(hass, pc) {
        const data = await hass.callWS({
            type: 'webrtc/stream',
            url: this.config.url,
            sdp64: btoa(pc.localDescription.sdp)
        });

        if (data) {
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: atob(data.sdp64)
            });
            await pc.setRemoteDescription(remoteDesc);

            // check external IP-address
            const m = atob(data.sdp64).match(/([\d.]+ \d+) typ [sp]rflx/);
            return m !== null;
        } else {
            return null;
        }
    }

    async _init(hass) {
        // don't know if this may happen
        if (typeof this.config === 'undefined') {
            this.config = {}
        }

        const pc = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302']
            }],
            iceCandidatePoolSize: 20
        });

        pc.onicecandidate = async (ev) => {
            if (ev.candidate === null) {
                // only for debug purpose
                const iceTransport = pc.getSenders()[0].transport.iceTransport;
                iceTransport.onselectedcandidatepairchange = () => {
                    const pair = iceTransport.getSelectedCandidatePair();
                    this.status = `Connecting to: ${pair.remote.address} ${pair.remote.port}`;
                }

                this.status = "Trying to start stream";
                const hasPublicIP = await this._connect(hass, pc);
                if (hasPublicIP === true) {
                    // everything is fine, waiting for the connection
                    this.status = "Trying to connect";
                } else if (hasPublicIP === false) {
                    // try to connect in parallel
                    this.status = "Trying to connect over LAN";
                } else if (hasPublicIP === null) {
                    this.status = "Reconnect in 10 seconds";
                    setTimeout(async () => {
                        this.status = "Restart connection";
                        await this._init(hass);
                    }, 10000);
                }
            }
        }

        pc.ontrack = (ev) => {
            if (this.video.srcObject === null) {
                this.video.srcObject = ev.streams[0];
            } else {
                this.video.srcObject.addTrack(ev.track);
            }
        }

        pc.onconnectionstatechange = async (ev) => {
            // https://developer.mozilla.org/en-US/docs/Web/API/RTCOfferOptions/iceRestart
            // console.debug("Connection state:", pc.connectionState);
            if (pc.connectionState === 'failed') {
                // if we have not started a second connection
                this.status = "Restart connection";

                const offer = await pc.createOffer({iceRestart: true})
                await pc.setLocalDescription(offer);
            } else if (pc.connectionState === 'connected') {
                this.status = "Connected";
            }
        }

        // https://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
        const isFirefox = typeof InstallTrigger !== 'undefined';

        // recvonly don't work with Firefox
        // https://github.com/pion/webrtc/issues/717
        // sendrecv don't work with some Android mobile phones and tablets
        // and Firefox can't play video with Bunny even with sendrecv
        const direction = !isFirefox ? 'recvonly' : 'sendrecv';

        pc.addTransceiver('video', {'direction': direction});
        if (this.config.audio !== false) {
            pc.addTransceiver('audio', {'direction': direction});
        }

        const pingChannel = pc.createDataChannel('foo');
        let intervalId;
        pingChannel.onopen = () => {
            intervalId = setInterval(() => {
                try {
                    pingChannel.send('ping');
                } catch (e) {
                    console.warn(e);
                }
            }, 1000);
        }
        pingChannel.onclose = () => {
            clearInterval(intervalId);
        }

        await pc.setLocalDescription(await pc.createOffer());
    }

    set status(value) {
        this.header.innerText = value;
        this.header.style.display = value ? 'block' : 'none';
    }

    _ui(card) {
        this.video.controls = false;
        this.video.style.pointerEvents = 'none';

        const spinner = document.createElement('ha-circular-progress');
        spinner.active = true;
        spinner.style.position = 'absolute';
        spinner.style.top = '50%';
        spinner.style.left = '50%';
        spinner.style.transform = 'translate(-50%, -50%)';
        spinner.style.setProperty('--mdc-theme-primary', 'white');
        card.appendChild(spinner);

        const pause = document.createElement('ha-icon');
        pause.icon = 'mdi:pause';
        pause.style.color = 'white';
        pause.style.position = 'absolute';
        pause.style.right = '5px';
        pause.style.bottom = '5px';
        pause.style.cursor = 'pointer';
        pause.style.display = 'none';
        pause.onclick = () => {
            if (this.video.paused) {
                this.video.play();
            } else {
                this.video.pause();
            }
        };
        card.appendChild(pause);

        const fullscreen = document.createElement('ha-icon');
        fullscreen.icon = 'mdi:fullscreen';
        fullscreen.style.color = 'white';
        fullscreen.style.position = 'absolute';
        fullscreen.style.left = '5px';
        fullscreen.style.bottom = '5px';
        fullscreen.style.cursor = 'pointer';
        fullscreen.onclick = () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                this.requestFullscreen();
            }
        };
        card.appendChild(fullscreen);

        this.onfullscreenchange = () => {
            if (document.fullscreenElement) {
                fullscreen.icon = 'mdi:fullscreen-exit';
            } else {
                fullscreen.icon = 'mdi:fullscreen';
            }
        };

        this.video.addEventListener('loadeddata', () => {
            if (this.video.srcObject.getAudioTracks().length) {
                const volume = document.createElement('ha-icon');
                volume.icon = 'mdi:volume-mute';
                volume.style.color = 'white';
                volume.style.position = 'absolute';
                volume.style.right = '35px';
                volume.style.bottom = '5px';
                volume.style.cursor = 'pointer';
                volume.onclick = () => {
                    this.video.muted = !this.video.muted;
                };
                card.appendChild(volume);

                this.video.onvolumechange = () => {
                    volume.icon = this.video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
                };
            }
            pause.style.display = 'block';
        });
        this.video.onpause = () => {
            pause.icon = 'mdi:play';
        };
        this.video.onplay = () => {
            pause.icon = 'mdi:pause';
        };
        this.video.onwaiting = () => {
            spinner.style.display = 'block';
        };
        this.video.onplaying = () => {
            spinner.style.display = 'none';
        };
    }

    set hass(hass) {
        if (!this.video) {
            const video = this.video = document.createElement('video');
            video.autoplay = true;
            video.controls = true;
            video.volume = 1;
            video.muted = true;
            video.playsInline = true;
            video.poster = this.config.poster || '';
            video.style.width = '100%';
            video.style.display = 'block';

            video.onstalled = video.onerror = () => {
                video.srcObject = new MediaStream(video.srcObject.getTracks());
                video.play();
            };

            video.onloadeddata = () => {
                if (video.readyState === 4) {
                    this.status = this.config.title || '';
                }
            }

            const observer = new IntersectionObserver(
                (entries, observer) => {
                    entries.forEach((entry) => {
                        entry.isIntersecting ? video.play() : video.pause();
                    });
                },
                {threshold: this.config.intersection || 0.5}
            );
            observer.observe(video);

            const card = document.createElement('ha-card');
            card.style.margin = 'auto';
            card.style.overflow = 'hidden';
            card.style.width = '100%';
            card.appendChild(video);

            this.style.display = 'flex';
            this.appendChild(card);

            const box = document.createElement('div');
            box.style.position = 'absolute';
            box.style.left = '0px';
            box.style.right = '0px';
            box.style.top = '0px';
            box.style['background-color'] = 'var( --ha-picture-card-background-color, rgba(0, 0, 0, 0.3) )';
            card.appendChild(box)

            const header = this.header = document.createElement('div');
            header.style.color = 'var(--ha-picture-card-text-color, white)';
            header.style.margin = '4px 16px';
            header.style['font-size'] = '16px';
            header.style['font-weight'] = 500;
            header.style['line-height'] = '40px';
            box.appendChild(header);

            this.status = "Init connection";

            if (this.config.ui) {
                this._ui(card);
            }
            this._init(hass);
        }
    }

    setConfig(config) {
        if (!config.url) {
            throw new Error('Missing `url: "..."`');
        }
        this.config = config;
    }

    static getStubConfig() {
        return {
            url: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov'
        }
    }
}

customElements.define('webrtc-camera', WebRTCCamera);


window.customCards = window.customCards || [];
window.customCards.push({
    type: 'webrtc-camera',
    name: 'WebRTC Camera',
    preview: false,
    description: 'WebRTC Camera allows you to watch RTSP-camera stream without any delay',
});
