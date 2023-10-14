/** Chrome 63+, Safari 11.1+ */
import {VideoRTC} from './video-rtc.js?v=1.8.0';
import {DigitalPTZ} from './digital-ptz.js?v=3.3.0';

class WebRTCCamera extends VideoRTC {
    /**
     * Step 1. Called by the Hass, when config changed.
     * @param {Object} config
     */
    setConfig(config) {
        if (!config.url && !config.entity && !config.streams) throw new Error('Missing `url` or `entity` or `streams`');

        if (config.background) this.background = config.background;

        if (config.intersection === 0) this.visibilityThreshold = 0;
        else this.visibilityThreshold = config.intersection || 0.75;

        /**
         * @type {{
         *     url: string,
         *     entity: string,
         *     mode: string,
         *     media: string,
         *
         *     streams: Array<{
         *         name: string,
         *         url: string,
         *         entity: string,
         *         mode: string,
         *         media: string,
         *     }>,
         *
         *     title: string,
         *     poster: string,
         *     muted: boolean,
         *     intersection: number,
         *     ui: boolean,
         *     style: string,
         *
         *     server: string,
         *
         *     mse: boolean,
         *     webrtc: boolean,
         *
         *     digital_ptz:{
         *         mouse_drag_pan: boolean,
         *         mouse_wheel_zoom: boolean,
         *         mouse_double_click_zoom: boolean,
         *         touch_pinch_zoom: boolean,
         *         touch_drag_pan: boolean,
         *         touch_tap_drag_zoom: boolean,
         *         persist: boolean|string,
         *     },
         *     ptz:{
         *         opacity: number|string,
         *         service: string,
         *         data_left, data_up, data_right, data_down, data_zoom_in, data_zoom_out, data_home
         *     },
         *     shortcuts:Array<{ name:string, icon:string }>,
         * }} config
         */
        this.config = Object.assign({
            mode: config.mse === false ? 'webrtc' : config.webrtc === false ? 'mse' : this.mode,
            media: this.media,
        }, config);

        if (!this.config.streams) {
            this.config.streams = [{url: config.url, entity: config.entity}];
        }

        this.streamID = -1;
        this.nextStream(false);
    }

    set hass(hass) {
        // if card in vertical stack - `hass` property assign after `onconnect`
        super.hass = hass;
        this.onconnect();
    }

    /**
     * Called by the Hass to calculate default card height.
     */
    getCardSize() {
        return 5; // x 50px
    }

    /**
     * Called by the Hass to get defaul card config
     * @return {{url: string}}
     */
    static getStubConfig() {
        return {'url': ''};
    }

    setStatus(mode, status) {
        const divMode = this.querySelector('.mode').innerText;
        if (mode === 'error' && divMode !== 'Loading..' && divMode !== 'Loading...') return;

        this.querySelector('.mode').innerText = mode;
        this.querySelector('.status').innerText = status || '';
    }

    /** @param reload {boolean} */
    nextStream(reload) {
        this.streamID = (this.streamID + 1) % this.config.streams.length;

        const stream = this.config.streams[this.streamID];
        this.config.url = stream.url;
        this.config.entity = stream.entity;
        this.mode = stream.mode || this.config.mode;
        this.media = stream.media || this.config.media;

        if (reload) {
            this.ondisconnect();
            setTimeout(() => this.onconnect(), 100); // wait ws.close event
        }
    }

    /** @return {string} */
    get streamName() {
        return this.config.streams[this.streamID].name || `S${this.streamID}`;
    }

    oninit() {
        super.oninit();
        this.renderMain();
        this.renderDigitalPTZ();
        this.renderPTZ();
        this.renderCustomUI();
        this.renderShortcuts();
        this.renderStyle();
    }

