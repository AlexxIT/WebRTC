// js version generated from https://github.com/dbuezas/pan-zoom-controller/blob/main/src/digital-ptz.ts
const MAX_ZOOM = 10;
const LOCAL_STORAGE_KEY = "webrtc-digital-ptc:";
const ONE_FINGER_ZOOM_SPEED = 1 / 200; // 1 scale every 200px
const ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD = 250;
const DEFAULT_OPTIONS = {
    mouse_drag_zoom: true,
    mouse_wheel_zoom: true,
    mouse_double_click_zoom: true,
    touch_drag_zoom: true,
    touch_pan: true,
    touch_pinch_zoom: true,
    touch_double_tap_zoom: true,
    persist_key: "",
    persist: true,
};
const STATE_IDLE = 0;
const STATE_ONE_FINGER_PAN = 1;
const STATE_ONE_FINGER_ZOOM = 2;
const STATE_TWO_FINGERS = 3;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
class Transform {
    persist_key;
    persist;
    scale = 1;
    x = 0;
    y = 0;
    videoRect;
    containerRect;
    constructor(persist_key, persist) {
        this.persist = persist;
        this.persist_key = LOCAL_STORAGE_KEY + persist_key;
        this.loadPersistedTransform();
    }
    updateRects(videoEl, containerEl) {
        this.containerRect = containerEl.getBoundingClientRect();
        if (!videoEl.videoWidth) {
            console.log("this.videoEl.videoWidth video not loaded");
            return;
        }
        const screenAspectRatio = this.containerRect.width / this.containerRect.height;
        const videoAspectRatio = videoEl.videoWidth / videoEl.videoHeight;
        if (videoAspectRatio > screenAspectRatio) {
            // Black bars on the top and bottom
            const videoHeight = this.containerRect.width / videoAspectRatio;
            const blackBarHeight = (this.containerRect.height - videoHeight) / 2;
            this.videoRect = new DOMRect(this.containerRect.x, blackBarHeight + this.containerRect.y, this.containerRect.width, videoHeight);
        }
        else {
            // Black bars on the sides
            const videoWidth = this.containerRect.height * videoAspectRatio;
            const blackBarWidth = (this.containerRect.width - videoWidth) / 2;
            this.videoRect = new DOMRect(blackBarWidth + this.containerRect.x, this.containerRect.y, videoWidth, this.containerRect.height);
        }
    }
    move(dx, dy) {
        if (!this.videoRect)
            return;
        const bound = (this.scale - 1) / 2;
        this.x += dx / this.videoRect.width;
        this.y += dy / this.videoRect.height;
        this.x = clamp(this.x, -bound, bound);
        this.y = clamp(this.y, -bound, bound);
        this.persistTransform();
    }
    // x,y are relative to viewport (clientX, clientY)
    zoomAtCoords(zoom, x, y) {
        if (!this.containerRect || !this.videoRect)
            return;
        const oldScale = this.scale;
        this.scale *= zoom;
        this.scale = clamp(this.scale, 1, MAX_ZOOM);
        zoom = this.scale / oldScale;
        x = x - this.containerRect.x - this.containerRect.width / 2;
        y = y - this.containerRect.y - this.containerRect.height / 2;
        const dx = x - this.x * this.videoRect.width;
        const dy = y - this.y * this.videoRect.height;
        this.move(dx * (1 - zoom), dy * (1 - zoom));
    }
    zoom(zoom) {
        if (!this.containerRect || !this.videoRect)
            return;
        const x = this.containerRect.width / 2;
        const y = this.containerRect.height / 2;
        this.zoomAtCoords(zoom, x, y);
    }
    render() {
        if (!this.videoRect)
            return "";
        const { x, y, scale } = this;
        return `translate(${x * this.videoRect.width}px, ${y * this.videoRect.height}px) scale(${scale})`;
    }
    loadPersistedTransform = () => {
        const { persist_key, persist } = this;
        if (!persist)
            return;
        try {
            const loaded = JSON.parse(localStorage[persist_key]);
            const isValid = [loaded.scale || loaded.x || loaded.y].every(Number.isFinite);
            if (!isValid) {
                throw new Error("Broken local storage");
            }
            this.x = loaded.x;
            this.y = loaded.y;
            this.scale = loaded.scale;
        }
        catch (e) {
            delete localStorage[persist_key];
        }
    };
    persistTransform = () => {
        if (!this.persist)
            return;
        const { x, y, scale } = this;
        localStorage[this.persist_key] = JSON.stringify({
            x,
            y,
            scale,
        });
    };
}
export class DigitalPTZ {
    lastTouches;
    lastMouse;
    lastTap = 0;
    containerEl;
    videoEl;
    resizeObserver;
    transform;
    state = STATE_IDLE;
    options;
    constructor(containerEl, videoEl, options) {
        this.containerEl = containerEl;
        this.videoEl = videoEl;
        this.options = Object.assign({}, DEFAULT_OPTIONS, options);
        this.transform = new Transform(this.options.persist_key, this.options.persist);
        for (const [event, handler] of this.handlers) {
            this.containerEl.addEventListener(event, handler, {
                capture: true,
            });
        }
        this.videoEl.addEventListener("loadedmetadata", this.recomputeRects);
        this.resizeObserver = new ResizeObserver(this.recomputeRects);
        this.resizeObserver.observe(this.containerEl);
        this.recomputeRects();
    }
    recomputeRects = () => {
        this.transform.updateRects(this.videoEl, this.containerEl);
        this.transform.zoomAtCoords(1, 0, 0); // clamp transform
        this.render();
    };
    destroy() {
        for (const [event, handler] of this.handlers) {
            this.containerEl.removeEventListener(event, handler);
        }
        this.videoEl.removeEventListener("loadedmetadata", this.recomputeRects);
        this.resizeObserver.unobserve(this.containerEl);
    }
    onTouchStart = async (e) => {
        const { touch_drag_zoom, touch_pan, touch_pinch_zoom } = this.options;
        let isValid = true;
        const isQuickTap = e.timeStamp - this.lastTap < ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD;
        if (e.touches.length === 1 && isQuickTap && touch_drag_zoom) {
            this.state = STATE_ONE_FINGER_ZOOM;
        }
        else if (e.touches.length === 1 && !isQuickTap && touch_pan) {
            this.state = STATE_ONE_FINGER_PAN;
        }
        else if (e.touches.length === 2 && touch_pinch_zoom) {
            this.state = STATE_TWO_FINGERS;
        }
        else {
            this.state = STATE_IDLE;
            isValid = false;
        }
        this.lastTap = e.timeStamp;
        if (isValid) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.lastTouches = e.touches;
        }
    };
    onTouchMove = async (e) => {
        if (!this.lastTouches)
            return;
        let isValid = true;
        if (this.state === STATE_ONE_FINGER_PAN) {
            const dx = e.touches[0].clientX - this.lastTouches[0].clientX;
            const dy = e.touches[0].clientY - this.lastTouches[0].clientY;
            this.transform.move(dx, dy);
        }
        else if (this.state === STATE_ONE_FINGER_ZOOM) {
            const zoom = 1 -
                (this.lastTouches[0].clientY - e.touches[0].clientY) *
                    ONE_FINGER_ZOOM_SPEED;
            this.transform.zoom(zoom);
        }
        else if (this.state === STATE_TWO_FINGERS) {
            const oldCenter = {
                x: (this.lastTouches[0].clientX + this.lastTouches[1].clientX) / 2,
                y: (this.lastTouches[0].clientY + this.lastTouches[1].clientY) / 2,
            };
            const newCenter = {
                x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
            };
            const dx = newCenter.x - oldCenter.x;
            const dy = newCenter.y - oldCenter.y;
            const oldSpread = Math.hypot(this.lastTouches[0].clientX - this.lastTouches[1].clientX, this.lastTouches[0].clientY - this.lastTouches[1].clientY);
            const newSpread = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const zoom = newSpread / oldSpread;
            this.transform.move(dx, dy);
            this.transform.zoomAtCoords(zoom, newCenter.x, newCenter.y);
        }
        else {
            isValid = false;
        }
        if (isValid) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.render();
            this.lastTouches = e.touches;
        }
    };
    onTouchEnd = (e) => {
        if (!this.lastTouches)
            return;
        const { touch_double_tap_zoom } = this.options;
        const isQuickTap = e.timeStamp - this.lastTap < ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD;
        if (this.state === STATE_ONE_FINGER_ZOOM &&
            isQuickTap &&
            touch_double_tap_zoom) {
            if (this.transform.scale == 1) {
                this.transform.zoomAtCoords(2, this.lastTouches[0].clientX, this.lastTouches[0].clientY);
            }
            else {
                this.transform.zoomAtCoords(0.01, 0, 0);
            }
            this.render();
        }
        this.state = STATE_IDLE;
    };
    onWheel = async (e) => {
        if (!this.options.mouse_wheel_zoom)
            return;
        const zoom = 1 - e.deltaY / 1000;
        this.transform.zoomAtCoords(zoom, e.clientX, e.clientY);
        this.render();
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    };
    onMouseDown = async (e) => {
        if (e.button !== 0)
            return;
        const { mouse_double_click_zoom, mouse_drag_zoom } = this.options;
        const isQuickTap = e.timeStamp - this.lastTap < ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD;
        if (isQuickTap && mouse_double_click_zoom) {
            this.state = STATE_ONE_FINGER_ZOOM;
        }
        else if (mouse_drag_zoom) {
            this.state = STATE_ONE_FINGER_PAN;
        }
        else {
            this.state = STATE_IDLE;
        }
        this.lastMouse = e;
        this.lastTap = e.timeStamp;
    };
    onMouseMove = async (e) => {
        if (!this.lastMouse)
            return;
        if (this.state === STATE_ONE_FINGER_PAN) {
            const dx = e.x - this.lastMouse.x;
            const dy = e.y - this.lastMouse.y;
            this.transform.move(dx, dy);
            this.render();
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.lastMouse = e;
        }
    };
    onMouseUp = (e) => {
        if (!this.lastMouse)
            return;
        const { mouse_double_click_zoom } = this.options;
        const isQuickTap = e.timeStamp - this.lastTap < ONE_FINGER_DOUBLE_TAP_ZOOM_MS_THRESHOLD;
        if (this.state === STATE_ONE_FINGER_ZOOM &&
            isQuickTap &&
            mouse_double_click_zoom) {
            if (this.transform.scale == 1) {
                this.transform.zoomAtCoords(2, this.lastMouse.clientX, this.lastMouse.clientY);
            }
            else {
                this.transform.zoomAtCoords(0.01, 0, 0);
            }
            this.render();
        }
        this.state = STATE_IDLE;
    };
    handlers = [
        ["wheel", this.onWheel],
        ["touchstart", this.onTouchStart],
        ["touchmove", this.onTouchMove],
        ["touchend", this.onTouchEnd],
        ["mousedown", this.onMouseDown],
        ["mousemove", this.onMouseMove],
        ["mouseup", this.onMouseUp],
    ];
    render() {
        this.videoEl.style.transform = this.transform.render();
    }
}
