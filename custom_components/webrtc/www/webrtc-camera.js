class WebRTCCamera extends HTMLElement {
    async exchangeSDP(hass, pc) {
        let data;
        try {
            data = await hass.callWS({
                type: 'webrtc/stream',
                url: this.config.url || null,
                entity: this.config.entity || null,
                sdp64: btoa(pc.localDescription.sdp)
            });
        } catch (e) {
            data = {error: JSON.stringify(e)}
        }

        if (typeof data.sdp64 !== 'undefined') {
            // remove docker IP-address
            const sdp = atob(data.sdp64).replace(
                /a=candidate.+? 172\.\d+\.\d+\.1 .+?\r\n/g, ''
            );

            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: sdp
            }));

            // check external IP-address
            this.status = (sdp.indexOf(' typ srflx ') > 0)
                ? "Trying to connect"
                : "Trying to connect over LAN";
        } else {
            this.status = (typeof data.error !== 'undefined')
                ? `ERROR: ${data.error}`
                : "ERROR: Empty response from Hass";

            setTimeout(async () => {
                this.status = "Restart connection";

                await this.exchangeSDP(hass, pc);
            }, 10000);
        }
    }

    async initConnection(hass) {
        const pc = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302']
            }],
            iceCandidatePoolSize: 20
        });

        pc.onicecandidate = async (ev) => {
            if (ev.candidate) return;

            try {
                // only for debug purpose
                const iceTransport = pc.getSenders()[0].transport.iceTransport;
                iceTransport.onselectedcandidatepairchange = () => {
                    const pair = iceTransport.getSelectedCandidatePair();
                    const type = pair.remote.type === 'host' ? 'LAN' : 'WAN';
                    this.status = `Connecting over ${type}`;
                }
            } catch (e) {
                // Hi to Safari and Firefox...
            }

            this.status = "Trying to start stream";

            await this.exchangeSDP(hass, pc);
        }

        pc.ontrack = (ev) => {
            const video = this.getElementsByTagName('video')[0];
            if (video.srcObject === null) {
                video.srcObject = ev.streams[0];
            } else {
                video.srcObject.addTrack(ev.track);
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

        await pc.setLocalDescription(await pc.createOffer());
    }

    set status(value) {
        const header = this.getElementsByClassName("header")[0];
        header.innerText = value;
        header.style.display = value ? 'block' : 'none';
    }

    renderCustomGUI(card) {
        const video = this.getElementsByTagName('video')[0];
        video.controls = false;
        video.style.pointerEvents = 'none';

        const spinner = document.createElement('ha-circular-progress');
        spinner.active = true;
        spinner.className = 'spinner'
        card.appendChild(spinner);

        const pause = document.createElement('ha-icon');
        pause.className = 'pause';
        pause.icon = 'mdi:pause';
        pause.onclick = () => {
            if (video.paused) {
                video.play().then(() => null, () => null);
            } else {
                video.pause();
            }
        };
        card.appendChild(pause);

        const fullscreen = document.createElement('ha-icon');
        fullscreen.className = 'fullscreen';
        fullscreen.icon = 'mdi:fullscreen';
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

        video.addEventListener('loadeddata', () => {
            if (video.srcObject.getAudioTracks().length) {
                const volume = document.createElement('ha-icon');
                volume.className = 'volume';
                volume.icon = 'mdi:volume-mute';
                volume.onclick = () => {
                    video.muted = !video.muted;
                };
                card.appendChild(volume);

                video.onvolumechange = () => {
                    volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
                };
            }
            pause.style.display = 'block';
        });
        video.onpause = () => {
            pause.icon = 'mdi:play';
            this.setPTZVisibility(false);
        };
        video.onplay = () => {
            pause.icon = 'mdi:pause';
            this.setPTZVisibility(true);
        };
        video.onwaiting = () => {
            spinner.style.display = 'block';
            this.setPTZVisibility(false);
        };
        video.onplaying = () => {
            spinner.style.display = 'none';
            this.setPTZVisibility(true);
        };
    }

    renderPTZ(card, hass) {
        const ptz = document.createElement('div');
        ptz.className = 'ptz'
        ptz.style.opacity = this.config.ptz.opacity || '0.4';
        ptz.innerHTML = `
            <ha-icon class="right" icon="mdi:arrow-right"></ha-icon>
            <ha-icon class="left" icon="mdi:arrow-left"></ha-icon>
            <ha-icon class="up" icon="mdi:arrow-up"></ha-icon>
            <ha-icon class="down" icon="mdi:arrow-down"></ha-icon>
        `;
        card.appendChild(ptz);

        const handlePTZ = (ev) => {
            const [domain, service] = this.config.ptz.service.split('.', 2);
            const data = this.config.ptz['data_' + ev.target.className];
            if (data) {
                hass.callService(domain, service, data);
            }
        }

        const buttons = ptz.getElementsByTagName('ha-icon');
        Array.from(buttons).forEach(function (el) {
            el.addEventListener('click', handlePTZ);
        });
    }

    async renderGUI(hass) {
        const style = document.createElement('style');
        style.textContent = `
            ha-card {
                display: flex;
                margin: auto;
                overflow: hidden;
                width: 100%;
                position: relative;
            }
            video, .fix-safari {
                width: 100%;
                display: block;
                z-index: 0;
            }
            .box {
                position: absolute;
                left: 0px;
                right: 0px;
                top: 0px;
                background-color: var( --ha-picture-card-background-color, rgba(0, 0, 0, 0.3) );
            }
            .header {
                color: var(--ha-picture-card-text-color, white);
                margin: 14px 16px;
                font-size: 16px;
                font-weight: 500;
                line-height: 20px;
                word-wrap: break-word;
            }
            .spinner {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                --mdc-theme-primary: white;
            }
            ha-icon {
                color: white;
                position: absolute;
                cursor: pointer;
            }
            .pause {
                right: 5px;
                bottom: 5px;
                display: none;
            }
            .fullscreen {
                left: 5px;
                bottom: 5px;
            }
            .volume {
                right: 35px;
                bottom: 5px;
            }
            .ptz {
                position: absolute;
                top: 50%;
                right: 10px;
                transform: translateY(-50%);
                background-color: var( --ha-picture-card-background-color, rgba(0, 0, 0, 0.3) );
                transition: opacity .3s ease-in-out;
                display: none;
                z-index: 10;
                border-radius: 50%;
                width: 80px;
                height: 80px;
            }
            .show {
                display: block;
            }
            .ptz:hover {
                opacity: 1 !important;
            }
            .up {
                top: 5px;
                left: 50%;
                transform: translateX(-50%);
            }
            .down {
                bottom: 5px;
                left: 50%;
                transform: translateX(-50%);
            }
            .left {
                left: 5px;
                top: 50%;
                transform: translateY(-50%);
            }
            .right {
                right: 5px;
                top: 50%;
                transform: translateY(-50%);
            }
        `;
        this.appendChild(style);

        const card = document.createElement('ha-card');
        card.innerHTML = `
            <div class="fix-safari">
                <video id="video"
                    autoplay="true"
                    controls="true"
                    muted="true"
                    playsinline="true"
                    poster="${this.config.poster || ''}">
                </video>
            </div>
            <div class="box">
                <div class="header"></div>
            </div>
        `;
        this.appendChild(card);

        const video = this.getElementsByTagName('video')[0];

        video.onstalled = video.onerror = () => {
            video.srcObject = new MediaStream(video.srcObject.getTracks());
            video.play().then(() => null, () => null);
        };

        video.onloadeddata = () => {
            if (video.readyState >= 1) {
                this.status = this.config.title || '';
                this.setPTZVisibility(true);
            } else {
                this.setPTZVisibility(false);
            }
        }

        video.onpause = () => {
            this.setPTZVisibility(false);
        };

        video.onplay = () => {
            this.setPTZVisibility(true);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        video.play().then(() => null, () => null);
                    } else {
                        video.pause();
                    }
                });
            },
            {threshold: this.config.intersection || 0.5}
        );
        observer.observe(video);

        if (this.config.ui) {
            this.renderCustomGUI(card);
        }

        if (this.config.ptz) {
            this.renderPTZ(card, hass);
        }
    }

    set hass(hass) {
        if (this.firstChild || typeof this.config === 'undefined') return;

        this.renderGUI(hass).then(async () => {
            this.status = "Init connection";
            await this.initConnection(hass);
        });
    }

    setPTZVisibility(show) {
        const ptz = this.getElementsByClassName('ptz')[0];
        if (ptz) {
            if (show) {
                ptz.classList.add('show');
            } else {
                ptz.classList.remove('show');
            }
        }
    }

    setConfig(config) {
        if (typeof config.url !== 'string' && typeof config.entity !== 'string') {
            throw new Error('Missing `url` or `entity`');
        }

        // this integraion https://github.com/thomasloven/hass-fontawesome
        // breaks the `!!window.opera` check in all browsers
        const isOpera = (!!window.opr && !!opr.addons) || navigator.userAgent.indexOf(' OPR/') >= 0;
        if (isOpera) {
            throw new Error("Opera doesn't supported");
        }

        if (config.ptz && !config.ptz.service) {
            throw new Error("Missing `service` for `ptz`");
        }

        this.config = config;
    }

    getCardSize() {
        return 5;
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
