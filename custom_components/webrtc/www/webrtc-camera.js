class WebRTCCamera extends HTMLElement {
    static get properties() {
        return {
            hass: {},
            config: {}
        }
    }

    async _connect(hass, pc) {
        const data = await hass.callWS({
            type: 'webrtc/stream',
            url: this.config.url,
            sdp64: btoa(pc.localDescription.sdp)
        });

        try {
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: atob(data.sdp64)
            });
            await pc.setRemoteDescription(remoteDesc);
        } catch (e) {
            console.warn(e);
        }
    }

    async _init(hass) {
        // don't know if this may happen
        if (typeof (this.config) === 'undefined') {
            this.config = {}
        }

        const pc = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302']
            }],
            iceCandidatePoolSize: 20
        });

        pc.onicecandidate = (e) => {
            if (e.candidate === null) {
                this._connect(hass, pc);
            }
        }

        pc.ontrack = (event) => {
            if (this.video.srcObject === null) {
                this.video.srcObject = event.streams[0];
            } else {
                this.video.srcObject.addTrack(event.track);
            }
        }

        pc.onconnectionstatechange = async (ev) => {
            // https://developer.mozilla.org/en-US/docs/Web/API/RTCOfferOptions/iceRestart
            console.debug("Connection state:", pc.connectionState);
            if (pc.connectionState === 'failed') {
                // version1
                // const offer = await pc.createOffer({iceRestart: true})
                // await pc.setLocalDescription(offer);

                // version2 - works better when 1, less reconnect tries
                pc.close();
                this.video.srcObject = null;
                await this._init(hass);
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

    _ui(card) {
        this.style.display = 'flex';
        card.style.margin = 'auto';
        card.style.width = '100%';

        this.video.controls = false;
        this.video.style.pointerEvents = 'none';

        const spinner = document.createElement('ha-circular-progress');
        spinner.active = true;
        spinner.style.position = 'absolute';
        spinner.style.top = '50%';
        spinner.style.left = '50%';
        spinner.style.transform = 'translate(-50%, -50%)';
        spinner.style.setProperty('--mdc-theme-primary', 'var(--primary-text-color)');
        card.appendChild(spinner);

        const pause = document.createElement('ha-icon');
        pause.icon = 'mdi:pause';
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

        this.video.onloadeddata = () => {
            if (this.video.srcObject.getAudioTracks().length) {
                const volume = document.createElement('ha-icon');
                volume.icon = 'mdi:volume-mute';
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
        };
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
            const video = document.createElement('video');
            video.autoplay = true;
            video.controls = true;
            video.volume = 1;
            video.muted = true;
            video.playsInline = true;
            video.poster = this.config.poster || '';
            video.style.width = '100%';
            video.style.display = 'block';

            const recover = () => {
                video.srcObject = new MediaStream(video.srcObject.getTracks());
                video.play();
            };
            video.onstalled = recover;
            video.onerror = recover;

            this.video = video;

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
            // card.header = 'WebRTC Card';
            card.style.overflow = 'hidden';
            card.appendChild(video);
            this.appendChild(card);

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
