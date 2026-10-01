import React, { useEffect, useRef, useState } from 'react';

function MoreIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
        </svg>
    );
}

// A ⋮ menu. `items` is [{ label, onClick, danger }]; `light` styles the button for a white
// background instead of the dark header.
function OptionsMenu({ items, title, light }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open]);

    const pick = (fn) => {
        setOpen(false);
        fn();
    };

    return (
        <div className="trip-menu" ref={wrapRef}>
            <button className={'trip-menu-btn' + (light ? ' trip-menu-btn-light' : '')} title={title || 'Options'} onClick={() => setOpen((o) => !o)}>
                <MoreIcon />
            </button>
            {open && (
                <div className="trip-menu-dropdown">
                    {items.map(({ label, onClick, danger }, i) => (
                        <button key={i} className={danger ? 'trip-menu-danger' : ''} onClick={() => pick(onClick)}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default OptionsMenu;
