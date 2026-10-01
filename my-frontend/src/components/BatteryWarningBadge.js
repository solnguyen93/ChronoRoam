import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BATTERY_WARNING_TEXT } from '../utils/batteryWarning';

const TOOLTIP_WIDTH = 220;
const VIEWPORT_MARGIN = 12;

// The ⚠️ emoji.
function WarningIcon() {
    return <span className="tag-emoji" aria-hidden="true">⚠️</span>;
}

// The ⚠️ after a packing list item that looks like a battery or power bank
// (utils/batteryWarning.js). Hover or tap shows a tooltip with the carry-on rule. The tooltip is
// drawn directly on the page body (a portal), since inside the row it would be hidden under the
// next row.
function BatteryWarningBadge() {
    const [coords, setCoords] = useState(null); // null = closed, { top, left } = open at that spot
    const iconRef = useRef(null);

    const show = () => {
        const rect = iconRef.current.getBoundingClientRect();
        const left = Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN);
        setCoords({ top: rect.bottom + 7, left: Math.max(VIEWPORT_MARGIN, left) });
    };
    const hide = () => setCoords(null);

    // While open: follow the icon when the page scrolls, and close on a click elsewhere.
    useEffect(() => {
        if (!coords) return undefined;
        const onScroll = () => show();
        const onOutside = (e) => { if (iconRef.current && !iconRef.current.contains(e.target)) hide(); };
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('mousedown', onOutside);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('mousedown', onOutside);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!coords]);

    return (
        <>
            <span
                ref={iconRef}
                className={'battery-warning' + (coords ? ' open' : '')}
                title="Battery/power bank item"
                onMouseEnter={show}
                onMouseLeave={hide}
                onClick={(e) => { e.stopPropagation(); coords ? hide() : show(); }}
            >
                <WarningIcon />
            </span>
            {coords && createPortal(
                <div className="battery-warning-tooltip" style={{ top: coords.top, left: coords.left }}>
                    {BATTERY_WARNING_TEXT}
                </div>,
                document.body,
            )}
        </>
    );
}

export default BatteryWarningBadge;
