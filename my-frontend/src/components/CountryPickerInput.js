import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getNames } from 'country-list';
import { useFloatingPopover } from '../hooks/useFloatingPopover';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// Every country (about 250, from the country-list package), sorted, with names tidied ("United
// Arab Emirates (the)" -> "United Arab Emirates", "United States of America" -> "United States").
const COUNTRIES = getNames()
    .map((n) => n.replace(/\s*\(the\)$/i, '').replace(/^United States of America$/, 'United States'))
    .sort((a, b) => a.localeCompare(b));

// A country picker: a button that opens a scrollable list of every country. (Not used anywhere at
// the moment; it was for the removed passport field.)
function CountryPickerInput({ value, onChange, placeholder = 'Select country' }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const { popoverRef, style: popoverStyle } = useFloatingPopover(open, triggerRef);
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: listRef } = useScrollArrows('y', [open]);

    useEffect(() => {
        // Close when clicking outside. The list is drawn elsewhere on the page (a portal), so a
        // click inside it counts as inside too.
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

    function select(country) {
        onChange({ target: { value: country } });
        setOpen(false);
    }

    return (
        <div className="time-picker-wrap" ref={wrapRef}>
            <button
                type="button"
                className="date-picker-trigger"
                ref={triggerRef}
                onClick={() => setOpen((o) => !o)}
            >
                {value ? value : <span className="date-picker-placeholder">{placeholder}</span>}
            </button>
            {open && createPortal(
                <div className="packlist-pick-scroll-wrap v-scroll-wrap" ref={popoverRef} style={popoverStyle || { visibility: 'hidden' }}>
                    {canBack && (
                        <button key="scroll-up" type="button" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                    )}
                    <div key="scroll-body" className="packlist-pick-list" ref={listRef}>
                        {COUNTRIES.map((country) => (
                            <button
                                type="button"
                                key={country}
                                className={'packlist-pick-row' + (country === value ? ' selected' : '')}
                                onClick={() => select(country)}
                            >
                                {country}
                            </button>
                        ))}
                    </div>
                    {canForward && (
                        <button key="scroll-down" type="button" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CountryPickerInput;
