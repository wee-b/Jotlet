const DAY_MINUTES = 24 * 60;
const STEP_MINUTES = 30;

/** Snap a pointer selection to half hours, with an exclusive end at midnight. */
export function selectedTimeRange(anchor: number, current = anchor) {
  const start = Math.max(
    0,
    Math.min(
      DAY_MINUTES - STEP_MINUTES,
      Math.floor(anchor / STEP_MINUTES) * STEP_MINUTES,
    ),
  );
  return {
    start: Math.max(
      0,
      Math.min(start, Math.floor(current / STEP_MINUTES) * STEP_MINUTES),
    ),
    end: Math.min(
      DAY_MINUTES,
      Math.max(
        start + STEP_MINUTES,
        Math.ceil(current / STEP_MINUTES) * STEP_MINUTES,
      ),
    ),
  };
}

export function beginTimeSelection(
  column: HTMLElement,
  scroller: HTMLElement,
  event: PointerEvent,
  onSelect: (start: number, end: number) => void,
): () => void {
  const toMinutes = (clientY: number) =>
    ((clientY - column.getBoundingClientRect().top) / column.clientHeight) *
    DAY_MINUTES;
  const anchor = toMinutes(event.clientY);
  let pointerY = event.clientY;
  let dragged = false;
  let finished = false;
  let frame = 0;
  let previousFrame = 0;
  let range = selectedTimeRange(anchor);
  const preview = document.createElement('div');
  preview.className = 'week-selection';
  preview.setAttribute('role', 'status');
  preview.setAttribute('aria-live', 'polite');
  column.append(preview);
  scroller.classList.add('is-selecting');
  column.setPointerCapture(event.pointerId);

  const time = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  function paint() {
    preview.style.top = `${(range.start / DAY_MINUTES) * 100}%`;
    preview.style.height = `${((range.end - range.start) / DAY_MINUTES) * 100}%`;
    const text = `${time(range.start)} – ${time(range.end)}`;
    if (preview.textContent !== text) preview.textContent = text;
  }
  function update() {
    range = selectedTimeRange(anchor, dragged ? toMinutes(pointerY) : anchor);
    paint();
  }
  function scrollAtEdge(timestamp: number) {
    if (finished) return;
    const elapsed = previousFrame ? Math.min(timestamp - previousFrame, 32) : 0;
    previousFrame = timestamp;
    if (dragged) {
      const bounds = scroller.getBoundingClientRect();
      const margin = Math.min(40, bounds.height / 4);
      const speed =
        pointerY > bounds.bottom - margin
          ? Math.min(1, (pointerY - bounds.bottom + margin) / margin)
          : pointerY < bounds.top + margin
            ? -Math.min(1, (bounds.top + margin - pointerY) / margin)
            : 0;
      const previousScroll = scroller.scrollTop;
      scroller.scrollTop += speed * elapsed * 0.6;
      if (scroller.scrollTop !== previousScroll) update();
    }
    frame = requestAnimationFrame(scrollAtEdge);
  }
  function cleanup() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    column.removeEventListener('pointermove', move);
    column.removeEventListener('pointerup', release);
    column.removeEventListener('pointercancel', cleanup);
    column.removeEventListener('lostpointercapture', cleanup);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('blur', cleanup);
    if (column.hasPointerCapture(event.pointerId))
      column.releasePointerCapture(event.pointerId);
    preview.remove();
    scroller.classList.remove('is-selecting');
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== event.pointerId) return;
    pointerY = next.clientY;
    dragged ||= Math.abs(pointerY - event.clientY) > 4;
    update();
  }
  function release(next: PointerEvent) {
    if (next.pointerId !== event.pointerId) return;
    move(next);
    cleanup();
    onSelect(range.start, range.end);
  }
  function escape(key: KeyboardEvent) {
    if (key.key === 'Escape') {
      key.preventDefault();
      cleanup();
    }
  }
  column.addEventListener('pointermove', move);
  column.addEventListener('pointerup', release);
  column.addEventListener('pointercancel', cleanup);
  column.addEventListener('lostpointercapture', cleanup);
  document.addEventListener('keydown', escape);
  window.addEventListener('blur', cleanup);
  paint();
  frame = requestAnimationFrame(scrollAtEdge);
  return cleanup;
}