    onconnect() {
        if (!this.config || !this.hass) return false;
        if (!this.isConnected || this.ws || this.pc) return false;

        const divMode = this.querySelector('.mode').innerText;
        if (divMode === 'Loading..') return;

        this.setStatus('Loading..');

        this.hass.callWS({
            type: 'auth/sign_path', path: '/api/webrtc/ws'
        }).then(data => {
            this.wsURL = 'ws' + this.hass.hassUrl(data.path).substring(4);
            if (this.config.url) {
                this.wsURL += '&url=' + encodeURIComponent(this.config.url);
            }
            if (this.config.server) {
                this.wsURL += '&server=' + encodeURIComponent(this.config.server);
            }
            if (this.config.entity) {
                this.wsURL += '&entity=' + this.config.entity;
            }
            if (super.onconnect()) {
                this.setStatus('Loading...');
            } else {
                this.setStatus('error', 'unable to connect');
            }
        }).catch(er => {
            this.setStatus('error', er);
        });
    }

    onopen() {
        const result = super.onopen();

        this.onmessage['stream'] = msg => {
            switch (msg.type) {
                case 'error':
                    this.setStatus('error', msg.value);
                    break;
                case 'mse':
                case 'hls':
                case 'mp4':
                case 'mjpeg':
                    this.setStatus(msg.type.toUpperCase(), this.config.title || '');
                    break;
            }
        };

        return result;
    }

    onpcvideo(ev) {
        super.onpcvideo(ev);

        if (this.pcState !== WebSocket.CLOSED) {
            this.setStatus('RTC', this.config.title || '');
        }
    }

    renderMain() {
        const shadow = this.attachShadow({mode: 'open'});
        shadow.innerHTML = `
        <style>
            ha-card {
                width: 100%;
                height: 100%;
                margin: auto;
                overflow: hidden;
                position: relative;
            }
            ha-icon {
                color: white;
                cursor: pointer;
            }
            .player {
                background-color: black;
                height: 100%;
                position: relative; /* important for Safari */
            }
            .player:active {
                cursor: move; /* important for zoom-controller */
            }
            .player .ptz-transform {
                height: 100%;
            }
            .header {
                position: absolute;
                top: 6px;
                left: 10px;
                right: 10px;
                color: white;
                display: flex;
                justify-content: space-between;
                pointer-events: none;
            }
            .mode {
                cursor: pointer;
                opacity: 0.6;
                pointer-events: auto;
            }
        </style>
        <ha-card class="card">
            <div class="player">
                <div class="ptz-transform"></div>
            </div>
            <div class="header">
                <div class="status"></div>
                <div class="mode"></div>
            </div>
        </ha-card>
        `;

        this.querySelector = selectors => this.shadowRoot.querySelector(selectors);
        this.querySelector('.ptz-transform').appendChild(this.video);

        const mode = this.querySelector('.mode');
        mode.addEventListener('click', () => this.nextStream(true));

        if (this.config.muted) this.video.muted = true;
        if (this.config.poster) this.video.poster = this.config.poster;
    }

    renderDigitalPTZ() {
        if (this.config.digital_ptz === false) return;
        new DigitalPTZ(
            this.querySelector('.player'),
            this.querySelector('.player .ptz-transform'),
            this.video,
            Object.assign({}, this.config.digital_ptz, {persist_key: this.config.url})
        );
    }

