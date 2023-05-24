// js version generated from https://github.com/dbuezas/pan-zoom-controller/blob/main/src/digital-ptz.ts
import { MAX_ZOOM } from "./digital-ptz.js";
const PERSIST_KEY_PREFIX = "webrtc-digital-ptc:";
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export class Transform {
  scale = 1;
  x = 0;
  y = 0;
  videoRect;
  containerRect;
  settings;
  constructor(settings) {
    this.settings = {
      ...settings,
      persist_key: PERSIST_KEY_PREFIX + settings.persist_key,
    };
    this.loadPersistedTransform();
  }
  updateRects(videoEl, containerEl) {
    const containerRect = containerEl.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      // The container rect has no size yet.
      // This happens when coming back to a tab that was already opened.
      // The card will get size shortly and the size observer will call this function again.
      return;
    }
    this.containerRect = containerRect;
    if (!videoEl.videoWidth) {
      // The video hasn't loaded yet.
      // Once it loads, the videometadata listener will call this function again.
      return;
    }
    const screenAspectRatio =
      this.containerRect.width / this.containerRect.height;
    const videoAspectRatio = videoEl.videoWidth / videoEl.videoHeight;
    if (videoAspectRatio > screenAspectRatio) {
      // Black bars on the top and bottom
      const videoHeight = this.containerRect.width / videoAspectRatio;
      const blackBarHeight = (this.containerRect.height - videoHeight) / 2;
      this.videoRect = new DOMRect(
        this.containerRect.x,
        blackBarHeight + this.containerRect.y,
        this.containerRect.width,
        videoHeight
      );
    } else {
      // Black bars on the sides
      const videoWidth = this.containerRect.height * videoAspectRatio;
      const blackBarWidth = (this.containerRect.width - videoWidth) / 2;
      this.videoRect = new DOMRect(
        blackBarWidth + this.containerRect.x,
        this.containerRect.y,
        videoWidth,
        this.containerRect.height
      );
    }
  }
  move(dx, dy) {
    if (!this.videoRect) return;
    const bound = (this.scale - 1) / 2;
    this.x += dx / this.videoRect.width;
    this.y += dy / this.videoRect.height;
    this.x = clamp(this.x, -bound, bound);
    this.y = clamp(this.y, -bound, bound);
    this.persistTransform();
  }
  // x,y are relative to viewport (clientX, clientY)
  zoomAtCoords(zoom, x, y) {
    if (!this.containerRect || !this.videoRect) return;
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
    if (!this.containerRect || !this.videoRect) return;
    const x = this.containerRect.width / 2;
    const y = this.containerRect.height / 2;
    this.zoomAtCoords(zoom, x, y);
  }
  render() {
    if (!this.videoRect) return "";
    const { x, y, scale } = this;
    return `translate(${x * this.videoRect.width}px, ${
      y * this.videoRect.height
    }px) scale(${scale})`;
  }
  loadPersistedTransform = () => {
    const { persist_key, persist } = this.settings;
    if (!persist) return;
    try {
      const loaded = JSON.parse(localStorage[persist_key]);
      const isValid = [loaded.scale || loaded.x || loaded.y].every(
        Number.isFinite
      );
      if (!isValid) {
        throw new Error("Broken local storage");
      }
      this.x = loaded.x;
      this.y = loaded.y;
      this.scale = loaded.scale;
    } catch (e) {
      delete localStorage[persist_key];
    }
  };
  persistTransform = () => {
    const { persist_key, persist } = this.settings;
    if (!persist) return;
    const { x, y, scale } = this;
    localStorage[persist_key] = JSON.stringify({
      x,
      y,
      scale,
    });
  };
}
