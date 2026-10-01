import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 220;
const VIEWPORT_MARGIN = 12;

// Two people: the "shared" icon (also used for "Linked" in LinkPacklistModal.js).
export function PeopleIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="8" r="3.6" />
            <path d="M2.5 19.5c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2v.5h-13z" />
            <circle cx="16.8" cy="8.8" r="2.9" />
            <path d="M16.4 13.4c3 .1 5.1 2.3 5.1 5.4v1.2h-4.4v-.5c0-2.4-.9-4.5-2.4-5.8.5-.2 1.1-.3 1.7-.3z" />
        </svg>
    );
}

// Shown next to the name of a trip or packing list that more than one person has (memberCount).
// Hover or tap says it's shared and that changes show for everyone. The tooltip is drawn on
// the page body (a portal) so nothing around it can cover it. `kind` is 'trip' or 'packlist'.
function SharedBadge({ memberCount, kind = 'trip' }) {
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

    if (!memberCount || memberCount < 2) return null;
    const text = `Shared. Changes to this ${kind === 'trip' ? 'trip' : 'packlist'} show for everyone on it.`;

    return (
        <>
            <span
                ref={iconRef}
                className="shared-badge"
                role="img"
                aria-label={text}
                onMouseEnter={show}
                onMouseLeave={hide}
                // Stops the tap from also opening the card or title it sits in.
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); coords ? hide() : show(); }}
            >
                <PeopleIcon />
            </span>
            {coords && createPortal(
                <div className="battery-warning-tooltip" style={{ top: coords.top, left: coords.left }}>{text}</div>,
                document.body,
            )}
        </>
    );
}

export default SharedBadge;
