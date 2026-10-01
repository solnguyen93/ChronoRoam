const EDGE_PX = 150; // how close to the top or bottom edge (px) scrolling starts
const MAX_SPEED = 22; // scroll speed (px per frame) right at the edge

// The nearest parent of el that scrolls up and down, or null.
function findScrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
    }
    return null;
}

// Scrolls the list while something is dragged near its top or bottom edge — faster the closer it
// is — and keeps going while the finger holds still there. getClientY returns the finger's current
// height on screen. Returns:
//   stop(): call when the drag ends.
//   getScrollDelta(): how far the list has scrolled since the drag started; the drag adds this to
//     the dragged row's offset so the row stays under the finger.
export function startDragAutoScroll(el, getClientY) {
    const container = findScrollableAncestor(el);
    if (!container) return { stop: () => {}, getScrollDelta: () => 0 };
    const startScrollTop = container.scrollTop;
    let frameId = null;
    let stopped = false;

    const tick = () => {
        if (stopped) return;
        const y = getClientY();
        if (y != null) {
            const rect = container.getBoundingClientRect();
            const distTop = y - rect.top;
            const distBottom = rect.bottom - y;
            // Speed grows sharply near the edge (squared).
            if (distTop >= 0 && distTop < EDGE_PX) {
                container.scrollTop -= MAX_SPEED * (1 - distTop / EDGE_PX) ** 2;
            } else if (distBottom >= 0 && distBottom < EDGE_PX) {
                container.scrollTop += MAX_SPEED * (1 - distBottom / EDGE_PX) ** 2;
            }
        }
        frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return {
        stop() {
            stopped = true;
            if (frameId != null) cancelAnimationFrame(frameId);
        },
        getScrollDelta: () => container.scrollTop - startScrollTop,
    };
}
