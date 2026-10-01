import React, { useRef, useLayoutEffect, useEffect, useCallback } from 'react';

const ITEM_HEIGHT = 30; // height of each row; must match .time-picker-col > div in Planner.css
const REPEATS = 9; // how many copies of the list a looping column has (see below)
const MIDDLE = Math.floor(REPEATS / 2);

// One scrolling column of a time or duration picker (like the iPhone alarm). A looping column
// (hours, minutes, AM/PM) repeats its list 9 times and quietly jumps back to the middle copy near
// either end, so it seems endless. A non-looping column (duration hours) is a plain list. Typing
// digits while it's focused jumps to that value.
function WheelColumn({ length, value, onChange, renderLabel, loop = true, digitsForJump = 2, digitsToValue, className }) {
    const colRef = useRef(null);
    const settleTimer = useRef(null);
    const programmatic = useRef(false);
    const digitBuffer = useRef('');
    const digitTimer = useRef(null);

    // Scrolls to a value (in the nearest copy, for a looping column).
    const scrollToValue = useCallback((v, behavior = 'auto') => {
        const col = colRef.current;
        if (!col) return;
        let targetIndex = v;
        if (loop) {
            const currentIndex = col.scrollTop / ITEM_HEIGHT;
            const currentRepeat = Math.round((currentIndex - v) / length);
            targetIndex = currentRepeat * length + v;
        }
        programmatic.current = true;
        col.scrollTo({ top: targetIndex * ITEM_HEIGHT, behavior });
    }, [length, loop]);

    // Scroll to the value when the column appears (it appears each time the picker opens).
    useLayoutEffect(() => {
        const col = colRef.current;
        if (!col) return;
        col.scrollTop = ((loop ? MIDDLE * length : 0) + value) * ITEM_HEIGHT;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Scroll to the value when it changes from outside (e.g. hours passing 12 changes AM/PM).
    useEffect(() => {
        const col = colRef.current;
        if (!col) return;
        const rawIndex = Math.round(col.scrollTop / ITEM_HEIGHT);
        const currentValue = loop ? ((rawIndex % length) + length) % length : rawIndex;
        if (currentValue !== value) scrollToValue(value);
    }, [value, length, loop, scrollToValue]);

    // When scrolling stops, pick the value in the middle, jump back to the middle copy if near an
    // end, and report the new value.
    function handleScroll() {
        if (programmatic.current) { programmatic.current = false; return; }
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
            const col = colRef.current;
            if (!col) return;
            const rawIndex = Math.max(0, Math.round(col.scrollTop / ITEM_HEIGHT));
            const settled = loop ? ((rawIndex % length) + length) % length : Math.min(rawIndex, length - 1);
            if (loop) {
                const repeat = Math.floor(rawIndex / length);
                if (repeat <= 1 || repeat >= REPEATS - 2) {
                    programmatic.current = true;
                    col.scrollTop = (MIDDLE * length + settled) * ITEM_HEIGHT;
                }
            }
            if (settled !== value) onChange(settled);
        }, 120);
    }

    // Typing digits (within 0.7 s of each other) jumps to that value.
    function handleKeyDown(e) {
        if (!digitsToValue || !/^[0-9]$/.test(e.key)) return;
        e.preventDefault();
        clearTimeout(digitTimer.current);
        digitBuffer.current = (digitBuffer.current + e.key).slice(-digitsForJump);
        const target = digitsToValue(digitBuffer.current);
        if (target != null) {
            onChange(target);
            scrollToValue(target, 'smooth');
        }
        digitTimer.current = setTimeout(() => { digitBuffer.current = ''; }, 700);
    }

    const items = [];
    const blocks = loop ? REPEATS : 1;
    for (let r = 0; r < blocks; r++) {
        for (let v = 0; v < length; v++) items.push(r * length + v);
    }

    return (
        <div
            className={`time-picker-col ${className || ''}`}
            ref={colRef}
            onScroll={handleScroll}
            onKeyDown={digitsToValue ? handleKeyDown : undefined}
            tabIndex={digitsToValue ? 0 : -1}
        >
            {items.map((slot) => {
                const v = slot % length;
                return (
                    <div
                        key={slot}
                        className={v === value ? 'selected' : ''}
                        onClick={() => { onChange(v); scrollToValue(v, 'smooth'); }}
                    >
                        {renderLabel(v)}
                    </div>
                );
            })}
        </div>
    );
}

export default WheelColumn;
