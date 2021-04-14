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
            // check that we got all the candidates
            if (e.candidate === null) {
                this._connect(hass, pc);
            }
        }

        pc.ontrack = (event) => {
            // console.log('ontrack', event);
            this.stream.addTrack(event.track);
        }

        // recvonly don't work with Firefox
        // https://github.com/pion/webrtc/issues/717
        // sendrecv don't work with some Android mobile phones and tablets
        // and Firefox can't play video with Bunny even with sendrecv
        const direction = this.config.firefox !== true ? 'recvonly' : 'sendrecv';

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

    set hass(hass) {
        if (!this.stream) {
            this.stream = new MediaStream();

            const video = document.createElement('video');
            video.autoplay = true;
            video.controls = true;
            video.muted = true;
            video.playsInline = true;
            video.poster = this.config.poster || '';
            video.style.width = '100%';
            video.style.display = 'block';
            video.srcObject = this.stream;

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
