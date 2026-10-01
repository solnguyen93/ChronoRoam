import { useLayoutEffect, useRef, useState } from 'react';

// Places a popover (date picker, time picker, place suggestions...) next to the element that
// opened it (triggerRef), using screen coordinates, so a scrolling popup box can't cut it off.
// Returns { popoverRef, style }: put the ref on the popover and apply the style. It's placed
// again whenever the window or page scrolls or resizes (including the phone keyboard opening).
//
// Default: position:fixed, below the trigger, or above it when there's more room there. Kept
// inside the visible area, even if it has to cover the trigger.
//
// matchTriggerWidth: makes the popover as wide as the trigger.
//
// alwaysBelow: always directly below the trigger, with its height limited to the room left.
// Used for place suggestions (PlaceAutocompleteInput), where the trigger is a text box that
// opens the keyboard. Uses position:absolute (page coordinates) instead of fixed, because on iOS
// Safari fixed elements can end up in the wrong place while the keyboard opens, while
// absolute ones move with the page as iOS scrolls the text box into view.
//
// The visible area comes from window.visualViewport when available, because on iOS
// window.innerHeight doesn't shrink when the keyboard is open.
export function useFloatingPopover(open, triggerRef, { matchTriggerWidth = false, alwaysBelow = false } = {}) {
    const popoverRef = useRef(null);
    const [style, setStyle] = useState(null);

    useLayoutEffect(() => {
        if (!open) { setStyle(null); return; }
        const vv = window.visualViewport;

        function reposition() {
            if (!triggerRef.current || !popoverRef.current) return;
            const triggerRect = triggerRef.current.getBoundingClientRect();
            if (matchTriggerWidth) {
                // Set the width on the element right away, so the measurement below uses it.
                popoverRef.current.style.width = `${triggerRect.width}px`;
            }
            const popoverRect = popoverRef.current.getBoundingClientRect();
            const gap = 4;
            // The visible area on screen. With the keyboard open or when zoomed in, it may not
            // start at the top-left of the page's layout.
            const viewTop = vv ? vv.offsetTop : 0;
            const viewLeft = vv ? vv.offsetLeft : 0;
            const viewHeight = vv ? vv.height : window.innerHeight;
            const viewWidth = vv ? vv.width : window.innerWidth;
            const viewBottom = viewTop + viewHeight;
            const viewRight = viewLeft + viewWidth;
            const spaceBelow = viewBottom - triggerRect.bottom;

            if (alwaysBelow) {
                const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
                const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
                // At most about 3 suggestion rows tall (the rest scroll), and at least 60px even
                // when the keyboard leaves less room.
                const maxHeight = Math.min(104, Math.max(60, spaceBelow - gap - 8));
                setStyle({
                    position: 'absolute',
                    top: triggerRect.bottom + scrollY + gap,
                    left: triggerRect.left + scrollX,
                    maxHeight,
                    zIndex: 200,
                    ...(matchTriggerWidth ? { width: triggerRect.width } : {}),
                });
                return;
            }

            const openUpward = spaceBelow < popoverRect.height + gap && (triggerRect.top - viewTop) > popoverRect.height + gap;
            let top = openUpward ? triggerRect.top - popoverRect.height - gap : triggerRect.bottom + gap;
            // Keep it on screen, 8px from the edges.
            top = Math.min(Math.max(viewTop + 8, top), viewBottom - popoverRect.height - 8);
            const left = Math.min(triggerRect.left, viewRight - popoverRect.width - 8);
            setStyle({
                position: 'fixed', top, left: Math.max(viewLeft + 8, left), zIndex: 200,
                ...(matchTriggerWidth ? { width: triggerRect.width } : {}),
            });
        }

        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        if (vv) {
            vv.addEventListener('resize', reposition);
            vv.addEventListener('scroll', reposition);
        }
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
            if (vv) {
                vv.removeEventListener('resize', reposition);
                vv.removeEventListener('scroll', reposition);
            }
        };
    }, [open, triggerRef, matchTriggerWidth, alwaysBelow]);

    return { popoverRef, style };
}
