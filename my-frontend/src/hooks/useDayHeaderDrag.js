import { useRef } from 'react';
import { beginRowTouchGuard, endRowTouchGuard, markReorderActive, endReorderDrag } from '../utils/reorderGuard';

const LONG_PRESS_MS = 480;
const MOVE_CANCEL = 8;
const DROP_TARGET_CLASS = 'day-swap-target';
// Fades the day name AND its items (everything that's actually about to move to the new date —
// the date/weekday/weather stay put and stay clear) — see Planner.css's day-swap-source rule.
const DRAGGED_CLASS = 'day-swap-source';

// Long-press a day's NAME (not the rest of the header — only the name itself is the handle, and
// only it visually moves), drag it onto a DIFFERENT day's name, release to swap the two days
// wholesale (Task.swapDays, via Planner.js's swapDays) — the day names and plain/solo-dated items
// trade places; linked pairs (flight, transportation, lodging, car rental) stay put. Returns
// pointer handlers to spread onto the day-name wrapper element. Mostly imperative (direct
// style/class changes, no React state) — same approach TaskRow.js's drag already uses for the
// dragged row and its drop-line indicator, so this doesn't need to coordinate state across every
// day header on the page just to show where a drag is going.
function useDayHeaderDrag(dateISO, onSwapDay) {
    const elRef = useRef(null);

    const handlePointerDown = (e) => {
        // Not while actually editing the name (the open text box).
        if (e.target.closest('.day-name-edit-wrap')) return;
        const el = elRef.current;
        if (!el) return;
        beginRowTouchGuard();
        const startX = e.clientX, startY = e.clientY;
        let mode = null; // null | 'dragging'
        let hoveredTargetEl = null;
        let rafId = null, latestEvent = null;

        // If a real drag fires, the click that follows pointerup (e.g. DayNameEditor's own
        // tap-to-edit handler) needs to be swallowed — otherwise dragging the day name onto
        // another day ALSO opens this one's rename box right after. Capture phase so it runs
        // before React's own (bubble-phase) click handlers ever see it.
        const suppressNextClick = (ev) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener('click', suppressNextClick, true); };

        // Stops the page from scrolling once actually dragging, but not before, so a quick swipe
        // still scrolls the page (same approach as TaskRow.js's reorder drag). Has to be a
        // non-passive listener on the touched element to be able to call preventDefault.
        const onTouchMoveNative = (ev) => { if (mode === 'dragging') ev.preventDefault(); };
        el.addEventListener('touchmove', onTouchMoveNative, { passive: false });

        const clearHoverHighlight = () => {
            if (hoveredTargetEl) { hoveredTargetEl.classList.remove(DROP_TARGET_CLASS); hoveredTargetEl = null; }
        };

        const applyMove = () => {
            rafId = null;
            const ev = latestEvent;
            if (!ev || mode !== 'dragging') return;
            el.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;
            el.style.pointerEvents = 'none';
            const hoveredEl = document.elementFromPoint(ev.clientX, ev.clientY);
            el.style.pointerEvents = '';
            const hoveredDayEl = hoveredEl?.closest('[data-day-date]');
            const hoveredDate = hoveredDayEl?.dataset.dayDate;
            const nextTarget = (hoveredDate && hoveredDate !== dateISO) ? hoveredDayEl : null;
            if (nextTarget !== hoveredTargetEl) {
                clearHoverHighlight();
                if (nextTarget) { nextTarget.classList.add(DROP_TARGET_CLASS); hoveredTargetEl = nextTarget; }
            }
        };

        const onMoveHandler = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (mode === null && (Math.abs(dx) > MOVE_CANCEL || Math.abs(dy) > MOVE_CANCEL)) {
                // A plain drag before the long press fires is a scroll, not a day-swap — bail out.
                cleanup();
                return;
            }
            if (mode === 'dragging') {
                markReorderActive();
                latestEvent = ev;
                if (rafId === null) rafId = requestAnimationFrame(applyMove);
            }
        };

        const onUpHandler = () => {
            if (mode === 'dragging' && hoveredTargetEl) {
                const targetDate = hoveredTargetEl.dataset.dayDate;
                onSwapDay(dateISO, targetDate);
            }
            cleanup();
        };

        const longPressTimer = setTimeout(() => {
            mode = 'dragging';
            el.style.transition = 'none';
            el.style.zIndex = 9999;
            el.style.position = 'relative';
            el.closest('[data-day-date]')?.classList.add(DRAGGED_CLASS);
            markReorderActive();
            // Armed only once an actual drag starts — a quick tap (released before this timer
            // fires) never reaches here, so DayNameEditor's own click still opens it normally.
            el.addEventListener('click', suppressNextClick, true);
        }, LONG_PRESS_MS);

        function cleanup() {
            clearTimeout(longPressTimer);
            if (rafId !== null) cancelAnimationFrame(rafId);
            clearHoverHighlight();
            el.style.transition = 'transform .18s ease';
            el.style.transform = '';
            el.style.zIndex = '';
            el.style.position = '';
            el.closest('[data-day-date]')?.classList.remove(DRAGGED_CLASS);
            endRowTouchGuard();
            endReorderDrag();
            el.removeEventListener('touchmove', onTouchMoveNative);
            window.removeEventListener('pointermove', onMoveHandler);
            window.removeEventListener('pointerup', onUpHandler);
            window.removeEventListener('pointercancel', cleanup);
            // Safety net: the click this is meant to swallow fires asynchronously right after
            // pointerup, so this can't remove the listener immediately — but some platforms don't
            // fire one at all after a dragged pointer sequence, which would otherwise leave this
            // armed to wrongly swallow a later, unrelated tap.
            setTimeout(() => el.removeEventListener('click', suppressNextClick, true), 0);
        }

        window.addEventListener('pointermove', onMoveHandler);
        window.addEventListener('pointerup', onUpHandler);
        window.addEventListener('pointercancel', cleanup);
    };

    return { ref: elRef, onPointerDown: handlePointerDown };
}

export default useDayHeaderDrag;
