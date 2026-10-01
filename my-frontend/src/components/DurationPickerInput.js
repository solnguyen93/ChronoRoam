import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import WheelColumn from './WheelColumn';
import { useFloatingPopover } from '../hooks/useFloatingPopover';

const MAX_HOURS = 99; // the hours column goes 0-99

// "2h 30m" or "45m" -> { hours, minutes }.
function parseDuration(value) {
    if (!value) return { hours: 0, minutes: 0 };
    const hMatch = value.match(/(\d+)\s*h/i);
    const mMatch = value.match(/(\d+)\s*m/i);
    return {
        hours: hMatch ? parseInt(hMatch[1], 10) : 0,
        minutes: mMatch ? parseInt(mMatch[1], 10) : 0,
    };
}

// { hours, minutes } -> "2h 30m", or "45m" when there are no hours.
function formatDuration(hours, minutes) {
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// A duration field that opens hour and minute wheels (see WheelColumn). Value like "2h 30m".
function DurationPickerInput({ value, onChange, placeholder = 'Select duration' }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const { popoverRef, style: popoverStyle } = useFloatingPopover(open, triggerRef);

    const effective = parseDuration(value);

    useLayoutEffect(() => {
        // Close on a click outside or Escape. The wheels are drawn elsewhere on the page (a
        // portal), so a click inside them counts as inside.
        function handleClickOutside(e) {
            const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
            const inPopover = popoverRef.current && popoverRef.current.contains(e.target);
            if (!inWrap && !inPopover) setOpen(false);
        }
        function handleEscape(e) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [popoverRef]);

    // Saves a new duration.
    function commit(hours, minutes) {
        onChange({ target: { value: formatDuration(hours, minutes) } });
    }

    // Typed digits -> an hour (0-99) or a minute (0-59), for jumping the wheel.
    function hourDigitsToValue(buffer) {
        const n = parseInt(buffer, 10);
        if (Number.isNaN(n) || n < 0 || n > MAX_HOURS) return null;
        return n;
    }

    function minuteDigitsToValue(buffer) {
        const n = parseInt(buffer, 10);
        if (Number.isNaN(n) || n < 0 || n > 59) return null;
        return n;
    }

    return (
        <div className="time-picker-wrap" ref={wrapRef}>
            <button
                type="button"
                className="date-picker-trigger"
                ref={triggerRef}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    // Backspace or Delete clears it (and stops the browser treating it as "go back").
                    if (e.key === 'Backspace' || e.key === 'Delete') {
                        e.preventDefault();
                        if (value) onChange({ target: { value: '' } });
                    }
                }}
            >
                {value ? formatDuration(effective.hours, effective.minutes) : <span className="date-picker-placeholder">{placeholder}</span>}
            </button>
            {value && (
                // × clears the duration.
                <button
                    type="button"
                    className="date-picker-clear-x"
                    title="Clear duration"
                    onClick={(e) => { e.stopPropagation(); onChange({ target: { value: '' } }); }}
                >
                    ×
                </button>
            )}
            {open && createPortal(
                <div className="time-picker-popover" ref={popoverRef} style={popoverStyle || { visibility: 'hidden' }}>
                    <div className="time-picker-center-band" />
                    <div className="time-picker-columns">
                        <WheelColumn
                            length={MAX_HOURS + 1}
                            value={effective.hours}
                            onChange={(hours) => commit(hours, effective.minutes)}
                            renderLabel={(v) => `${v}h`}
                            loop
                            digitsToValue={hourDigitsToValue}
                        />
                        <WheelColumn
                            length={60}
                            value={effective.minutes}
                            onChange={(minutes) => commit(effective.hours, minutes)}
                            renderLabel={(v) => `${v}m`}
                            loop
                            digitsToValue={minuteDigitsToValue}
                        />
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default DurationPickerInput;
