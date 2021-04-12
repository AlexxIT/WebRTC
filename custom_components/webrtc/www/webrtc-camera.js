class WebRTCCamera extends HTMLElement {
    async _init(hass) {
        const pc = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302']
            }]
        });

        pc.onnegotiationneeded = async () => {
            // console.log('onnegotiationneeded');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const data = await hass.callWS({
                type: 'webrtc/stream',
                url: this.config.url,
                sdp64: btoa(pc.localDescription.sdp)
            });
            // console.log(data);

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

        pc.ontrack = (event) => {
            // console.log('ontrack', event);
            const el = document.createElement(event.track.kind);
            el.srcObject = event.streams[0];
            el.muted = true;
            el.autoplay = true;
            el.controls = true;
            el.style.width = '100%';
            this.content.appendChild(el);
        }

        // recvonly don't work with Firefox
        // "Answer tried to set recv when offer did not set send"
        pc.addTransceiver('video', {'direction': 'sendrecv'})
        if (this.config.audio !== false) {
            pc.addTransceiver('audio', {'direction': 'sendrecv'})
        }

        const pingChannel = pc.createDataChannel('foo');
        pingChannel.onopen = () => {
            setInterval(() => {
                try {
                    pingChannel.send('ping');
                } catch (e) {
                    console.warn(e);
                }
            }, 1000);
        }
    }

    set hass(hass) {
        if (!this.content) {
            this.content = document.createElement('div');

            const card = document.createElement('ha-card');
            // card.header = 'WebRTC Card';
            card.appendChild(this.content);

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