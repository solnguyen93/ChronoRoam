import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import WheelColumn from './WheelColumn';
import { useFloatingPopover } from '../hooks/useFloatingPopover';

// A time field that opens hour, minute and AM/PM wheels (see WheelColumn). The value is 24-hour
// "HH:MM". The hour wheel has 24 values (12 AM to 11 PM), so scrolling it past 11 changes AM/PM.

// 13 -> "1", 0 -> "12".
function h12Label(h24) {
    const h12 = h24 % 12;
    return String(h12 === 0 ? 12 : h12);
}

// "14:30" -> { h24: 14, minute: 30 }, or null.
function parse24(value) {
    if (!value) return null;
    const [h24, m] = value.split(':').map(Number);
    return { h24, minute: m };
}

// 14, 30 -> "14:30".
function to24(h24, minute) {
    return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function TimePickerInput({ value, onChange, placeholder = 'Select time' }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const { popoverRef, style: popoverStyle } = useFloatingPopover(open, triggerRef);

    const parsed = parse24(value);
    const effective = parsed || { h24: 0, minute: 0 };
    const period = effective.h24 >= 12 ? 1 : 0; // 0 = AM, 1 = PM

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

    // Saves a new time.
    function commit(h24, minute) {
        onChange({ target: { value: to24(h24, minute) } });
    }

    // Typed digits -> an hour (1-12, keeping AM/PM) or a minute (0-59), for jumping the wheel.
    function hourDigitsToValue(buffer) {
        const n = parseInt(buffer, 10);
        if (Number.isNaN(n) || n < 0 || n > 12) return null;
        const h12 = n % 12; // typing 12 means hour 0 (12 AM) or 12 (12 PM)
        return period === 1 ? h12 + 12 : h12;
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
                        if (parsed) onChange({ target: { value: '' } });
                    }
                }}
            >
                {parsed ? (
                    <>
                        {`${h12Label(effective.h24)}:${String(effective.minute).padStart(2, '0')} ${period === 1 ? 'PM' : 'AM'}`}
                        {parsed.h24 > 12 && <span className="time-24h-badge-inline">({value})</span>}
                    </>
                ) : <span className="date-picker-placeholder">{placeholder}</span>}
            </button>
            {parsed && (
                // × clears the time.
                <button
                    type="button"
                    className="date-picker-clear-x"
                    title="Clear time"
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
                            length={24}
                            value={effective.h24}
                            onChange={(h24) => commit(h24, effective.minute)}
                            renderLabel={h12Label}
                            loop
                            digitsToValue={hourDigitsToValue}
                        />
                        <WheelColumn
                            length={60}
                            value={effective.minute}
                            onChange={(minute) => commit(effective.h24, minute)}
                            renderLabel={(v) => String(v).padStart(2, '0')}
                            loop
                            digitsToValue={minuteDigitsToValue}
                        />
                        <div className="time-picker-period-toggle">
                            {['AM', 'PM'].map((label, v) => {
                                const isSelected = v === period;
                                // The chosen AM or PM sits on the middle line, the other one row
                                // above or below it.
                                const top = isSelected ? '50%' : `calc(50% ${v === 0 ? '-' : '+'} 30px)`;
                                return (
                                    <div
                                        key={label}
                                        className={isSelected ? 'selected' : ''}
                                        style={{ top }}
                                        onClick={() => {
                                            const h24 = v === 1
                                                ? (effective.h24 < 12 ? effective.h24 + 12 : effective.h24)
                                                : (effective.h24 >= 12 ? effective.h24 - 12 : effective.h24);
                                            commit(h24, effective.minute);
                                        }}
                                    >
                                        {label}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default TimePickerInput;
