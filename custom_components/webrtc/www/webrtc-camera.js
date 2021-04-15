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
            // console.log('ontrack', event);
            this.stream.addTrack(event.track);
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

        pc.setLocalDescription(await pc.createOffer());
    }

    _render() {
        const card = document.createElement('ha-card');
        // card.header = 'WebRTC Card';
        card.style.overflow = 'hidden';

        const video = document.createElement('video');
        video.autoplay = true;
        video.controls = false;
        video.volume = 1;
        video.muted = true;
        video.playsInline = true;
        video.poster = this.config.poster || '';
        video.style.width = '100%';
        video.style.display = 'block';
        video.style.pointerEvents = 'none';
        video.srcObject = this.stream;
        card.appendChild(video);

        var spinner = document.createElement('ha-circular-progress');
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
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        };
        card.appendChild(pause);

        let volume;

        const recover = () => {
            video.srcObject = this.stream;
            video.play();
        };
        video.onpause = () => {
            pause.icon = 'mdi:play';
        };
        video.onplay = () => {
            pause.icon = 'mdi:pause';
        };
        video.onvolumechange = () => {
            volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
        };
        video.onloadeddata = () => {
            if (this.stream.getAudioTracks().length) {
                volume = document.createElement('ha-icon');
                volume.icon = 'mdi:volume-mute';
                volume.style.position = 'absolute';
                volume.style.right = '35px';
                volume.style.bottom = '5px';
                volume.style.cursor = 'pointer';
                volume.onclick = () => {
                    video.muted = !video.muted;
                };
                card.appendChild(volume);
            }
            pause.style.display = 'block';
        };
        video.onwaiting = () => {
            spinner.style.display = 'block';
        };
        video.onplaying = () => {
            spinner.style.display = 'none';
        };
        video.onstalled = recover;
        video.onerror = recover;

        const observer = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach((entry) => {
                    entry.isIntersecting ? video.play() : video.pause();
                });
            },
            {threshold: this.config.intersection || 0.5}
        );
        observer.observe(video);

        this.appendChild(card);
    }

    set hass(hass) {
        if (!this.stream) {
            this.stream = new MediaStream();
            this._render();
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
