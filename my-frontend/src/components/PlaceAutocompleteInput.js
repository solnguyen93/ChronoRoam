import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchPlaces } from '../utils/photon';
import { useFloatingPopover } from '../hooks/useFloatingPopover';

// A text field with suggestions: type a few letters ("ichiran shin") and pick a suggestion
// ("Ichiran — Shinjuku, Tokyo"), or just keep your own text. onChange gets { target: { value } }
// like a normal input.
//   searchFn: where suggestions come from (default: utils/photon.js places; searchAirports for
//     airport fields).
//   getFillValue: what goes in the field when a suggestion is picked (default: its label; airport
//     fields use the code).
//   onKeyDown: called for keys the suggestion list didn't use (e.g. Enter with no suggestion
//     highlighted).
// The ref goes to the <input>.
const PlaceAutocompleteInput = forwardRef(function PlaceAutocompleteInput(
    { value, onChange, placeholder, searchFn = searchPlaces, getFillValue = (s) => s.label, onKeyDown: onKeyDownProp },
    forwardedRef,
) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const debounceRef = useRef(null);
    const wrapRef = useRef(null);
    const inputRef = useRef(null);
    useImperativeHandle(forwardedRef, () => inputRef.current);
    const { popoverRef, style: popoverStyle } = useFloatingPopover(open, inputRef, { matchTriggerWidth: true, alwaysBelow: true });

    useEffect(() => {
        // Close on a click outside. The list is drawn elsewhere on the page (a portal), so a click
        // on a suggestion counts as inside.
        function handleClickOutside(e) {
            const inWrap = wrapRef.current && wrapRef.current.contains(e.target);
            const inPopover = popoverRef.current && popoverRef.current.contains(e.target);
            if (!inWrap && !inPopover) setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [popoverRef]);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    function fireChange(nextValue) {
        onChange({ target: { value: nextValue } });
    }

    function handleInputChange(e) {
        const next = e.target.value;
        fireChange(next);
        setHighlighted(-1);
        clearTimeout(debounceRef.current);

        if (next.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const results = await searchFn(next);
            setSuggestions(results);
            setOpen(results.length > 0);
        }, 300);
    }

    function selectSuggestion(s) {
        fireChange(getFillValue(s));
        setSuggestions([]);
        setOpen(false);
    }

    function handleKeyDown(e) {
        if (open && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
                return;
            }
            if (e.key === 'Enter' && highlighted >= 0) {
                e.preventDefault();
                selectSuggestion(suggestions[highlighted]);
                return;
            }
            if (e.key === 'Escape') {
                setOpen(false);
                return;
            }
        }
        onKeyDownProp?.(e);
    }

    return (
        <div className="place-autocomplete-wrap" ref={wrapRef}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
            />
            {open && createPortal(
                <ul className="place-autocomplete-list" ref={popoverRef} style={popoverStyle || { visibility: 'hidden' }}>
                    {suggestions.map((s, i) => (
                        <li
                            key={`${s.label}-${i}`}
                            className={i === highlighted ? 'active' : ''}
                            onMouseDown={() => selectSuggestion(s)}
                        >
                            {s.label}
                        </li>
                    ))}
                </ul>,
                document.body,
            )}
        </div>
    );
});

export default PlaceAutocompleteInput;
