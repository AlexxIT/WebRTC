// js version generated from https://github.com/dbuezas/pan-zoom-controller/blob/main/src/digital-ptz.ts
import {
  startMouseWheel,
  startDoubleClickZoom,
  startDoubleTapZoom,
  startMouseDragPan,
  startOneFingerPan,
  startPinchZoom,
  startTouchTapDragZoom,
} from "./digital-ptz-gestures.js";
import { Transform } from "./ditigal-ptz-transform.js";
export const ONE_FINGER_ZOOM_SPEED = 1 / 200; // 1 scale every 200px
export const DBL_CLICK_MS = 400;
export const MAX_ZOOM = 10;
const DEFAULT_OPTIONS = {
  mouse_drag_pan: true,
  mouse_wheel_zoom: true,
  mouse_double_click_zoom: true,
  touch_tap_drag_zoom: true,
  touch_drag_pan: false,
  touch_pinch_zoom: true,
  touch_double_tap_zoom: true,
  persist_key: "",
  persist: true,
};
export class DigitalPTZ {
  lastTouches;
  lastMouse;
  lastTap = 0;
  containerEl;
  videoEl;
  resizeObserver;
  transform;
  options;
  offHandles = [];
  constructor(containerEl, videoEl, options) {
    this.containerEl = containerEl;
    this.videoEl = videoEl;
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.transform = new Transform({
      persist_key: this.options.persist_key,
      persist: this.options.persist,
    });
    const o = this.options;
    const gestureParam = {
      containerEl: this.containerEl,
      transform: this.transform,
      render: this.render,
    };
    const h = this.offHandles;
    if (o.mouse_drag_pan) h.push(startMouseDragPan(gestureParam));
    if (o.mouse_wheel_zoom) h.push(startMouseWheel(gestureParam));
    if (o.mouse_double_click_zoom) h.push(startDoubleClickZoom(gestureParam));
    if (o.touch_double_tap_zoom) h.push(startDoubleTapZoom(gestureParam));
    if (o.touch_tap_drag_zoom) h.push(startTouchTapDragZoom(gestureParam));
    if (o.touch_drag_pan) h.push(startOneFingerPan(gestureParam));
    if (o.touch_pinch_zoom) h.push(startPinchZoom(gestureParam));
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
    for (const off of this.offHandles) off();
    this.videoEl.removeEventListener("loadedmetadata", this.recomputeRects);
    this.resizeObserver.unobserve(this.containerEl);
  }
  render = () => {
    this.videoEl.style.transform = this.transform.render();
  };
}
