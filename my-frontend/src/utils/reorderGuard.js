// Two guards for drag-to-reorder.
//
// 1. While a row is being dragged, the trip page's background refresh (useTripData.js) is skipped,
//    since re-drawing the list mid-drag would mix up the rows. The drag calls markReorderActive()
//    over and over; the guard ends by itself 15 seconds after the last call, in case a drag is
//    interrupted without ending.
const DRAG_GUARD_MAX_MS = 15000;
let dragActiveUntil = 0;

// A drag is (still) happening.
export function markReorderActive() {
    dragActiveUntil = Date.now() + DRAG_GUARD_MAX_MS;
}

// The drag ended.
export function endReorderDrag() {
    dragActiveUntil = 0;
}

// Whether a drag is happening (checked by the background refresh).
export function isReorderDragActive() {
    return Date.now() < dragActiveUntil;
}

// 2. From the moment a finger touches any row until it lifts, the page gets the
//    'reorder-drag-active' class, which makes the header buttons (TODAY, search, view switcher)
//    ignore touches (see Planner.css). On iPhones a pressed look could otherwise jump to the TODAY
//    button when the dragged row stops taking touches.
const TOUCH_GUARD_CLASS = 'reorder-drag-active';

// A finger touched a row.
export function beginRowTouchGuard() {
    document.body.classList.add(TOUCH_GUARD_CLASS);
}

// The finger lifted.
export function endRowTouchGuard() {
    document.body.classList.remove(TOUCH_GUARD_CLASS);
}
