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

        if (data) {
            const remoteDesc = new RTCSessionDescription({
                type: 'answer',
                sdp: atob(data.sdp64)
            });
            await pc.setRemoteDescription(remoteDesc);

            const m = atob(data.sdp64).match(/([\d.]+ \d+) typ [sp]rflx/);
            return m !== null;
        } else {
            return null;
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

        pc.onicecandidate = async (e) => {
            if (e.candidate === null) {
                // only for debug purpose
                const iceTransport = pc.getSenders()[0].transport.iceTransport;
                iceTransport.onselectedcandidatepairchange = ev => {
                    const pair = iceTransport.getSelectedCandidatePair();
                    this.status = `Connecting to: ${pair.remote.address} ${pair.remote.port}`;
                }

                this.status = "Try to start stream";
                const hasPublicIP = await this._connect(hass, pc);
                if (hasPublicIP === true) {
                    // everything is fine, waiting for the connection
                    this.status = "Try to connect (public)";
                } else if (hasPublicIP === false) {
                    // try to connect in parallel
                    this.status = "Try to connect (local)";
                } else if (hasPublicIP === null) {
                    this.status = "Reconnect in 10 seconds";
                    setTimeout(async () => {
                        this.status = "Restart connection";
                        await this._init(hass);
                    }, 10000);
                }
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
        this.div.innerText = value;
    }

    set hass(hass) {
        if (!this.video) {
            const video = this.video = document.createElement('video');
            video.autoplay = true;
            video.controls = true;
            video.muted = true;
            video.playsInline = true;
            video.poster = this.config.poster || '';
            video.style.width = '100%';
            video.style.display = 'block';

            video.onloadeddata = ev => {
                if (video.readyState === 4) {
                    this.status = '';
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
            // card.header = 'WebRTC Card';
            card.style.overflow = 'hidden';
            card.appendChild(video);
            this.appendChild(card);

            const status = this.div = document.createElement('div');
            card.appendChild(status);

            this.status = "Init connection";

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
