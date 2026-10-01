import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
    addMonths, subMonths, isSameMonth, isSameDay, format,
} from 'date-fns';
import { useFloatingPopover } from '../hooks/useFloatingPopover';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Date <-> "YYYY-MM-DD" in local time (so the date never shifts by a day).
function toISO(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function fromISO(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// A date field that opens a month calendar, used for every date in the app. Works like a normal
// date input: value is "YYYY-MM-DD", and onChange gets { target: { value } }.
function DatePickerInput({ value, onChange, min, max, placeholder = 'Select date', triggerClassName = '', showYear = true }) {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState(() => fromISO(value) || fromISO(min) || new Date());
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const { popoverRef, style: popoverStyle } = useFloatingPopover(open, triggerRef);
    const selectedDate = fromISO(value);
    const minDate = fromISO(min);
    const maxDate = fromISO(max);

    useEffect(() => {
        // Close when clicking outside. The calendar is drawn elsewhere on the page (a portal), so
        // a click inside it counts as inside too.
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

    function openPicker() {
        setViewDate(selectedDate || minDate || new Date());
        setOpen((o) => !o);
    }

    function selectDay(date) {
        onChange({ target: { value: toISO(date) } });
        setOpen(false);
    }

    function isDisabled(date) {
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
    }

    const gridStart = startOfWeek(startOfMonth(viewDate));
    const gridEnd = endOfWeek(endOfMonth(viewDate));
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    return (
        <div className="date-picker-wrap" ref={wrapRef}>
            <button type="button" className={`date-picker-trigger ${triggerClassName}`.trim()} ref={triggerRef} onClick={openPicker}>
                {selectedDate
                    ? format(selectedDate, showYear ? 'MMM d, yyyy' : 'MMM d')
                    : <span className="date-picker-placeholder">{placeholder}</span>}
            </button>
            {open && createPortal(
                <div className="date-picker-popover" ref={popoverRef} style={popoverStyle || { visibility: 'hidden' }}>
                    <div className="date-picker-header">
                        <button type="button" className="date-picker-nav" onClick={() => setViewDate((d) => subMonths(d, 1))} title="Previous month">‹</button>
                        <span className="date-picker-month-label">{format(viewDate, 'MMMM yyyy')}</span>
                        <button type="button" className="date-picker-nav" onClick={() => setViewDate((d) => addMonths(d, 1))} title="Next month">›</button>
                    </div>
                    <div className="date-picker-weekdays">
                        {WEEKDAY_LABELS.map((w, i) => <span key={i}>{w}</span>)}
                    </div>
                    <div className="date-picker-grid">
                        {days.map((date) => {
                            const inMonth = isSameMonth(date, viewDate);
                            const disabled = isDisabled(date);
                            const selected = selectedDate && isSameDay(date, selectedDate);
                            return (
                                <button
                                    type="button"
                                    key={date.getTime()}
                                    className={`date-picker-day${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                                    disabled={disabled || !inMonth}
                                    onClick={() => selectDay(date)}
                                >
                                    {inMonth ? date.getDate() : ''}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default DatePickerInput;
