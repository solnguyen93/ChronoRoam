import React, { useEffect, useRef, useState } from 'react';
import ChronoRoamApi from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import { buildTaskText, defaultImportLink } from '../utils/taskHelpers';
import { isDateInRange, daysBetween, formatTripDateRange, todayISO } from '../utils/dateHelpers';
import TimeTextField from './TimeTextField';
import DatePickerInput from './DatePickerInput';
import DurationPickerInput from './DurationPickerInput';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import LocationCopyField from './LocationCopyField';
import EditDetailsModal from './EditDetailsModal';
import { searchAirports } from '../utils/airportSearch';
import { SHAPE, CATEGORY_LABELS, CATEGORY_TABS, reassignLegsForCategory } from '../utils/confirmationCategories';
import { mergeNewTasksByTime } from '../utils/taskTimeSort';
import { CAT_ICON_IMAGES } from '../utils/catIconImages';
import ForwardEmailHint from './ForwardEmailHint';

// What an airport suggestion fills in: "Name (CODE)" (the same as AddItemModal.js).
const fillAirport = (s) => `${s.name} (${s.code})`;

// The icon for each category button.
const CAT_PICKER_IMAGES = {
    flight: CAT_ICON_IMAGES.flightDepart,
    lodging: CAT_ICON_IMAGES.lodging,
    restaurant: CAT_ICON_IMAGES.restaurant,
    transportation: CAT_ICON_IMAGES.transportation,
    direction: CAT_ICON_IMAGES.direction,
    car: CAT_ICON_IMAGES.car,
    tour: CAT_ICON_IMAGES.tour,
    activity: CAT_ICON_IMAGES.activity,
};

// The trip to select at first: defaultTripId (the trip that's open) if given, otherwise the
// first trip whose dates include one of the booking's dates, otherwise the first trip.
function pickDefaultTrip(trips, legs, defaultTripId) {
    if (defaultTripId && trips.some((t) => t.publicId === defaultTripId)) return defaultTripId;
    for (const trip of trips) {
        const start = trip.startDate.slice(0, 10);
        const end = trip.endDate.slice(0, 10);
        for (const leg of legs) {
            const d = leg.depDate || leg.arrDate || leg.checkInDate || leg.checkOutDate || leg.pickupDate || leg.returnDate || leg.date;
            if (d && d >= start && d <= end) return trip.publicId;
        }
    }
    return trips[0]?.publicId || '';
}

// The earliest and latest dates in the booking ('' if none), used to fill in the dates for a
// new trip and to offer extending a trip's dates.
function legDateRange(legs) {
    const dates = legs.flatMap((leg) => [leg.depDate, leg.arrDate, leg.checkInDate, leg.checkOutDate, leg.pickupDate, leg.returnDate, leg.date]).filter(Boolean);
    if (dates.length === 0) return { start: '', end: '' };
    return { start: dates.reduce((a, b) => (b < a ? b : a)), end: dates.reduce((a, b) => (b > a ? b : a)) };
}

// Prepares one extracted entry for the form: blank extra fields, and a default link (a Google
// search for the flight number or name, see defaultImportLink).
function seedLeg(leg, category) {
    const identifier = category === 'flight' ? (leg.flightNumber || '').trim().toUpperCase() : (leg.name || '').trim();
    return { ...leg, link: defaultImportLink(category, identifier) || '', notes: '', actualCheckInTime: '', actualCheckOutTime: '', actualPickupTime: '', actualReturnTime: '' };
}

