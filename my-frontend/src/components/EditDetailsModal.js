import React, { useEffect, useRef, useState } from 'react';
import { parseISO } from '../utils/dateHelpers';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import DatePickerInput from './DatePickerInput';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import { searchCities } from '../utils/geocode';

// Popup for a trip's title, destinations and dates. Opened from the trip's ⋮ menu ("Edit trip
// details"), and also used as the "+ New Trip" form (TripsList.js passes a blank trip and a
// different heading and button label).
function EditDetailsModal({ open, onClose, trip, onSave, heading = 'Edit trip details', confirmLabel = 'Save', titlePlaceholder = 'Trip title' }) {
    const [title, setTitle] = useState(trip.title);
    const [start, setStart] = useState(trip.startDate.slice(0, 10));
    const [end, setEnd] = useState(trip.endDate.slice(0, 10));
    // One input row per destination. Starts with one blank row if the trip has none.
    const [destinations, setDestinations] = useState((trip.destinations?.length ? trip.destinations : ['']));
    const [error, setError] = useState('');
    const wasOpen = useRef(false);
    // The input element of each destination row, used to move focus with Enter. focusNewRowIndex
    // holds the index of a row that was just added, so the effect below can focus it once it has
    // rendered.
    const destinationRefs = useRef([]);
    const focusNewRowIndex = useRef(null);

    useEffect(() => {
        if (focusNewRowIndex.current != null) {
            destinationRefs.current[focusNewRowIndex.current]?.focus();
            focusNewRowIndex.current = null;
        }
    }, [destinations]);

    // Fills the fields from the trip only when the popup opens. The trip is refreshed in the
    // background while the popup is open, so refilling on every update would erase what's typed.
    useEffect(() => {
        if (open && !wasOpen.current) {
            setTitle(trip.title);
            setStart(trip.startDate.slice(0, 10));
            setEnd(trip.endDate.slice(0, 10));
            setDestinations(trip.destinations?.length ? trip.destinations : ['']);
            setError('');
        }
        wasOpen.current = open;
    }, [open, trip]);

    const backdrop = useBackdropDismiss(onClose);
    // Up/down arrow buttons that scroll the form when it's taller than the window (the
    // destination list can get long).
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [destinations.length]);

    if (!open) return null;

    // Changing the start date also moves the end date to it, but only if the end date is empty
    // or now earlier than the start.
    const changeStart = (e) => {
        const val = e.target.value;
        setStart(val);
        if (!end || parseISO(end) < parseISO(val)) setEnd(val);
    };

    const submit = () => {
        const trimmed = title.trim();
        if (!trimmed) { setError('Title is required.'); return; }
        if (parseISO(end) < parseISO(start)) { setError("End date can't be before the start date."); return; }
        const payload = { title: trimmed, startDate: start, endDate: end, destinations: destinations.map((d) => d.trim()).filter(Boolean) };
        onSave(payload);
    };

    return (
        <div className="modal-overlay open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll">
                <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>{heading}</h3>

                <label className="field-label">{titlePlaceholder}<span className="required-mark">*</span></label>
                <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                />

                <label className="field-label">Destinations</label>
                <div className="edit-details-destinations">
                    {destinations.map((dest, i) => (
                        <div className="destination-row" key={i}>
                            <PlaceAutocompleteInput
                                ref={(el) => { destinationRefs.current[i] = el; }}
                                searchFn={searchCities}
                                value={dest}
                                onChange={(e) => setDestinations(destinations.map((d, j) => (j === i ? e.target.value : d)))}
                                placeholder="Where are you headed?"
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    e.preventDefault();
                                    // Enter on a middle row focuses the next row. Enter on the
                                    // last row adds a new blank row and focuses it, if the last
                                    // row has text; otherwise it does nothing.
                                    if (i < destinations.length - 1) {
                                        destinationRefs.current[i + 1]?.focus();
                                    } else if (dest.trim()) {
                                        focusNewRowIndex.current = destinations.length;
                                        setDestinations([...destinations, '']);
                                    }
                                }}
                            />
                            {/* The × only shows on a row with text. Removing the only row
                                leaves one blank row. Blank rows are dropped on save anyway. */}
                            {dest.trim() && (
                                <button
                                    type="button"
                                    className="inline-delete-btn"
                                    title="Delete"
                                    onClick={() => setDestinations(destinations.length > 1 ? destinations.filter((_, j) => j !== i) : [''])}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        className="add-destination-btn"
                        // Stops the button from taking focus on press, so onClick can still
                        // see which destination input was focused.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            // If a destination input is focused, unfocus it and stop.
                            // Otherwise, if the last row is blank (and isn't the only row),
                            // remove it. Otherwise add a new blank row and focus it.
                            const focusedRow = destinationRefs.current.find((el) => el === document.activeElement);
                            if (focusedRow) {
                                focusedRow.blur();
                                return;
                            }
                            if (destinations.length > 1 && !destinations[destinations.length - 1].trim()) {
                                setDestinations(destinations.slice(0, -1));
                                return;
                            }
                            focusNewRowIndex.current = destinations.length;
                            setDestinations([...destinations, '']);
                        }}
                    >
                        + Destination
                    </button>
                </div>

                <label className="field-label">Dates<span className="required-mark">*</span></label>
                <div className="edit-details-dates">
                    <DatePickerInput value={start} onChange={changeStart} />
                    <span>–</span>
                    <DatePickerInput value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
                </div>

                {error && <div className="modal-error">{error}</div>}

                <div className="modal-btns">
                    <button className="cancel" onClick={onClose}>Cancel</button>
                    <button className="confirm" onClick={submit}>{confirmLabel}</button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
    );
}

export default EditDetailsModal;
