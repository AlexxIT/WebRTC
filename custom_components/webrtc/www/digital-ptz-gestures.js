import { DBL_CLICK_MS, ONE_FINGER_ZOOM_SPEED } from "./digital-ptz.js";
const capture = (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
};
function startDoubleTapZoom({ containerEl, transform, render }) {
  let lastTap = 0;
  const onTouchStart = (downEvent) => {
    const isSecondTap = downEvent.timeStamp - lastTap < DBL_CLICK_MS;
    lastTap = downEvent.timeStamp;
    const relevant = downEvent.touches.length === 1 && isSecondTap;
    if (!relevant) return;
    const onTouchEnd = (endEvent) => {
      const isQuickRelease = endEvent.timeStamp - lastTap < DBL_CLICK_MS;
      const didMove =
        30 <
        Math.hypot(
          endEvent.changedTouches[0].clientX - downEvent.touches[0].clientX,
          endEvent.changedTouches[0].clientY - downEvent.touches[0].clientY
        );
      if (!isQuickRelease || didMove) return;
      const zoom = transform.scale == 1 ? 2 : 0.01;
      transform.zoomAtCoords(
        zoom,
        downEvent.touches[0].clientX,
        downEvent.touches[0].clientY
      );
      render();
    };
    containerEl.addEventListener("touchend", onTouchEnd, { once: true });
  };
  containerEl.addEventListener("touchstart", onTouchStart);
  return () => containerEl.removeEventListener("touchstart", onTouchStart);
}
function startOneFingerPan({ containerEl, transform, render }) {
  const onTouchStart = (downEvent) => {
    if (downEvent.touches.length !== 1) return;
    let lastTouches = downEvent.touches;
    const onTouchMove = (moveEvent) => {
      if (moveEvent.touches.length !== 1) return;
      capture(moveEvent);
      const dx = moveEvent.touches[0].clientX - lastTouches[0].clientX;
      const dy = moveEvent.touches[0].clientY - lastTouches[0].clientY;
      transform.move(dx, dy);
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
function startPinchZoom({ containerEl, transform, render }) {
  const onTouchStart = (downEvent) => {
    const relevant = downEvent.touches.length === 2;
    if (!relevant) return;
    let lastTouches = downEvent.touches;
    const onTouchMove = (moveEvent) => {
      capture(moveEvent);
      const oldCenter = {
        x: (lastTouches[0].clientX + lastTouches[1].clientX) / 2,
        y: (lastTouches[0].clientY + lastTouches[1].clientY) / 2,
      };
      const newTouches = moveEvent.touches;
      const newCenter = {
        x: (newTouches[0].clientX + newTouches[1].clientX) / 2,
        y: (newTouches[0].clientY + newTouches[1].clientY) / 2,
      };
      const dx = newCenter.x - oldCenter.x;
      const dy = newCenter.y - oldCenter.y;
      const oldSpread = Math.hypot(
        lastTouches[0].clientX - lastTouches[1].clientX,
        lastTouches[0].clientY - lastTouches[1].clientY
      );
      const newSpread = Math.hypot(
        newTouches[0].clientX - newTouches[1].clientX,
        newTouches[0].clientY - newTouches[1].clientY
      );
      const zoom = newSpread / oldSpread;
      transform.move(dx, dy);
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
function startTouchTapDragZoom({ containerEl, transform, render }) {
  let lastTap = 0;
  const onTouchStart = (downEvent) => {
    const isSecondTap = downEvent.timeStamp - lastTap < DBL_CLICK_MS;
    lastTap = downEvent.timeStamp;
    const relevant = downEvent.touches.length === 1 && isSecondTap;
    if (!relevant) return;
    capture(downEvent);
    let lastTouchY = downEvent.touches[0].clientY;
    const onTouchMove = (moveEvent) => {
      if (moveEvent.touches.length > 1) return;
      capture(moveEvent);
      const currTouchY = moveEvent.touches[0].clientY;
      transform.zoom(1 - (lastTouchY - currTouchY) * ONE_FINGER_ZOOM_SPEED);
      lastTouchY = currTouchY;
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
function startMouseWheel({ containerEl, transform, render }) {
  const onWheel = (e) => {
    capture(e);
    const zoom = 1 - e.deltaY / 1000;
    transform.zoomAtCoords(zoom, e.clientX, e.clientY);
    render();
  };
  containerEl.addEventListener("wheel", onWheel);
  return () => containerEl.removeEventListener("wheel", onWheel);
}
function startDoubleClickZoom({ containerEl, transform, render }) {
  let lastClick = 0;
  const onMouseDown = (downEvent) => {
    const isSecondClick = downEvent.timeStamp - lastClick < DBL_CLICK_MS;
    lastClick = downEvent.timeStamp;
    if (!isSecondClick) return;
    capture(downEvent);
    containerEl.addEventListener(
      "mouseup",
      (upEvent) => {
        const isQuickRelease = upEvent.timeStamp - lastClick < DBL_CLICK_MS;
        if (!isQuickRelease) return;
        const zoom = transform.scale == 1 ? 2 : 0.01;
        transform.zoomAtCoords(zoom, upEvent.clientX, upEvent.clientY);
        render();
      },
      { once: true }
    );
  };
  containerEl.addEventListener("mousedown", onMouseDown);
  return () => containerEl.removeEventListener("mousedown", onMouseDown);
}
function startMouseDragPan({ containerEl, transform, render }) {
  let lastClick = 0;
  const onMouseDown = (downEvent) => {
    lastClick = downEvent.timeStamp;
    let lastMouse = downEvent;
    const onMouseMove = (moveEvent) => {
      capture(moveEvent);
      const dx = moveEvent.x - lastMouse.x;
      const dy = moveEvent.y - lastMouse.y;
      transform.move(dx, dy);
      lastMouse = moveEvent;
      render();
    };
    containerEl.addEventListener("mousemove", onMouseMove);
    containerEl.addEventListener(
      "mouseup",
      () => {
        containerEl.removeEventListener("mousemove", onMouseMove);
      },
      { once: true }
    );
  };
  containerEl.addEventListener("mousedown", onMouseDown);
  return () => containerEl.removeEventListener("mousedown", onMouseDown);
}
export {
  startDoubleTapZoom,
  startOneFingerPan,
  startPinchZoom,
  startTouchTapDragZoom,
  startMouseWheel,
  startDoubleClickZoom,
  startMouseDragPan,
};