    renderPTZ() {
        if (!this.config.ptz || !this.config.ptz.service) return;

        let hasMove = false;
        let hasZoom = false;
        let hasHome = false;
        for (const prefix of ['', '_start', '_end', '_long']) {
            hasMove = hasMove || this.config.ptz['data' + prefix + '_right'];
            hasMove = hasMove || this.config.ptz['data' + prefix + '_left'];
            hasMove = hasMove || this.config.ptz['data' + prefix + '_up'];
            hasMove = hasMove || this.config.ptz['data' + prefix + '_down'];

            hasZoom = hasZoom || this.config.ptz['data' + prefix + '_zoom_in'];
            hasZoom = hasZoom || this.config.ptz['data' + prefix + '_zoom_out'];

            hasHome = hasHome || this.config.ptz['data' + prefix + '_home'];
        }

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
            <style>
                .ptz {
                    position: absolute;
                    top: 50%;
                    right: 10px;
                    transform: translateY(-50%);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    transition: opacity .3s ease-in-out;
                    opacity: ${parseFloat(this.config.ptz.opacity) || 0.4};
                }
                .ptz:hover {
                    opacity: 1 !important;
                }
                .ptz-move {
                    position: relative;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 50%;
                    width: 80px;
                    height: 80px;
                    display: ${hasMove ? 'block' : 'none'};
                }
                .ptz-zoom {
                    position: relative;
                    width: 80px;
                    height: 40px;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                    display: ${hasZoom ? 'block' : 'none'};
                }
                .ptz-home {
                    position: relative;
                    width: 40px;
                    height: 40px;
                    background-color: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                    align-self: center;
                    display: ${hasHome ? 'block' : 'none'};
                }
                .up {
                    position: absolute;
                    top: 5px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .down {
                    position: absolute;
                    bottom: 5px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .left {
                    position: absolute;
                    left: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .right {
                    position: absolute;
                    right: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .zoom_out {
                    position: absolute;
                    left: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .zoom_in {
                    position: absolute;
                    right: 5px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .home {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
            </style>
        `);
        card.insertAdjacentHTML('beforeend', `
            <div class="ptz">
                <div class="ptz-move">
                    <ha-icon class="right" icon="mdi:arrow-right"></ha-icon>
                    <ha-icon class="left" icon="mdi:arrow-left"></ha-icon>
                    <ha-icon class="up" icon="mdi:arrow-up"></ha-icon>
                    <ha-icon class="down" icon="mdi:arrow-down"></ha-icon>
                </div>
                <div class="ptz-zoom">
                    <ha-icon class="zoom_in" icon="mdi:plus"></ha-icon>
                    <ha-icon class="zoom_out" icon="mdi:minus"></ha-icon>
                </div>
                <div class="ptz-home">
                    <ha-icon class="home" icon="mdi:home"></ha-icon>
                </div>
            </div>
        `);

        const handle = path => {
            const data = this.config.ptz['data_' + path];
            if (!data) return;
            const [domain, service] = this.config.ptz.service.split('.', 2);
            this.hass.callService(domain, service, data);
        };
        const ptz = this.querySelector('.ptz');
        for (const [start, end] of [['touchstart', 'touchend'], ['mousedown', 'mouseup']]) {
            ptz.addEventListener(start, startEvt => {
                const {className} = startEvt.target;
                startEvt.preventDefault();
                handle('start_' + className);
                window.addEventListener(end, endEvt => {
                    endEvt.preventDefault();
                    handle('end_' + className);
                    if (endEvt.timeStamp - startEvt.timeStamp > 400) {
                        handle('long_' + className);
                    } else {
                        handle(className);
                    }
                }, {once: true});
            });
        }
    }

    saveScreenshot() {
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        canvas.getContext('2d').drawImage(this.video, 0, 0, canvas.width, canvas.height);

        const ts = new Date().toISOString().substring(0, 19).replaceAll('-', '').replaceAll(':', '');
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/jpeg');
        a.download = `snapshot_${ts}.jpeg`;
        a.click();
    }

    renderCustomUI() {
        if (!this.config.ui) return;

        this.video.controls = false;
        this.video.style.pointerEvents = 'none';

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
            <style>
                .spinner {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                .controls {
                    position: absolute;
                    left: 5px;
                    right: 5px;
                    bottom: 5px;
                    display: flex;
                }
                .space {
                    width: 100%;
                }
                .volume {
                    display: none;
                }
                .stream {
                    padding-top: 2px;
                    margin-left: 2px;
                    font-weight: 400;
                    font-size: 20px;
                    color: white;
                    display: none;
                    cursor: pointer;
                }
            </style>
        `);
        card.insertAdjacentHTML('beforeend', `
            <div class="ui">
                <ha-circular-progress class="spinner"></ha-circular-progress>
                <div class="controls">
                    <ha-icon class="fullscreen" icon="mdi:fullscreen"></ha-icon>
                    <ha-icon class="screenshot" icon="mdi:floppy"></ha-icon>
                    <span class="stream">${this.streamName}</span>
                    <span class="space"></span>
                    <ha-icon class="play" icon="mdi:play"></ha-icon>
                    <ha-icon class="volume" icon="mdi:volume-high"></ha-icon>
                </div>
            </div>
        `);

        const video = this.video;

        if (this.requestFullscreen) {
            this.exitFullscreen = () => document.exitFullscreen();
            this.fullscreenElement = () => document.fullscreenElement;
            this.fullscreenEvent = 'fullscreenchange';
        } else if (this.webkitRequestFullscreen) {
            this.requestFullscreen = () => this.webkitRequestFullscreen();
            this.exitFullscreen = () => document.webkitExitFullscreen();
            this.fullscreenElement = () => document.webkitFullscreenElement;
            this.fullscreenEvent = 'webkitfullscreenchange';
        } else {
            this.querySelector('.fullscreen').style.display = 'none';
        }

        const ui = this.querySelector('.ui');
        ui.addEventListener('click', ev => {
            const icon = ev.target.icon;
            if (icon === 'mdi:play') {
                this.play();
            } else if (icon === 'mdi:volume-mute') {
                video.muted = false;
            } else if (icon === 'mdi:volume-high') {
                video.muted = true;
            } else if (icon === 'mdi:fullscreen') {
                this.requestFullscreen().catch(reason => {
                    console.warn(reason);
                }); // Chrome 71
            } else if (icon === 'mdi:fullscreen-exit') {
                this.exitFullscreen();
            } else if (icon === 'mdi:floppy') {
                this.saveScreenshot();
            } else if (ev.target.className === 'stream') {
                this.nextStream(true);
                ev.target.innerText = this.streamName;
            }
        });

        const spinner = this.querySelector('.spinner');
        video.addEventListener('waiting', () => {
            spinner.style.display = 'block';
        });
        video.addEventListener('playing', () => {
            spinner.style.display = 'none';
        });

        const play = this.querySelector('.play');
        video.addEventListener('play', () => {
            play.style.display = 'none';
        });
        video.addEventListener('pause', () => {
            play.style.display = 'block';
        });

        const volume = this.querySelector('.volume');
        video.addEventListener('loadeddata', () => {
            volume.style.display = this.hasAudio ? 'block' : 'none';
            // volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
        });
        video.addEventListener('volumechange', () => {
            volume.icon = video.muted ? 'mdi:volume-mute' : 'mdi:volume-high';
        });

        const fullscreen = this.querySelector('.fullscreen');
        this.addEventListener(this.fullscreenEvent, () => {
            fullscreen.icon = this.fullscreenElement()
                ? 'mdi:fullscreen-exit' : 'mdi:fullscreen';
        });
        const stream = this.querySelector('.stream');
        stream.style.display = this.config.streams.length > 1 ? 'block' : 'none';
    }

    renderShortcuts() {
        if (!this.config.shortcuts) return;

        // backward compatibility with `services` property
        const services = this.config.shortcuts.services || this.config.shortcuts;

        const icons = services.map((value, index) => `
            <ha-icon data-index="${index}" icon="${value.icon}" title="${value.name}"></ha-icon>
        `).join('');

        const card = this.querySelector('.card');
        card.insertAdjacentHTML('beforebegin', `
        <style>
            .shortcuts {
                position: absolute;
                top: 5px;
                left: 5px;
            }
        </style>
        `);
        card.insertAdjacentHTML('beforeend', `
        <div class="shortcuts">${icons}</div>
        `);

        const shortcuts = this.querySelector('.shortcuts');
        shortcuts.addEventListener('click', ev => {
            const value = services[ev.target.dataset.index];
            const [domain, name] = value.service.split('.');
            this.hass.callService(domain, name, value.service_data || {});
        });
    }

    renderStyle() {
        if (!this.config.style) return;

        const style = document.createElement('style');
        style.innerText = this.config.style;
        const card = this.querySelector('.card');
        card.insertAdjacentElement('beforebegin', style);
    }

    get hasAudio() {
        return (
            (this.video.srcObject && this.video.srcObject.getAudioTracks().length) ||
            (this.video.mozHasAudio || this.video.webkitAudioDecodedByteCount) ||
            (this.video.audioTracks && this.video.audioTracks.length)
        );
    }
}

customElements.define('webrtc-camera', WebRTCCamera);

const card = {
    type: 'webrtc-camera',
    name: 'WebRTC Camera',
    preview: false,
    description: 'WebRTC camera allows you to view the stream of almost any camera without delay',
};
// Apple iOS 12 doesn't support `||=`
if (window.customCards) window.customCards.push(card);
else window.customCards = [card];