// Review popup for a booking email before its items are added to a trip: pick the trip, check
// the category, edit each entry's fields, then Add.
//   - Paste mode (no pendingImport): first shows a box to paste the email's text; Extract sends
//     it to the AI (one credit), then shows the review. Shown while `open`.
//   - Forwarded email (pendingImport): the server already extracted it
//     (my-backend/routes/webhookRoutes.js); goes straight to the review. showCaughtUp shows
//     "All caught up!" after the last one. The queue comes from usePendingEmailImports.js.
function ConfirmationImportModal({
    open, pendingImport, showCaughtUp, defaultTripId,
    position, hasPrevious, hasNext, onPrevious, onNext,
    onClose, onResolved,
}) {
    const pasteMode = !pendingImport;
    const [emailText, setEmailText] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [trips, setTrips] = useState([]);
    const [tripId, setTripId] = useState('');
    const [legs, setLegs] = useState(null); // the booking's entries; null before extracting
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [newTripOpen, setNewTripOpen] = useState(false);
    const [rangeFix, setRangeFix] = useState(null); // { start, end } to offer as new trip dates when an entry is outside the trip
    const [category, setCategory] = useState(null);
    // Each category's entries as they were before switching category, so switching back (e.g.
    // lodging -> tour -> lodging) restores them. Cleared for each new booking.
    const categoryCache = useRef({});
    // The id of the forwarded email shown, so a background refresh of the same email doesn't
    // reset the form.
    const loadedImportId = useRef(null);
    // Stands in for a forwarded email's id when pasting (used in the items' linkId).
    const pasteSessionId = useRef(null);

    // Closes. In paste mode, also clears everything for next time.
    function handleClose() {
        if (pasteMode) {
            setEmailText('');
            setCategory(null);
            setLegs(null);
            setError('');
            setTrips([]);
            setTripId('');
            categoryCache.current = {};
            pasteSessionId.current = null;
        }
        onClose();
    }

    const backdrop = useBackdropDismiss(handleClose);
    // Up/down arrow buttons for the trip list, which scrolls on its own.
    const { canBack: tripCanBack, canForward: tripCanForward, idle: tripIdle, scrollBack: tripScrollBack, scrollForward: tripScrollForward, ref: tripScrollRef } = useScrollArrows('y', [trips.length]);
    // Up/down arrow buttons for the whole popup.
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [category, legs?.length, trips.length, pasteMode && legs === null]);

    // Loads the user's trips and selects one (pickDefaultTrip).
    async function loadTripsAndPickDefault(forLegs) {
        const { trips: fetched } = await ChronoRoamApi.getMyTrips();
        setTrips(fetched);
        setTripId(pickDefaultTrip(fetched, forLegs, defaultTripId));
    }

    // Forwarded email: fills the form when a different email is shown.
    useEffect(() => {
        if (!pendingImport) return;
        if (pendingImport.id === loadedImportId.current) return;
        loadedImportId.current = pendingImport.id;
        categoryCache.current = {};
        // The category the AI chose; the user can change it (reassignCategory).
        setCategory(pendingImport.category);
        // Treats missing entries as none instead of crashing.
        const legsIn = pendingImport.legs || [];
        setLegs(legsIn.map((leg) => seedLeg(leg, pendingImport.category)));
        setError('');
        setRangeFix(null);
        setNewTripOpen(false);
        loadTripsAndPickDefault(legsIn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingImport, defaultTripId]);

    // Paste mode: sends the pasted text to the AI, then shows the review. With no entries found,
    // the review says nothing was found (and trips aren't loaded).
    async function handleExtract() {
        if (!emailText.trim()) return;
        setExtracting(true);
        setError('');
        try {
            const { category: detected, legs: extracted } = await ChronoRoamApi.extractConfirmation(emailText);
            categoryCache.current = {};
            setCategory(detected);
            const seeded = (extracted || []).map((leg) => seedLeg(leg, detected));
            setLegs(seeded);
            if (seeded.length > 0) {
                pasteSessionId.current = Date.now();
                await loadTripsAndPickDefault(extracted || []);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Couldn't extract details from that email. Try again, or enter the details manually.");
        } finally {
            setExtracting(false);
        }
    }

    // Changes the category. Restores that category's entries if it was chosen before in this
    // review; otherwise converts the entries (reassignLegsForCategory keeps the fields the two
    // categories share, e.g. tour <-> activity keeps everything).
    function reassignCategory(next) {
        if (next === category) return;
        categoryCache.current[category] = legs;
        const cached = categoryCache.current[next];
        setLegs(cached || reassignLegsForCategory(legs, category, next));
        setCategory(next);
        setError('');
        setRangeFix(null);
    }

    if (pasteMode) {
        if (!open) return null;
    } else if (!pendingImport && !showCaughtUp) {
        return null;
    } else if (pendingImport && legs === null) {
        // A forwarded email just arrived and the effect above hasn't filled in `legs` yet
        // (effects run after rendering). Shows nothing for this one render.
        return null;
    }

    const trip = trips.find((t) => t.publicId === tripId);
    const tripStart = trip?.startDate.slice(0, 10);
    const tripEnd = trip?.endDate.slice(0, 10);

    // Changes one field of entry i.
    function updateLeg(i, field, value) {
        setLegs((prev) => prev.map((leg, idx) => (idx === i ? { ...leg, [field]: value } : leg)));
        // Clears the last date error and extend-dates offer, since they may no longer apply.
        setError('');
        setRangeFix(null);
    }

    function removeLeg(i) {
        setLegs((prev) => prev.filter((_, idx) => idx !== i));
    }

    // The "+ New Trip" form starts with the booking's dates (today if it has none).
    const newTripSeed = (() => {
        const { start, end } = legDateRange(legs || []);
        return { title: '', startDate: start || todayISO(), endDate: end || start || todayISO() };
    })();

    // Creates a trip from the "+ New Trip" form and selects it.
    async function createTrip({ title, startDate, endDate, destinations }) {
        const { trip: created } = await ChronoRoamApi.createTrip(title, startDate, endDate, destinations);
        setTrips((prev) => [...prev, created]);
        setTripId(created.publicId);
        setNewTripOpen(false);
    }

    // Saves a trip's start or end date edited in the trip list.
    async function updateTripDate(publicId, field, value) {
        const updated = await ChronoRoamApi.updateTrip(publicId, { [field]: value });
        setTrips((prev) => prev.map((t) => (t.publicId === publicId ? updated : t)));
        setError('');
        setRangeFix(null);
    }

    // Discard: removes a forwarded email from the queue. For a paste, nothing was saved, so it
    // just closes.
    async function handleDismiss() {
        if (pendingImport) {
            await ChronoRoamApi.removeEmailImport(pendingImport.id);
            onResolved();
        } else {
            handleClose();
        }
    }

    // Changes the trip's dates to rangeFix (the "extend this trip's dates" button).
    async function extendTripDates() {
        if (!rangeFix) return;
        const updated = await ChronoRoamApi.updateTrip(tripId, { startDate: rangeFix.start, endDate: rangeFix.end });
        setTrips((prev) => prev.map((t) => (t.publicId === tripId ? updated : t)));
        setRangeFix(null);
        setError('');
    }

    // Add: checks every entry's dates are within the trip, then adds each entry as day items
    // (two linked items for a flight, transportation, stay or car rental; one otherwise), puts
    // them in time order in their days, and removes the forwarded email from the queue.
    async function handleConfirm() {
        setError('');
        setRangeFix(null);
        if (!trip) { setError('Choose a trip to add this to.'); return; }
        const shape = SHAPE[category];
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const dates = shape === 'stay' ? [leg.checkInDate, leg.checkOutDate] : shape === 'rental' ? [leg.pickupDate, leg.returnDate] : (shape === 'item' || shape === 'direction') ? [leg.date] : [leg.depDate, leg.arrDate];
            const bad = dates.some((d) => d && !isDateInRange(d, tripStart, tripEnd));
            if (bad) {
                setError(`Entry ${i + 1}'s date is outside ${trip.title}'s dates (${tripStart} to ${tripEnd}) — fix the date above, pick a different trip, or extend this trip's own dates below.`);
                // Offers to extend the trip's dates to cover every entry.
                const { start: legsStart, end: legsEnd } = legDateRange(legs);
                const start = legsStart && legsStart < tripStart ? legsStart : tripStart;
                const end = legsEnd && legsEnd > tripEnd ? legsEnd : tripEnd;
                if (start !== tripStart || end !== tripEnd) setRangeFix({ start, end });
                return;
            }
        }

        setBusy(true);
        try {
            const created = [];
            const importKey = pendingImport ? pendingImport.id : pasteSessionId.current;
            for (let i = 0; i < legs.length; i++) {
                const leg = legs[i];
                const linkId = `import-${importKey}-${i}`;
                const notes = (leg.notes || '').trim();

                if (category === 'flight') {
                    if (!leg.depDate && !leg.arrDate) continue;
                    const flightNumber = (leg.flightNumber || '').trim().toUpperCase();
                    const link = (leg.link || '').trim() || defaultImportLink('flight', flightNumber);
                    // Also saves this flight's schedule to the flight cache (the same as a manual
                    // correction). Errors are ignored.
                    if (flightNumber && leg.depDate && leg.arrDate) {
                        ChronoRoamApi.saveFlightCorrection(flightNumber, {
                            airline: flightNumber,
                            depAirport: (leg.depAirport || '').trim(),
                            depTime: (leg.depTime || '').trim(),
                            arrAirport: (leg.arrAirport || '').trim(),
                            arrTime: (leg.arrTime || '').trim(),
                            arrDayOffset: daysBetween(leg.depDate, leg.arrDate),
                            duration: (leg.duration || '').trim(),
                        }).catch(() => {});
                    }
                    if (leg.depDate) {
                        const depFields = { airline: flightNumber, depAirport: (leg.depAirport || '').trim(), depTime: (leg.depTime || '').trim(), duration: (leg.duration || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.depDate, text: buildTaskText('flight-depart', depFields), fixed: false, flight: true, cat: 'flight-depart', fields: depFields, link, linkId }));
                    }
                    if (leg.arrDate) {
                        const arrFields = { airline: flightNumber, arrAirport: (leg.arrAirport || '').trim(), arrTime: (leg.arrTime || '').trim(), duration: (leg.duration || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.arrDate, text: buildTaskText('flight-arrive', arrFields), fixed: false, flight: false, cat: 'flight-arrive', fields: arrFields, link, linkId }));
                    }
                } else if (category === 'transportation') {
                    if (!leg.depDate && !leg.arrDate) continue;
                    const name = (leg.name || '').trim();
                    const link = (leg.link || '').trim() || null;
                    if (leg.depDate) {
                        const depFields = { name, from: (leg.from || '').trim(), depTime: (leg.depTime || '').trim(), duration: (leg.duration || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.depDate, text: buildTaskText('transportation-depart', depFields), fixed: false, flight: false, cat: 'transportation-depart', fields: depFields, link, linkId }));
                    }
                    if (leg.arrDate) {
                        const arrFields = { name, to: (leg.to || '').trim(), arrTime: (leg.arrTime || '').trim(), duration: (leg.duration || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.arrDate, text: buildTaskText('transportation-arrive', arrFields), fixed: false, flight: false, cat: 'transportation-arrive', fields: arrFields, link, linkId }));
                    }
                } else if (category === 'lodging') {
                    if (!leg.checkInDate && !leg.checkOutDate) continue;
                    const name = (leg.name || '').trim();
                    const link = (leg.link || '').trim() || defaultImportLink('lodging', name);
                    if (leg.checkInDate) {
                        const inFields = { name, checkInTime: (leg.checkInTime || '').trim(), actualCheckInTime: (leg.actualCheckInTime || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.checkInDate, text: buildTaskText('lodging-checkin', inFields), fixed: false, flight: false, cat: 'lodging-checkin', fields: inFields, link, linkId }));
                    }
                    if (leg.checkOutDate) {
                        const outFields = { name, checkOutTime: (leg.checkOutTime || '').trim(), actualCheckOutTime: (leg.actualCheckOutTime || '').trim(), notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.checkOutDate, text: buildTaskText('lodging-checkout', outFields), fixed: false, flight: false, cat: 'lodging-checkout', fields: outFields, link, linkId }));
                    }
                } else if (category === 'direction') {
                    if (!leg.date) continue;
                    const link = (leg.link || '').trim() || null;
                    const fields = { from: (leg.from || '').trim(), to: (leg.to || '').trim(), time: (leg.time || '').trim(), duration: (leg.duration || '').trim(), notes };
                    created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.date, text: buildTaskText('direction', fields), fixed: false, flight: false, cat: 'direction', fields, link }));
                } else if (category === 'car') {
                    if (!leg.pickupDate && !leg.returnDate) continue;
                    const name = (leg.name || '').trim();
                    const location = (leg.location || '').trim();
                    const link = (leg.link || '').trim() || null;
                    if (leg.pickupDate) {
                        const pickupFields = { name, pickupTime: (leg.pickupTime || '').trim(), actualPickupTime: (leg.actualPickupTime || '').trim(), location, notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.pickupDate, text: buildTaskText('car-pickup', pickupFields), fixed: false, flight: false, cat: 'car-pickup', fields: pickupFields, link, linkId }));
                    }
                    if (leg.returnDate) {
                        const returnFields = { name, returnTime: (leg.returnTime || '').trim(), actualReturnTime: (leg.actualReturnTime || '').trim(), location, notes };
                        created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.returnDate, text: buildTaskText('car-return', returnFields), fixed: false, flight: false, cat: 'car-return', fields: returnFields, link, linkId }));
                    }
                } else {
                    // Restaurant, tour or activity: one item.
                    if (!leg.date) continue;
                    const link = (leg.link || '').trim() || null;
                    const fields = { name: (leg.name || '').trim(), time: (leg.time || '').trim(), duration: (leg.duration || '').trim(), location: (leg.location || '').trim(), notes };
                    created.push(await ChronoRoamApi.addTask(tripId, { dayDate: leg.date, text: buildTaskText(category, fields), fixed: false, flight: false, cat: category, fields, link }));
                }
            }

            // New items are added at the end of their day; this moves them into time order
            // among the day's other items, which keep their order (utils/taskTimeSort.js).
            const newIds = new Set(created.map((t) => t.id));
            const affectedDays = [...new Set(created.map((t) => t.dayDate.slice(0, 10)))];
            if (affectedDays.length > 0) {
                const { tasks: freshTasks } = await ChronoRoamApi.getTrip(tripId);
                for (const dayDate of affectedDays) {
                    const dayTasks = freshTasks.filter((t) => t.dayDate.slice(0, 10) === dayDate);
                    const existingTasks = dayTasks.filter((t) => !newIds.has(t.id));
                    const newTasksForDay = dayTasks.filter((t) => newIds.has(t.id));
                    const merged = mergeNewTasksByTime(existingTasks, newTasksForDay);
                    await ChronoRoamApi.reorderTasks(tripId, dayDate, merged.map((t) => t.id));
                }
            }

            if (pendingImport) {
                await ChronoRoamApi.removeEmailImport(pendingImport.id);
                onResolved(tripId);
            } else {
                onResolved(tripId);
                handleClose();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong saving this import.');
        } finally {
            setBusy(false);
        }
    }

    if (!pasteMode && showCaughtUp) {
        return (
            <div className="modal-overlay open" {...backdrop}>
                <div className="modal-box">
                    <h3>All caught up!</h3>
                    <p className="modal-sub">Every forwarded email has been reviewed.</p>
                    <div className="modal-btns">
                        <button type="button" className="confirm" onClick={onClose}>Done</button>
                    </div>
                </div>
            </div>
        );
    }

    // Paste mode's first screen: the box to paste the email into.
    if (pasteMode && legs === null) {
        return (
            <div className="modal-overlay modal-overlay-top open" {...backdrop}>
                <div className="modal-box modal-box-flex-scroll">
                    <button type="button" className="modal-close-x" onClick={handleClose} aria-label="Close">×</button>
                    <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                    {outerCanBack && (
                        <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                    )}
                    <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                    <h3>Import confirmation</h3>
                    <p className="modal-sub">Paste the confirmation email text below — we'll figure out what it is. Each import uses 1 credit, even if nothing is found.</p>
                    <textarea
                        className="ai-import-textarea"
                        value={emailText}
                        onChange={(e) => setEmailText(e.target.value)}
                        placeholder="Paste your confirmation email here…"
                        rows={10}
                    />
                    <ForwardEmailHint />
                    {error && <div className="modal-error">{error}</div>}
                    <div className="modal-btns">
                        <button className="cancel" onClick={handleClose}>Cancel</button>
                        <button className="confirm" onClick={handleExtract} disabled={!emailText.trim() || extracting}>
                            {extracting ? 'Extracting…' : 'Extract'}
                        </button>
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

    // Paste mode when the AI found no booking in the text.
    if (pasteMode && legs.length === 0) {
        return (
            <div className="modal-overlay modal-overlay-top open" {...backdrop}>
                <div className="modal-box">
                    <button type="button" className="modal-close-x" onClick={handleClose} aria-label="Close">×</button>
                    <h3>Import confirmation</h3>
                    <p className="modal-sub">Nothing found in that text — try a different excerpt, or enter the details manually.</p>
                    <div className="modal-btns">
                        <button className="cancel" onClick={handleClose}>Close</button>
                        <button className="confirm" onClick={() => { setLegs(null); setCategory(null); }}>Try Again</button>
                    </div>
                </div>
            </div>
        );
    }

    // The review screen.
    return (
        <>
        <div className="modal-overlay modal-overlay-top open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll">
                <button type="button" className="modal-close-x" onClick={handleClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>Review confirmation</h3>
                <p className="modal-sub">This is a snapshot of what the email said. We aren't able to look up your booking's live status from a confirmation alone, so a change on the airline or hotel's end afterward won't reflect here automatically.</p>
                {pendingImport && position && position.total > 1 && (
                    <div className="email-import-nav">
                        <button type="button" className="email-import-nav-btn" onClick={onPrevious} disabled={!hasPrevious}>‹ Previous</button>
                        <span className="modal-sub">{position.current} of {position.total}</span>
                        <button type="button" className="email-import-nav-btn" onClick={onNext} disabled={!hasNext}>Next ›</button>
                    </div>
                )}

                <label className="field-label">Add to trip<span className="required-mark">*</span></label>
                <div className="v-scroll-wrap packlist-pick-scroll-wrap">
                {tripCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (tripIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={tripScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="packlist-pick-list" ref={tripScrollRef}>
                    {trips.map((t) => {
                        const start = t.startDate.slice(0, 10);
                        const end = t.endDate.slice(0, 10);
                        const sameYear = start.slice(0, 4) === end.slice(0, 4);
                        return (
                            // A <div> acting as a button, since it contains the date pickers
                            // (a button can't contain other buttons). Clicking anywhere on it
                            // selects the trip.
                            <div
                                key={t.publicId}
                                role="button"
                                tabIndex={0}
                                className={'packlist-pick-row' + (t.publicId === tripId ? ' selected' : '')}
                                onClick={() => { setTripId(t.publicId); setError(''); setRangeFix(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setTripId(t.publicId); setError(''); setRangeFix(null); } }}
                            >
                                <div className="packlist-pick-row-lines">
                                    {/* The trip name (cut off with "…" if long), then its
                                        editable start and end dates. */}
                                    <span className="packlist-pick-title">{t.title}</span>
                                    <span className="packlist-pick-dates">
                                        <DatePickerInput
                                            value={start}
                                            max={end}
                                            showYear={!sameYear}
                                            triggerClassName="packlist-pick-date-trigger"
                                            onChange={(e) => updateTripDate(t.publicId, 'startDate', e.target.value)}
                                        />
                                        {' – '}
                                        <DatePickerInput
                                            value={end}
                                            min={start}
                                            triggerClassName="packlist-pick-date-trigger"
                                            onChange={(e) => updateTripDate(t.publicId, 'endDate', e.target.value)}
                                        />
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    {/* "+ New Trip" at the end of the list; opens EditDetailsModal. */}
                    <div
                        role="button"
                        tabIndex={0}
                        className="packlist-pick-row packlist-pick-row-new"
                        onClick={() => setNewTripOpen(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setNewTripOpen(true); }}
                    >
                        <span>+ New Trip</span>
                    </div>
                </div>
                {tripCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (tripIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={tripScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>

                <div className="cat-grid">
                    {CATEGORY_TABS.map(({ key }) => (
                        <button
                            key={key}
                            type="button"
                            className={'cat-btn' + (category === key ? ' active' : '')}
                            onClick={() => reassignCategory(key)}
                        >
                            <img className="cat-btn-icon" src={CAT_PICKER_IMAGES[key]} alt="" />
                            <span>{CATEGORY_LABELS[key]}</span>
                        </button>
                    ))}
                </div>

                {legs.map((leg, i) => (
                    <div key={i} className={'cat-fields ai-import-leg' + (i === 0 ? ' ai-import-leg-first' : '')}>
                        <div className="ai-import-leg-head">
                            {/* "Entry N" when there's more than one entry. In paste mode, each
                                can be removed as long as one is left. */}
                            {legs.length > 1 && <span className="ai-import-leg-label">Entry {i + 1}</span>}
                            {pasteMode && legs.length > 1 && (
                                <button type="button" className="ai-import-link-btn" onClick={() => removeLeg(i)}>Remove</button>
                            )}
                        </div>
                        {category === 'flight' && (
                            <>
                                <label className="field-label">Flight # or Name</label>
                                <input type="text" value={leg.flightNumber} onChange={(e) => updateLeg(i, 'flightNumber', e.target.value)} />
                                <label className="field-label">Depart date</label>
                                <DatePickerInput value={leg.depDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'depDate', e.target.value)} />
                                <label className="field-label">Depart airport</label>
                                <PlaceAutocompleteInput value={leg.depAirport} onChange={(e) => updateLeg(i, 'depAirport', e.target.value)} searchFn={searchAirports} getFillValue={fillAirport} />
                                <label className="field-label">Depart time</label>
                                <TimeTextField value={leg.depTime} onChange={(e) => updateLeg(i, 'depTime', e.target.value)} />
                                <label className="field-label">Arrival date</label>
                                <DatePickerInput value={leg.arrDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'arrDate', e.target.value)} />
                                <label className="field-label">Arrival airport</label>
                                <PlaceAutocompleteInput value={leg.arrAirport} onChange={(e) => updateLeg(i, 'arrAirport', e.target.value)} searchFn={searchAirports} getFillValue={fillAirport} />
                                <label className="field-label">Arrival time</label>
                                <TimeTextField value={leg.arrTime} onChange={(e) => updateLeg(i, 'arrTime', e.target.value)} />
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={leg.duration} onChange={(e) => updateLeg(i, 'duration', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                        {category === 'transportation' && (
                            <>
                                <label className="field-label">Name</label>
                                <input type="text" value={leg.name} onChange={(e) => updateLeg(i, 'name', e.target.value)} />
                                <label className="field-label">Depart date</label>
                                <DatePickerInput value={leg.depDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'depDate', e.target.value)} />
                                <label className="field-label">From</label>
                                <LocationCopyField value={leg.from} onChange={(e) => updateLeg(i, 'from', e.target.value)} />
                                <label className="field-label">Depart time</label>
                                <TimeTextField value={leg.depTime} onChange={(e) => updateLeg(i, 'depTime', e.target.value)} />
                                <label className="field-label">Arrival date</label>
                                <DatePickerInput value={leg.arrDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'arrDate', e.target.value)} />
                                <label className="field-label">To</label>
                                <LocationCopyField value={leg.to} onChange={(e) => updateLeg(i, 'to', e.target.value)} />
                                <label className="field-label">Arrival time</label>
                                <TimeTextField value={leg.arrTime} onChange={(e) => updateLeg(i, 'arrTime', e.target.value)} />
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={leg.duration} onChange={(e) => updateLeg(i, 'duration', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                        {category === 'lodging' && (
                            <>
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={leg.name} onChange={(e) => updateLeg(i, 'name', e.target.value)} />
                                <label className="field-label">Check-in date</label>
                                <DatePickerInput value={leg.checkInDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'checkInDate', e.target.value)} />
                                <label className="field-label">Hotel check-in time</label>
                                <TimeTextField value={leg.checkInTime} onChange={(e) => updateLeg(i, 'checkInTime', e.target.value)} />
                                <label className="field-label">Actual check-in time</label>
                                <TimeTextField value={leg.actualCheckInTime} onChange={(e) => updateLeg(i, 'actualCheckInTime', e.target.value)} />
                                <label className="field-label">Check-out date</label>
                                <DatePickerInput value={leg.checkOutDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'checkOutDate', e.target.value)} />
                                <label className="field-label">Hotel check-out time</label>
                                <TimeTextField value={leg.checkOutTime} onChange={(e) => updateLeg(i, 'checkOutTime', e.target.value)} />
                                <label className="field-label">Actual check-out time</label>
                                <TimeTextField value={leg.actualCheckOutTime} onChange={(e) => updateLeg(i, 'actualCheckOutTime', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                        {category === 'direction' && (
                            <>
                                <label className="field-label">Date<span className="required-mark">*</span></label>
                                <DatePickerInput value={leg.date} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'date', e.target.value)} />
                                <label className="field-label">From</label>
                                <LocationCopyField value={leg.from} onChange={(e) => updateLeg(i, 'from', e.target.value)} />
                                <label className="field-label">To</label>
                                <LocationCopyField value={leg.to} onChange={(e) => updateLeg(i, 'to', e.target.value)} />
                                <label className="field-label">Time</label>
                                <TimeTextField value={leg.time} onChange={(e) => updateLeg(i, 'time', e.target.value)} />
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={leg.duration} onChange={(e) => updateLeg(i, 'duration', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                        {category === 'car' && (
                            <>
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={leg.name} onChange={(e) => updateLeg(i, 'name', e.target.value)} />
                                <label className="field-label">Pick-up date</label>
                                <DatePickerInput value={leg.pickupDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'pickupDate', e.target.value)} />
                                <label className="field-label">Scheduled pick-up time</label>
                                <TimeTextField value={leg.pickupTime} onChange={(e) => updateLeg(i, 'pickupTime', e.target.value)} />
                                <label className="field-label">Actual pick-up time</label>
                                <TimeTextField value={leg.actualPickupTime} onChange={(e) => updateLeg(i, 'actualPickupTime', e.target.value)} />
                                <label className="field-label">Return date</label>
                                <DatePickerInput value={leg.returnDate} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'returnDate', e.target.value)} />
                                <label className="field-label">Scheduled return time</label>
                                <TimeTextField value={leg.returnTime} onChange={(e) => updateLeg(i, 'returnTime', e.target.value)} />
                                <label className="field-label">Actual return time</label>
                                <TimeTextField value={leg.actualReturnTime} onChange={(e) => updateLeg(i, 'actualReturnTime', e.target.value)} />
                                <label className="field-label">Location</label>
                                <LocationCopyField value={leg.location} onChange={(e) => updateLeg(i, 'location', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                        {['restaurant', 'tour', 'activity'].includes(category) && (
                            <>
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={leg.name} onChange={(e) => updateLeg(i, 'name', e.target.value)} />
                                <label className="field-label">Date<span className="required-mark">*</span></label>
                                <DatePickerInput value={leg.date} min={tripStart} max={tripEnd} onChange={(e) => updateLeg(i, 'date', e.target.value)} />
                                <label className="field-label">Time</label>
                                <TimeTextField value={leg.time} onChange={(e) => updateLeg(i, 'time', e.target.value)} />
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={leg.duration} onChange={(e) => updateLeg(i, 'duration', e.target.value)} />
                                <label className="field-label">Location</label>
                                <LocationCopyField value={leg.location} onChange={(e) => updateLeg(i, 'location', e.target.value)} />
                                <label className="field-label">Link</label>
                                <input type="text" value={leg.link} onChange={(e) => updateLeg(i, 'link', e.target.value)} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={leg.notes} onChange={(e) => updateLeg(i, 'notes', e.target.value)} />
                            </>
                        )}
                    </div>
                ))}

                {error && <div className="modal-error">{error}</div>}
                {rangeFix && trip && (
                    <button type="button" className="ai-import-link-btn" style={{ marginBottom: 10 }} onClick={extendTripDates}>
                        Extend {trip.title}'s dates to {formatTripDateRange(rangeFix.start, rangeFix.end)}
                    </button>
                )}
                <div className="modal-btns">
                    <button type="button" className="cancel" onClick={handleDismiss} disabled={busy}>{pendingImport ? 'Discard' : 'Cancel'}</button>
                    <button type="button" className="confirm" onClick={handleConfirm} disabled={busy || !tripId}>Confirm</button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>

        <EditDetailsModal
            open={newTripOpen}
            onClose={() => setNewTripOpen(false)}
            trip={newTripSeed}
            heading="Trip details"
            titlePlaceholder="Name"
            confirmLabel="Create"
            onSave={createTrip}
        />
        </>
    );
}

export default ConfirmationImportModal;
