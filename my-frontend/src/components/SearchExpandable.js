import React, { useEffect, useRef, useState } from 'react';
import SearchIcon from './SearchIcon';

// A search button that opens into a search box. Clicking outside or pressing Escape closes it and
// clears the search. alwaysOpen shows the box from the start and never closes it (the packing list
// page). children (e.g. trip search results) show under it, and clicking them doesn't close it.
function SearchExpandable({ value, onChange, placeholder = 'Search…', children, alwaysOpen }) {
    const [open, setOpen] = useState(!!alwaysOpen);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);

    const close = () => {
        if (alwaysOpen) return;
        setOpen(false);
        onChange('');
    };

    const handleOpen = () => {
        setOpen(true);
        // Focus the box once it has appeared.
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    useEffect(() => {
        if (!open || alwaysOpen) return undefined;
        const onClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <div className="search-expandable" ref={wrapRef}>
            <div className={'search-expandable-pill' + (open ? ' open' : '')}>
                {open ? (
                    <>
                        <SearchIcon />
                        <input
                            ref={inputRef}
                            className="search-expandable-input"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
                            placeholder={placeholder}
                        />
                    </>
                ) : (
                    <button type="button" className="search-expandable-btn" onClick={handleOpen} aria-label="Search">
                        <SearchIcon />
                    </button>
                )}
            </div>
            {open && children}
        </div>
    );
}

export default SearchExpandable;
