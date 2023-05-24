// js version generated from https://github.com/dbuezas/pan-zoom-controller/blob/main/src/digital-ptz.ts
import { DBL_CLICK_MS, ONE_FINGER_ZOOM_SPEED } from "./digital-ptz.js";
const capture = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
};
const getCenter = (touches) => ({
  x: (touches[0].pageX + touches[1].pageX) / 2,
  y: (touches[0].pageY + touches[1].pageY) / 2,
});
const getSpread = (touches) =>
  Math.hypot(
    touches[0].pageX - touches[1].pageX,
    touches[0].pageY - touches[1].pageY
  );
function startTouchPinchZoom({ containerEl, transform, render }) {
  const onTouchStart = (downEvent) => {
    const relevant = downEvent.touches.length === 2;
    if (!relevant) return;
    let lastTouches = downEvent.touches;
    const onTouchMove = (moveEvent) => {
      capture(moveEvent); // prevent scrolling
      const newTouches = moveEvent.touches;
      const oldCenter = getCenter(lastTouches);
      const newCenter = getCenter(newTouches);
      const dx = newCenter.x - oldCenter.x;
      const dy = newCenter.y - oldCenter.y;
      transform.move(dx, dy);
      const oldSpread = getSpread(lastTouches);
      const newSpread = getSpread(newTouches);
      const zoom = newSpread / oldSpread;
      transform.zoomAtCoords(zoom, newCenter.x, newCenter.y);
      lastTouches = moveEvent.touches;
      render();
    };
    containerEl.addEventListener("touchmove", onTouchMove);
    const onTouchEnd = () =>
      containerEl.removeEventListener("touchmove", onTouchMove);
    containerEl.addEventListener("touchend", onTouchEnd, { once: true });
  };
  containerEl.addEventListener("touchstart", onTouchStart);
  return () => containerEl.removeEventListener("touchstart", onTouchStart);
}
const getDist = (t1, t2) =>
  Math.hypot(
    t1.touches[0].pageX - t2.touches[0].pageX,
    t1.touches[0].pageY - t2.touches[0].pageY
  );
function startTouchTapDragZoom({ containerEl, transform, render }) {
  let lastEvent;
  let fastClicks = 0;
  const onTouchStart = (downEvent) => {
    const isFastClick =
      downEvent.timeStamp - lastEvent?.timeStamp < DBL_CLICK_MS;
    if (!isFastClick) fastClicks = 0;
    fastClicks++;
    if (downEvent.touches.length > 1) fastClicks = 0;
    lastEvent = downEvent;
  };
  const onTouchMove = (moveEvent) => {
    if (fastClicks === 2) {
      capture(moveEvent); // prevent scrolling
      const lastY = lastEvent.touches[0].pageY;
      const currY = moveEvent.touches[0].pageY;
      transform.zoom(1 - (lastY - currY) * ONE_FINGER_ZOOM_SPEED);
      lastEvent = moveEvent;
      render();
    } else if (getDist(lastEvent, moveEvent) > 10) {
      fastClicks = 0;
    }
  };
  containerEl.addEventListener("touchmove", onTouchMove);
  containerEl.addEventListener("touchstart", onTouchStart);
  return () => {
    containerEl.removeEventListener("touchmove", onTouchMove);
    containerEl.removeEventListener("touchstart", onTouchStart);
  };
}
function startMouseWheel({ containerEl, transform, render }) {
  const onWheel = (e) => {
    capture(e); // prevent scrolling
    const zoom = 1 - e.deltaY / 1000;
    transform.zoomAtCoords(zoom, e.pageX, e.pageY);
    render();
  };
  containerEl.addEventListener("wheel", onWheel);
  return () => containerEl.removeEventListener("wheel", onWheel);
}
function startDoubleClickZoom({ containerEl, transform, render }) {
  let lastDown = 0;
  let clicks = 0;
  const onDown = (downEvent) => {
    const isFastClick = downEvent.timeStamp - lastDown < DBL_CLICK_MS;
    lastDown = downEvent.timeStamp;
    if (!isFastClick) clicks = 0;
    clicks++;
    if (clicks !== 2) return;
    const onUp = (upEvent) => {
      const isQuickRelease = upEvent.timeStamp - lastDown < DBL_CLICK_MS;
      const dist = Math.hypot(
        upEvent.pageX - downEvent.pageX,
        upEvent.pageY - downEvent.pageY
      );
      if (!isQuickRelease || dist > 20) return;
      const zoom = transform.scale == 1 ? 2 : 0.01;
      transform.zoomAtCoords(zoom, upEvent.pageX, upEvent.pageY);
      render(true);
    };
    containerEl.addEventListener("mouseup", onUp, { once: true });
  };
  containerEl.addEventListener("mousedown", onDown);
  return () => containerEl.removeEventListener("mousedown", onDown);
}
function startGesturePan({ containerEl, transform, render }, type) {
  const [downName, moveName, upName] =
    type === "mouse"
      ? ["mousedown", "mousemove", "mouseup"]
      : ["touchstart", "touchmove", "touchend"];
  const onDown = (downEvt) => {
    let last = downEvt instanceof TouchEvent ? downEvt.touches[0] : downEvt;
    const onMove = (moveEvt) => {
      if (moveEvt instanceof TouchEvent && moveEvt.touches.length !== 1) return;
      capture(moveEvt); // prevent scrolling
      const curr = moveEvt instanceof TouchEvent ? moveEvt.touches[0] : moveEvt;
      transform.move(curr.pageX - last.pageX, curr.pageY - last.pageY);
      last = curr;
      render();
    };
    containerEl.addEventListener(moveName, onMove);
    const onUp = () => containerEl.removeEventListener(moveName, onMove);
    containerEl.addEventListener(upName, onUp, { once: true });
  };
  containerEl.addEventListener(downName, onDown);
  return () => containerEl.removeEventListener(downName, onDown);
}
function startTouchDragPan(params) {
  return startGesturePan(params, "touch");
}
function startMouseDragPan(params) {
  return startGesturePan(params, "mouse");
}
export {
  startTouchDragPan,
  startTouchPinchZoom,
  startTouchTapDragZoom,
  startMouseWheel,
  startDoubleClickZoom,
  startMouseDragPan,
};
