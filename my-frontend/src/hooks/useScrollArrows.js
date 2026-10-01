import { useCallback, useRef, useState, useEffect } from 'react';

// Up/down (or left/right) scroll arrows used instead of scrollbars throughout the app.

// A counter per scrolling element, so a new smooth scroll stops an older one still running
// (otherwise two could fight and stop a few pixels short of the end).
const animGenByEl = new WeakMap();

// Scrolls el by delta pixels along 'x' or 'y', easing out over 0.7 s.
function smoothScrollBy(el, axis, delta, duration = 700) {
    const prop = axis === 'x' ? 'scrollLeft' : 'scrollTop';
    const myGen = (animGenByEl.get(el) || 0) + 1;
    animGenByEl.set(el, myGen);
    const start = el[prop];
    const startTime = performance.now();
    function step(now) {
        if (animGenByEl.get(el) !== myGen) return;
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el[prop] = start + delta * eased;
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// For one scrolling area along 'x' or 'y':
//   canBack / canForward: whether there's more to scroll that way (show that arrow),
//   scrollBack / scrollForward: scroll about one screen that way,
//   idle: true 1.5 s after the last scroll (the arrows fade out, but stay in place),
//   ref: give it to the scrolling element's ref prop,
//   update: measure again.
// `ref` is a callback (not a useRef object), so it works even when the element appears later,
// like a popup opening. `deps`: values that change the content's size, to measure again.
function useScrollArrows(axis, deps = []) {
    const [canBack, setCanBack] = useState(false);
    const [canForward, setCanForward] = useState(false);
    const [idle, setIdle] = useState(false);
    const elRef = useRef(null);
    const updateRef = useRef(() => {});
    const cleanupRef = useRef(null);
    const idleTimerRef = useRef(null);

    // Shows the arrows and restarts the 1.5 s fade-out timer.
    const markActive = useCallback(() => {
        setIdle(false);
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setIdle(true), 1500);
    }, []);

    // Works out whether there's more to scroll in each direction (with 4 px of slack).
    const update = useCallback(() => {
        const el = elRef.current;
        if (!el) return;
        if (axis === 'x') {
            setCanBack(el.scrollLeft > 4);
            setCanForward(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
        } else {
            setCanBack(el.scrollTop > 4);
            setCanForward(el.scrollTop < el.scrollHeight - el.clientHeight - 4);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [axis, ...deps]);
    updateRef.current = update;
    const markActiveRef = useRef(() => {});
    markActiveRef.current = markActive;

    // Called when the element appears, disappears or changes: stops watching the old one and starts
    // watching the new one (scrolling, window resizing, and the element's own size changing).
    const ref = useCallback((el) => {
        if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
        elRef.current = el;
        if (!el) { setCanBack(false); setCanForward(false); return; }
        updateRef.current();
        markActiveRef.current();
        const onEvent = () => updateRef.current();
        const onScroll = () => { updateRef.current(); markActiveRef.current(); };
        el.addEventListener('scroll', onScroll);
        window.addEventListener('resize', onEvent);
        const observer = new ResizeObserver(onEvent);
        observer.observe(el);
        cleanupRef.current = () => {
            el.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onEvent);
            observer.disconnect();
            clearTimeout(idleTimerRef.current);
        };
    }, []);

    // Measure again when any of `deps` changes.
    useEffect(() => {
        update();
    }, [update]);

    // Scroll back or forward by 80% of the visible size.
    const scrollBack = () => {
        const el = elRef.current;
        if (!el) return;
        const size = axis === 'x' ? el.clientWidth : el.clientHeight;
        smoothScrollBy(el, axis, -size * 0.8);
    };
    const scrollForward = () => {
        const el = elRef.current;
        if (!el) return;
        const size = axis === 'x' ? el.clientWidth : el.clientHeight;
        smoothScrollBy(el, axis, size * 0.8);
    };

    return { canBack, canForward, idle, scrollBack, scrollForward, update, ref };
}

export default useScrollArrows;
