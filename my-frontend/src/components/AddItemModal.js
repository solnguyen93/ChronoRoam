import React, { useEffect, useRef, useState } from 'react';
import { to12Hour, to24Hour, isDateInRange, addDays, daysBetween } from '../utils/dateHelpers';
import { buildTaskText, CAT_LABELS, uiCategoryFor } from '../utils/taskHelpers';
import { CAT_ICON_IMAGES } from '../utils/catIconImages';
import ChronoRoamApi, { AI_FLIGHT_EXTRACTION_ENABLED } from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import ConfirmModal from './ConfirmModal';
import ConfirmationImportModal from './ConfirmationImportModal';
import PurchaseModal from './PurchaseModal';
import LockIcon from './LockIcon';
import { useBillingStatus } from '../hooks/useBillingStatus';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import LocationCopyField from './LocationCopyField';
import { searchAirports } from '../utils/airportSearch';
import DatePickerInput from './DatePickerInput';
import TimePickerInput from './TimePickerInput';
import DurationPickerInput from './DurationPickerInput';

// What an airport suggestion fills in: "Name (CODE)", e.g. "Tokyo Haneda (HND)". This is also
// what the day item's text shows.
const fillAirport = (s) => `${s.name} (${s.code})`;

// "Flight # or Name" holds a flight number ("DL 167") or any name ("Mom's flight"). Left empty,
// it's saved as "Flight". Only something shaped like a flight number is put in capitals.
const FLIGHT_NUMBER_RE = /^[A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?$/i;
// The flight name to save (see above).
function savedFlightName(raw) {
    const v = (raw || '').trim();
    if (!v) return 'Flight';
    return FLIGHT_NUMBER_RE.test(v) ? v.toUpperCase() : v;
}

// Shorter names for the small category buttons; everywhere else uses CAT_LABELS.
const CAT_PICKER_LABELS = { transportation: 'Transport' };
// The category buttons, in order.
const CATEGORIES = ['flight', 'lodging', 'restaurant', 'transportation', 'direction', 'car', 'tour', 'activity'];

// The icon on each category button (the same images as on day items).
const CAT_PICKER_IMAGES = {
    flight: CAT_ICON_IMAGES.flightDepart,
    lodging: CAT_ICON_IMAGES.lodging,
    restaurant: CAT_ICON_IMAGES.restaurant,
    transportation: CAT_ICON_IMAGES.transportation,
    direction: CAT_ICON_IMAGES.direction,
    car: CAT_ICON_IMAGES.car,
    activity: CAT_ICON_IMAGES.activity,
    tour: CAT_ICON_IMAGES.tour,
};

// Every form field, blank.
const EMPTY_FORM = {
    airline: '', depDate: '', depAirport: '', depTime: '', arrDate: '', arrAirport: '', arrTime: '',
    name: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '', actualCheckInTime: '', actualCheckOutTime: '',
    pickupDate: '', pickupTime: '', actualPickupTime: '', returnDate: '', returnTime: '', actualReturnTime: '',
    date: '', from: '', to: '', time: '', location: '', duration: '', link: '', notes: '',
};

// Small icon before the field labels of each side of a flight or stay (departing or landing
// plane, arrow into or out of the hotel), so it's clear which side a field is for. These are
// fixed images (TaskCatIcon would show a level plane for a flight without airports).
const SIDE_ICON_IMAGES = {
    'flight-depart': CAT_ICON_IMAGES.flightDepart,
    'flight-arrive': CAT_ICON_IMAGES.flightArrive,
    'lodging-checkin': CAT_ICON_IMAGES.lodging,
    'lodging-checkout': CAT_ICON_IMAGES.lodging,
};

// The icon described above, with an arrow before ("in") or after ("out") it.
function SideIcon({ cat, arrow }) {
    return (
        <span className="field-label-icon" aria-hidden="true">
            {arrow === 'in' && <span className="field-label-arrow">→</span>}
            <span className="task-cat-icon task-cat-icon-img"><img src={SIDE_ICON_IMAGES[cat]} alt="" /></span>
            {arrow === 'out' && <span className="field-label-arrow">→</span>}
        </span>
    );
}

// The add/edit popup for day items. Adding: pick a category (flight, lodging, restaurant,
// transportation, direction, car rental, tour, activity), then fill in its fields; there's also
// "Paste confirmation email" (AI import) and forwarded emails to review. Editing (mode 'edit'):
// opens straight on the item's form. A flight, transportation, stay or car rental is saved as
// two linked items (task and siblingTask), one for each side.
function AddItemModal({ open, onClose, mode, targetDayDate, task, siblingTask, tripId, tripStart, tripEnd, onSubmit, onDelete, onImportSaved, allTasks = [], emailImportCount = 0, onReviewEmails }) {
    const [selectedCat, setSelectedCat] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState('');
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [aiImportOpen, setAiImportOpen] = useState(false);
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const billing = useBillingStatus();
    // True at 0 credits (remaining is undefined while loading, so not locked then). Then the
    // import link opens the purchase popup instead.
    const importLocked = billing.remaining === 0;
    const seededFor = useRef(null);

    // Flight number lookup: flightLookup is the saved schedule for the last flight number looked
    // up ({ flightNumber, ...fields }), used to fill in empty fields. On save, if the user changed
    // those fields, the changes are saved back to the flight cache. Cleared when the flight
    // number changes.
    const [flightLookup, setFlightLookup] = useState(null); // { flightNumber, ...cachedFields } | null
    const [flightLookupStatus, setFlightLookupStatus] = useState(''); // '' | 'loading' | 'not-found' | 'error'
    // True once the user has set the arrival date; after that it's no longer worked out from the
    // departure date and the flight's day offset.
    const arrDateTouched = useRef(false);
    // True while Link holds the search link filled in from the flight number (not typed by the
    // user), so a new flight number can replace it.
    const linkAutoFilled = useRef(false);

    // Fills the form when the popup opens or switches to another item. Not on background
    // refreshes of the same item, which would erase what's being typed.
    useEffect(() => {
        if (!open) { seededFor.current = null; return; }
        const key = mode + ':' + (task?.id ?? '');
        if (seededFor.current === key) return;
        seededFor.current = key;
        setError('');
        setConfirmingDelete(false);
        setFlightLookupStatus('');
        if (mode === 'add') {
            setSelectedCat(null);
            // A new item starts on the day that was tapped (targetDayDate): the date, departure,
            // check-in and pick-up dates are set to it. Check-in time defaults to 3:00 PM (the
            // usual hotel time). Check-out time gets 11:00 AM only once a check-out date is
            // entered (setCheckOutDate), since a time without a date can't be saved.
            setForm({ ...EMPTY_FORM, date: targetDayDate || '', depDate: targetDayDate || '', checkInDate: targetDayDate || '', checkInTime: '15:00', pickupDate: targetDayDate || '' });
            arrDateTouched.current = false;
            linkAutoFilled.current = false;
            return;
        }
        if (!task) return;
        const uiCat = uiCategoryFor(task.cat);
        setSelectedCat(uiCat);

        // Items saved before fields were stored have only their text. For those, the text is
        // used as the name (fallbackName), so the form isn't blank. Items with fields don't use
        // their text, since it may just be a placeholder like "Flight".
        const hasFields = Object.keys(task.fields || {}).length > 0 || Object.keys(siblingTask?.fields || {}).length > 0;
        const fallbackName = hasFields ? '' : (task.text || siblingTask?.text || '').trim();
        // "A → B" -> { from: 'A', to: 'B' }; anything else -> { from: text, to: '' }.
        const splitArrow = (text) => {
            const m = (text || '').split(/\s*(?:→|->)\s*/);
            return m.length === 2 ? { from: m[0].trim(), to: m[1].trim() } : { from: (text || '').trim(), to: '' };
        };
        if (uiCat === 'flight') {
            const depTask = task.cat === 'flight-depart' ? task : siblingTask;
            const arrTask = task.cat === 'flight-arrive' ? task : siblingTask;
            const df = depTask?.fields || {}, af = arrTask?.fields || {};
            // For old items with no fields only: guesses the airports from the text
            // ("EWR → LIS" -> EWR for departure, "Arrive LIS" -> LIS for arrival).
            const legacyLegs = !Object.keys(df).length && !Object.keys(af).length;
            const depFallback = legacyLegs ? splitArrow(depTask?.text).from : '';
            const arrFallback = legacyLegs ? (arrTask?.text || '').replace(/^arrive\s+/i, '').trim() : '';
            setForm({
                ...EMPTY_FORM,
                airline: df.airline || af.airline || 'Flight',
                depDate: depTask ? depTask.dayDate.slice(0, 10) : '',
                depAirport: df.depAirport || af.depAirport || depFallback,
                depTime: to24Hour(df.depTime || af.depTime),
                arrDate: arrTask ? arrTask.dayDate.slice(0, 10) : '',
                arrAirport: af.arrAirport || df.arrAirport || arrFallback,
                arrTime: to24Hour(af.arrTime || df.arrTime),
                duration: df.duration || af.duration || '',
                link: task.link || siblingTask?.link || '',
                notes: df.notes || af.notes || '',
            });
            // An existing arrival's date is kept as saved, not recalculated from the departure.
            arrDateTouched.current = !!arrTask;
            // A saved link counts as the user's own, so it's never replaced automatically.
            linkAutoFilled.current = false;
        } else if (uiCat === 'lodging') {
            const inTask = task.cat === 'lodging-checkin' ? task : siblingTask;
            const outTask = task.cat === 'lodging-checkout' ? task : siblingTask;
            const inf = inTask?.fields || {}, outf = outTask?.fields || {};
            setForm({
                ...EMPTY_FORM,
                name: inf.name || outf.name || fallbackName,
                checkInDate: inTask ? inTask.dayDate.slice(0, 10) : '',
                checkInTime: to24Hour(inf.checkInTime || outf.checkInTime),
                actualCheckInTime: to24Hour(inf.actualCheckInTime || outf.actualCheckInTime),
                checkOutDate: outTask ? outTask.dayDate.slice(0, 10) : '',
                checkOutTime: to24Hour(outf.checkOutTime || inf.checkOutTime),
                actualCheckOutTime: to24Hour(outf.actualCheckOutTime || inf.actualCheckOutTime),
                link: task.link || siblingTask?.link || '',
                notes: inf.notes || outf.notes || '',
            });
        } else if (uiCat === 'transportation') {
            // Departure and arrival items, like a flight.
            const depTask = task.cat === 'transportation-depart' ? task : siblingTask;
            const arrTask = task.cat === 'transportation-arrive' ? task : siblingTask;
            const df = depTask?.fields || {}, af = arrTask?.fields || {};
            // For old items with no fields only: guesses the places from the text.
            const legacyLegs = !Object.keys(df).length && !Object.keys(af).length;
            const depFallback = legacyLegs ? splitArrow(depTask?.text).from : '';
            const arrFallback = legacyLegs ? (arrTask?.text || '').replace(/^arrive\s+/i, '').trim() : '';
            setForm({
                ...EMPTY_FORM,
                name: df.name || af.name || fallbackName,
                depDate: depTask ? depTask.dayDate.slice(0, 10) : '',
                from: df.from || af.from || depFallback,
                depTime: to24Hour(df.depTime || af.depTime),
                arrDate: arrTask ? arrTask.dayDate.slice(0, 10) : '',
                to: af.to || df.to || arrFallback,
                arrTime: to24Hour(af.arrTime || df.arrTime),
                duration: df.duration || af.duration || '',
                link: task.link || siblingTask?.link || '',
                notes: df.notes || af.notes || '',
            });
            arrDateTouched.current = !!arrTask;
        } else if (uiCat === 'car') {
            const pickupTask = task.cat === 'car-pickup' ? task : siblingTask;
            const returnTask = task.cat === 'car-return' ? task : siblingTask;
            const pf = pickupTask?.fields || {}, rf = returnTask?.fields || {};
            setForm({
                ...EMPTY_FORM,
                name: pf.name || rf.name || fallbackName,
                pickupDate: pickupTask ? pickupTask.dayDate.slice(0, 10) : '',
                pickupTime: to24Hour(pf.pickupTime || rf.pickupTime),
                actualPickupTime: to24Hour(pf.actualPickupTime || rf.actualPickupTime),
                returnDate: returnTask ? returnTask.dayDate.slice(0, 10) : '',
                returnTime: to24Hour(rf.returnTime || pf.returnTime),
                actualReturnTime: to24Hour(rf.actualReturnTime || pf.actualReturnTime),
                location: pf.location || rf.location || '',
                link: task.link || siblingTask?.link || '',
                notes: pf.notes || rf.notes || '',
            });
        } else if (uiCat === 'direction') {
            const f = task.fields || {};
            const fallback = (!f.from && !f.to) ? splitArrow(fallbackName) : { from: '', to: '' };
            setForm({ ...EMPTY_FORM, date: task.dayDate.slice(0, 10), from: f.from || fallback.from, to: f.to || fallback.to, time: to24Hour(f.time), duration: f.duration || '', link: task.link || '', notes: f.notes || '' });
        } else {
            const f = task.fields || {};
            setForm({ ...EMPTY_FORM, date: task.dayDate.slice(0, 10), name: f.name || fallbackName, time: to24Hour(f.time), duration: f.duration || '', location: f.location || '', link: task.link || '', notes: f.notes || '' });
        }
    }, [open, mode, task, siblingTask, targetDayDate]);

    const backdrop = useBackdropDismiss(onClose);
    // Up/down arrow buttons that scroll the whole popup (the number of fields depends on the
    // category).
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [selectedCat, mode]);

    if (!open) return null;

    // Change handler for one form field.
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    // A time picker for one form field.
    const timeField = (key) => <TimePickerInput value={form[key]} onChange={set(key)} />;

    // Setting the departure date. For a flight, the arrival date follows it (departure date +
    // the looked-up flight's day offset) until the user sets the arrival date themselves.
    const setDepDate = (e) => {
        const depDate = e.target.value;
        setForm((f) => {
            // Transportation: moving the departure date moves the arrival date by the same number
            // of days. If only the arrival date was set and the new departure is after it, the
            // arrival moves to the departure date.
            if (selectedCat === 'transportation' && depDate) {
                if (f.depDate && f.arrDate) {
                    return { ...f, depDate, arrDate: addDays(f.arrDate, daysBetween(f.depDate, depDate)) };
                }
                if (f.arrDate && depDate > f.arrDate) {
                    return { ...f, depDate, arrDate: depDate };
                }
                return { ...f, depDate };
            }
            // Flight: the arrival date isn't forced to be on or after departure, since flying
            // east across the date line can land on an earlier date.
            const arrDate = (!arrDateTouched.current && depDate && flightLookup?.arrDayOffset != null)
                ? addDays(depDate, flightLookup.arrDayOffset)
                : f.arrDate;
            return { ...f, depDate, arrDate };
        });
    };
    // Setting the arrival date. From then on it isn't changed automatically.
    const setArrDate = (e) => {
        const arrDate = e.target.value;
        arrDateTouched.current = true;
        setForm((f) => {
            // Transportation: moving the arrival date moves the departure date by the same
            // number of days; the departure can't end up after the arrival.
            if (selectedCat === 'transportation' && arrDate) {
                if (f.arrDate && f.depDate) {
                    return { ...f, arrDate, depDate: addDays(f.depDate, daysBetween(f.arrDate, arrDate)) };
                }
                if (f.depDate && arrDate < f.depDate) {
                    return { ...f, arrDate, depDate: arrDate };
                }
                return { ...f, arrDate };
            }
            return { ...f, arrDate };
        });
    };

    // Setting the check-in date. If check-out is now before it, check-out moves to the same date.
    // Clearing it also clears the check-in times (otherwise the default 3 PM would be left without
    // a date, which can't be saved).
    const setCheckInDate = (e) => {
        const checkInDate = e.target.value;
        setForm((f) => {
            let checkOutDate = f.checkOutDate;
            if (checkOutDate && checkInDate && checkOutDate < checkInDate) checkOutDate = checkInDate;
            if (!checkInDate) return { ...f, checkInDate, checkOutDate, checkInTime: '', actualCheckInTime: '' };
            return { ...f, checkInDate, checkOutDate };
        });
    };

    // Setting the check-out date. The first time, an empty check-out time becomes 11:00 AM.
    // Clearing the date also clears the check-out times.
    const setCheckOutDate = (e) => {
        const checkOutDate = e.target.value;
        setForm((f) => {
            if (!checkOutDate) return { ...f, checkOutDate, checkOutTime: '', actualCheckOutTime: '' };
            return { ...f, checkOutDate, checkOutTime: f.checkOutTime || '11:00' };
        });
    };

    // Same for a car rental: the return date moves up to the pick-up date if it was before it,
    // and clearing the pick-up date clears its times.
    const setPickupDate = (e) => {
        const pickupDate = e.target.value;
        setForm((f) => {
            let returnDate = f.returnDate;
            if (returnDate && pickupDate && returnDate < pickupDate) returnDate = pickupDate;
            if (!pickupDate) return { ...f, pickupDate, returnDate, pickupTime: '', actualPickupTime: '' };
            return { ...f, pickupDate, returnDate };
        });
    };

    // Clearing the return date clears its times.
    const setReturnDate = (e) => {
        const returnDate = e.target.value;
        setForm((f) => {
            if (!returnDate) return { ...f, returnDate, returnTime: '', actualReturnTime: '' };
            return { ...f, returnDate };
        });
    };

    // When both sides are on the same day, an end time can't be before the start time: setting
    // one past the other moves the other to match. For transportation departure/arrival, hotel
    // check-in/check-out (scheduled and planned times separately), and car pick-up/return. Not
    // for flights, whose two times are in different time zones.
    const setDepTime = (e) => {
        const depTime = e.target.value;
        setForm((f) => {
            if (selectedCat === 'transportation' && f.depDate && f.arrDate && f.depDate === f.arrDate && f.arrTime) {
                const dep24 = to24Hour(depTime), arr24 = to24Hour(f.arrTime);
                if (dep24 && arr24 && dep24 > arr24) return { ...f, depTime, arrTime: depTime };
            }
            return { ...f, depTime };
        });
    };
    const setArrTime = (e) => {
        const arrTime = e.target.value;
        setForm((f) => {
            if (selectedCat === 'transportation' && f.depDate && f.arrDate && f.depDate === f.arrDate && f.depTime) {
                const dep24 = to24Hour(f.depTime), arr24 = to24Hour(arrTime);
                if (dep24 && arr24 && arr24 < dep24) return { ...f, arrTime, depTime: arrTime };
            }
            return { ...f, arrTime };
        });
    };

    const setCheckInTime = (e) => {
        const checkInTime = e.target.value;
        setForm((f) => {
            if (f.checkInDate && f.checkOutDate && f.checkInDate === f.checkOutDate && f.checkOutTime) {
                const in24 = to24Hour(checkInTime), out24 = to24Hour(f.checkOutTime);
                if (in24 && out24 && in24 > out24) return { ...f, checkInTime, checkOutTime: checkInTime };
            }
            return { ...f, checkInTime };
        });
    };
    const setCheckOutTime = (e) => {
        const checkOutTime = e.target.value;
        setForm((f) => {
            if (f.checkInDate && f.checkOutDate && f.checkInDate === f.checkOutDate && f.checkInTime) {
                const in24 = to24Hour(f.checkInTime), out24 = to24Hour(checkOutTime);
                if (in24 && out24 && out24 < in24) return { ...f, checkOutTime, checkInTime: checkOutTime };
            }
            return { ...f, checkOutTime };
        });
    };
    const setActualCheckInTime = (e) => {
        const actualCheckInTime = e.target.value;
        setForm((f) => {
            if (f.checkInDate && f.checkOutDate && f.checkInDate === f.checkOutDate && f.actualCheckOutTime) {
                const in24 = to24Hour(actualCheckInTime), out24 = to24Hour(f.actualCheckOutTime);
                if (in24 && out24 && in24 > out24) return { ...f, actualCheckInTime, actualCheckOutTime: actualCheckInTime };
            }
            return { ...f, actualCheckInTime };
        });
    };
    const setActualCheckOutTime = (e) => {
        const actualCheckOutTime = e.target.value;
        setForm((f) => {
            if (f.checkInDate && f.checkOutDate && f.checkInDate === f.checkOutDate && f.actualCheckInTime) {
                const in24 = to24Hour(f.actualCheckInTime), out24 = to24Hour(actualCheckOutTime);
                if (in24 && out24 && out24 < in24) return { ...f, actualCheckOutTime, actualCheckInTime: actualCheckOutTime };
            }
            return { ...f, actualCheckOutTime };
        });
    };

    const setPickupTime = (e) => {
        const pickupTime = e.target.value;
        setForm((f) => {
            if (f.pickupDate && f.returnDate && f.pickupDate === f.returnDate && f.returnTime) {
                const pu24 = to24Hour(pickupTime), rt24 = to24Hour(f.returnTime);
                if (pu24 && rt24 && pu24 > rt24) return { ...f, pickupTime, returnTime: pickupTime };
            }
            return { ...f, pickupTime };
        });
    };
    const setReturnTime = (e) => {
        const returnTime = e.target.value;
        setForm((f) => {
            if (f.pickupDate && f.returnDate && f.pickupDate === f.returnDate && f.pickupTime) {
                const pu24 = to24Hour(f.pickupTime), rt24 = to24Hour(returnTime);
                if (pu24 && rt24 && rt24 < pu24) return { ...f, returnTime, pickupTime: returnTime };
            }
            return { ...f, returnTime };
        });
    };
    const setActualPickupTime = (e) => {
        const actualPickupTime = e.target.value;
        setForm((f) => {
            if (f.pickupDate && f.returnDate && f.pickupDate === f.returnDate && f.actualReturnTime) {
                const pu24 = to24Hour(actualPickupTime), rt24 = to24Hour(f.actualReturnTime);
                if (pu24 && rt24 && pu24 > rt24) return { ...f, actualPickupTime, actualReturnTime: actualPickupTime };
            }
            return { ...f, actualPickupTime };
        });
    };
    const setActualReturnTime = (e) => {
        const actualReturnTime = e.target.value;
        setForm((f) => {
            if (f.pickupDate && f.returnDate && f.pickupDate === f.returnDate && f.actualPickupTime) {
                const pu24 = to24Hour(f.actualPickupTime), rt24 = to24Hour(actualReturnTime);
                if (pu24 && rt24 && rt24 < pu24) return { ...f, actualReturnTime, actualPickupTime: actualReturnTime };
            }
            return { ...f, actualReturnTime };
        });
    };

    // Typing a flight number clears the last lookup, which was for a different number.
    const setFlightNumber = (e) => {
        setForm((f) => ({ ...f, airline: e.target.value }));
        setFlightLookup(null);
        setFlightLookupStatus('');
    };

    // When the flight number box loses focus: if it looks like a flight number, fills in a Google
    // search link and looks up the flight's schedule (from our cache first, see flightRoutes.js).
    const handleFlightNumberBlur = async () => {
        const raw = form.airline.trim();
        // A name ("Flight", "Mom's flight") isn't looked up.
        if (!raw || !FLIGHT_NUMBER_RE.test(raw)) return;
        const flightNumber = raw.toUpperCase();
        // Sets Link to a Google search for the flight number (for live status), unless the user
        // typed their own link. A link filled in for an earlier flight number is replaced.
        setForm((f) => ({ ...f, link: (!f.link || linkAutoFilled.current) ? `https://www.google.com/search?q=${encodeURIComponent(flightNumber)}` : f.link }));
        linkAutoFilled.current = true;
        setFlightLookupStatus('loading');
        try {
            const { flight } = await ChronoRoamApi.getFlight(flightNumber);
            setFlightLookup({ flightNumber, ...flight });
            // 'found' shows a note to double-check the filled-in details.
            setFlightLookupStatus('found');
            // Fills only empty fields. The departure date is never filled in (the lookup doesn't
            // know the trip's date); the arrival date is set from the departure date + the
            // flight's day offset if the departure date is already set (otherwise setDepDate
            // does it later).
            setForm((f) => {
                const arrDate = (!arrDateTouched.current && f.depDate && flight.arrDayOffset != null)
                    ? addDays(f.depDate, flight.arrDayOffset)
                    : f.arrDate;
                return {
                    ...f,
                    depAirport: f.depAirport || flight.depAirport || '',
                    depTime: f.depTime || (flight.depTime ? to24Hour(flight.depTime) : ''),
                    arrAirport: f.arrAirport || flight.arrAirport || '',
                    arrDate,
                    arrTime: f.arrTime || (flight.arrTime ? to24Hour(flight.arrTime) : ''),
                    duration: f.duration || flight.duration || '',
                };
            });
        } catch (err) {
            // A failed lookup just fills nothing in; the fields can still be typed.
            setFlightLookup(null);
            setFlightLookupStatus(err.response?.status === 404 ? 'not-found' : 'error');
        }
    };

    // If the user changed any looked-up details (airports, times, duration, or the days between
    // departure and arrival) for the same flight number, returns the corrected schedule to save
    // to the flight cache. Otherwise null.
    const flightCorrectionIfAny = () => {
        if (!flightLookup) return null;
        const flightNumber = form.airline.trim().toUpperCase();
        if (flightNumber !== flightLookup.flightNumber) return null;
        // The dates themselves are the trip's, not the flight's, so only the days between them
        // are compared.
        const current = {
            airline: flightLookup.airline || null,
            depAirport: form.depAirport.trim() || null,
            depTime: to12Hour(form.depTime) || null,
            arrAirport: form.arrAirport.trim() || null,
            arrTime: to12Hour(form.arrTime) || null,
            arrDayOffset: (form.depDate && form.arrDate) ? daysBetween(form.depDate, form.arrDate) : null,
            duration: form.duration.trim() || null,
        };
        const changed = ['depAirport', 'depTime', 'arrAirport', 'arrTime', 'duration']
            .some((key) => current[key] !== (flightLookup[key] || null))
            || (current.arrDayOffset != null && current.arrDayOffset !== (flightLookup.arrDayOffset ?? null));
        return changed ? current : null;
    };

    // Whether Save is enabled. Each item needs at least one date (to know which day it goes on);
    // most other fields are optional.
    const canSubmit = (() => {
        if (!selectedCat) return false;
        // Flight: a departure or arrival date.
        if (selectedCat === 'flight') {
            return !!(form.depDate || form.arrDate);
        }
        if (selectedCat === 'lodging') {
            // Lodging: a name and a check-in or check-out date, and no time without its date.
            if (!form.name.trim()) return false;
            if (!form.checkInDate && !form.checkOutDate) return false;
            if (form.checkOutTime && !form.checkOutDate) return false;
            if (form.checkInTime && !form.checkInDate) return false;
            if (form.actualCheckInTime && !form.checkInDate) return false;
            if (form.actualCheckOutTime && !form.checkOutDate) return false;
            return true;
        }
        // Transportation: a departure or arrival date.
        if (selectedCat === 'transportation') return !!(form.depDate || form.arrDate);
        if (selectedCat === 'car') {
            // Car rental: a name and a pick-up or return date, and no time without its date.
            if (!form.name.trim()) return false;
            if (!form.pickupDate && !form.returnDate) return false;
            if (form.pickupTime && !form.pickupDate) return false;
            if (form.returnTime && !form.returnDate) return false;
            if (form.actualPickupTime && !form.pickupDate) return false;
            if (form.actualReturnTime && !form.returnDate) return false;
            return true;
        }
        // Direction: a date. Restaurant, tour, activity: a name and a date.
        if (selectedCat === 'direction') return !!form.date;
        return !!(form.name.trim() && form.date);
    })();

    // Turns the form into a list of items to create or update ({ op: 'create' | 'update', ... })
    // for Planner's handleSubmit. Returns null and shows an error if a date is missing or outside
    // the trip. Two-sided categories make one item per side that has a date, sharing a linkId.
    function buildOps() {
        const linkId = task?.linkId || siblingTask?.linkId;

        if (selectedCat === 'flight') {
            if (!form.depDate && !form.arrDate) {
                setError('Add a departure or arrival date.');
                return null;
            }
            // Each date that's filled in must be within the trip (an empty one passes).
            if (!isDateInRange(form.depDate, tripStart, tripEnd) || !isDateInRange(form.arrDate, tripStart, tripEnd)) {
                setError(`That date is outside your trip dates (${tripStart} to ${tripEnd}).`);
                return null;
            }
            const depFields = { airline: savedFlightName(form.airline), depAirport: form.depAirport.trim(), depTime: to12Hour(form.depTime), duration: form.duration.trim(), notes: form.notes.trim() };
            const arrFields = { airline: savedFlightName(form.airline), arrAirport: form.arrAirport.trim(), arrTime: to12Hour(form.arrTime), duration: form.duration.trim(), notes: form.notes.trim() };
            // Both items store every field (not just their own side's), so a field entered before
            // its side has a date (e.g. an arrival airport with only a departure date) is kept.
            // Each item's text only uses its own side's fields.
            const shared = { ...depFields, ...arrFields };
            Object.assign(depFields, shared);
            Object.assign(arrFields, shared);
            const depDate = form.depDate;
            const arrDate = form.arrDate;
            const link = form.link.trim() || null;

            let depExisting = task?.cat === 'flight-depart' ? task : (siblingTask?.cat === 'flight-depart' ? siblingTask : null);
            let arrExisting = task?.cat === 'flight-arrive' ? task : (siblingTask?.cat === 'flight-arrive' ? siblingTask : null);
            let matchedLinkId = linkId;

            // When adding (not editing) with a flight number: if an existing item for the same
            // flight number is missing its other side, the new side is linked to it instead of
            // making a separate flight.
            if (!task && form.airline.trim()) {
                const num = form.airline.trim().toUpperCase();
                const isOrphan = (t) => t.linkId && !allTasks.some((o) => o.id !== t.id && o.linkId === t.linkId);
                if (depDate && !depExisting) {
                    const match = allTasks.find((t) => t.cat === 'flight-arrive' && (t.fields?.airline || '').trim().toUpperCase() === num && isOrphan(t));
                    if (match) { arrExisting = match; matchedLinkId = match.linkId; }
                }
                if (arrDate && !arrExisting) {
                    const match = allTasks.find((t) => t.cat === 'flight-depart' && (t.fields?.airline || '').trim().toUpperCase() === num && isOrphan(t));
                    if (match) { depExisting = match; matchedLinkId = match.linkId; }
                }
            }

            const newLinkId = matchedLinkId || `flight-${Date.now()}`;
            const ops = [];
            if (depDate) {
                ops.push(depExisting
                    ? { op: 'update', id: depExisting.id, dayDate: depDate, text: buildTaskText('flight-depart', depFields), fields: depFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: depDate, text: buildTaskText('flight-depart', depFields), fixed: false, flight: true, cat: 'flight-depart', fields: depFields, link, linkId: newLinkId });
            }
            if (arrDate) {
                ops.push(arrExisting
                    ? { op: 'update', id: arrExisting.id, dayDate: arrDate, text: buildTaskText('flight-arrive', arrFields), fields: arrFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: arrDate, text: buildTaskText('flight-arrive', arrFields), fixed: false, flight: false, cat: 'flight-arrive', fields: arrFields, link, linkId: newLinkId });
            }
            return ops;
        }

        if (selectedCat === 'lodging') {
            if (!form.checkInDate && !form.checkOutDate) {
                setError('Add a check-in or check-out date.');
                return null;
            }
            // Each date that's filled in must be within the trip (an empty one passes).
            if (!isDateInRange(form.checkInDate, tripStart, tripEnd) || !isDateInRange(form.checkOutDate, tripStart, tripEnd)) {
                setError(`That date is outside your trip dates (${tripStart} to ${tripEnd}).`);
                return null;
            }
            const name = form.name.trim();
            const inFields = { name, checkInTime: to12Hour(form.checkInTime), actualCheckInTime: to12Hour(form.actualCheckInTime), notes: form.notes.trim() };
            const outFields = { name, checkOutTime: to12Hour(form.checkOutTime), actualCheckOutTime: to12Hour(form.actualCheckOutTime), notes: form.notes.trim() };
            // Both items store every field (not just their own side's), so a field entered before
            // its side has a date (e.g. an arrival airport with only a departure date) is kept.
            // Each item's text only uses its own side's fields.
            const shared = { ...inFields, ...outFields };
            Object.assign(inFields, shared);
            Object.assign(outFields, shared);
            const inDate = form.checkInDate;
            const outDate = form.checkOutDate;
            const link = form.link.trim() || null;
            const newLinkId = linkId || `lodge-${Date.now()}`;

            const inExisting = task?.cat === 'lodging-checkin' ? task : (siblingTask?.cat === 'lodging-checkin' ? siblingTask : null);
            const outExisting = task?.cat === 'lodging-checkout' ? task : (siblingTask?.cat === 'lodging-checkout' ? siblingTask : null);

            const ops = [];
            if (inDate) {
                ops.push(inExisting
                    ? { op: 'update', id: inExisting.id, dayDate: inDate, text: buildTaskText('lodging-checkin', inFields), fields: inFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: inDate, text: buildTaskText('lodging-checkin', inFields), fixed: false, flight: false, cat: 'lodging-checkin', fields: inFields, link, linkId: newLinkId });
            }
            if (outDate) {
                ops.push(outExisting
                    ? { op: 'update', id: outExisting.id, dayDate: outDate, text: buildTaskText('lodging-checkout', outFields), fields: outFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: outDate, text: buildTaskText('lodging-checkout', outFields), fixed: false, flight: false, cat: 'lodging-checkout', fields: outFields, link, linkId: newLinkId });
            }
            return ops;
        }

        if (selectedCat === 'transportation') {
            // Departure and arrival items, like a flight (but no matching with existing items).
            if (!form.depDate && !form.arrDate) {
                setError('Add a departure or arrival date.');
                return null;
            }
            if (!isDateInRange(form.depDate, tripStart, tripEnd) || !isDateInRange(form.arrDate, tripStart, tripEnd)) {
                setError(`That date is outside your trip dates (${tripStart} to ${tripEnd}).`);
                return null;
            }
            const name = form.name.trim();
            const depFields = { name, from: form.from.trim(), depTime: to12Hour(form.depTime), duration: form.duration.trim(), notes: form.notes.trim() };
            const arrFields = { name, to: form.to.trim(), arrTime: to12Hour(form.arrTime), duration: form.duration.trim(), notes: form.notes.trim() };
            // Both items store every field (not just their own side's), so a field entered before
            // its side has a date (e.g. an arrival airport with only a departure date) is kept.
            // Each item's text only uses its own side's fields.
            const shared = { ...depFields, ...arrFields };
            Object.assign(depFields, shared);
            Object.assign(arrFields, shared);
            const depDate = form.depDate;
            const arrDate = form.arrDate;
            const link = form.link.trim() || null;
            const newLinkId = linkId || `transportation-${Date.now()}`;

            const depExisting = task?.cat === 'transportation-depart' ? task : (siblingTask?.cat === 'transportation-depart' ? siblingTask : null);
            const arrExisting = task?.cat === 'transportation-arrive' ? task : (siblingTask?.cat === 'transportation-arrive' ? siblingTask : null);

            const ops = [];
            if (depDate) {
                ops.push(depExisting
                    ? { op: 'update', id: depExisting.id, dayDate: depDate, text: buildTaskText('transportation-depart', depFields), fields: depFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: depDate, text: buildTaskText('transportation-depart', depFields), fixed: false, flight: false, cat: 'transportation-depart', fields: depFields, link, linkId: newLinkId });
            }
            if (arrDate) {
                ops.push(arrExisting
                    ? { op: 'update', id: arrExisting.id, dayDate: arrDate, text: buildTaskText('transportation-arrive', arrFields), fields: arrFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: arrDate, text: buildTaskText('transportation-arrive', arrFields), fixed: false, flight: false, cat: 'transportation-arrive', fields: arrFields, link, linkId: newLinkId });
            }
            return ops;
        }

        if (selectedCat === 'car') {
            if (!form.pickupDate && !form.returnDate) {
                setError('Add a pick-up or return date.');
                return null;
            }
            if (!isDateInRange(form.pickupDate, tripStart, tripEnd) || !isDateInRange(form.returnDate, tripStart, tripEnd)) {
                setError(`That date is outside your trip dates (${tripStart} to ${tripEnd}).`);
                return null;
            }
            const name = form.name.trim();
            const location = form.location.trim();
            const pickupFields = { name, pickupTime: to12Hour(form.pickupTime), actualPickupTime: to12Hour(form.actualPickupTime), location, notes: form.notes.trim() };
            const returnFields = { name, returnTime: to12Hour(form.returnTime), actualReturnTime: to12Hour(form.actualReturnTime), location, notes: form.notes.trim() };
            // Both items store every field (not just their own side's), so a field entered before
            // its side has a date (e.g. an arrival airport with only a departure date) is kept.
            // Each item's text only uses its own side's fields.
            const shared = { ...pickupFields, ...returnFields };
            Object.assign(pickupFields, shared);
            Object.assign(returnFields, shared);
            const pickupDate = form.pickupDate;
            const returnDate = form.returnDate;
            const link = form.link.trim() || null;
            const newLinkId = linkId || `car-${Date.now()}`;

            const pickupExisting = task?.cat === 'car-pickup' ? task : (siblingTask?.cat === 'car-pickup' ? siblingTask : null);
            const returnExisting = task?.cat === 'car-return' ? task : (siblingTask?.cat === 'car-return' ? siblingTask : null);

            const ops = [];
            if (pickupDate) {
                ops.push(pickupExisting
                    ? { op: 'update', id: pickupExisting.id, dayDate: pickupDate, text: buildTaskText('car-pickup', pickupFields), fields: pickupFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: pickupDate, text: buildTaskText('car-pickup', pickupFields), fixed: false, flight: false, cat: 'car-pickup', fields: pickupFields, link, linkId: newLinkId });
            }
            if (returnDate) {
                ops.push(returnExisting
                    ? { op: 'update', id: returnExisting.id, dayDate: returnDate, text: buildTaskText('car-return', returnFields), fields: returnFields, link, linkId: newLinkId }
                    : { op: 'create', dayDate: returnDate, text: buildTaskText('car-return', returnFields), fixed: false, flight: false, cat: 'car-return', fields: returnFields, link, linkId: newLinkId });
            }
            return ops;
        }

        // One item: direction, restaurant, tour or activity.
        let fields, cat = selectedCat;
        if (selectedCat === 'direction') {
            fields = { from: form.from.trim(), to: form.to.trim(), time: to12Hour(form.time), duration: form.duration.trim(), notes: form.notes.trim() };
        } else {
            fields = { name: form.name.trim(), time: to12Hour(form.time), duration: form.duration.trim(), location: form.location.trim(), notes: form.notes.trim() };
        }
        const dayDate = form.date || (task ? task.dayDate.slice(0, 10) : targetDayDate);
        if (!isDateInRange(dayDate, tripStart, tripEnd)) {
            setError(`That date is outside your trip dates (${tripStart} to ${tripEnd}).`);
            return null;
        }
        const link = form.link.trim() || null;
        const text = buildTaskText(cat, fields);
        return [task
            ? { op: 'update', id: task.id, dayDate, text, fields, link }
            : { op: 'create', dayDate, text, fixed: false, flight: false, cat, fields, link }];
    }

    // Save: submits the items and closes.
    const handleConfirm = () => {
        const ops = buildOps();
        if (!ops) return; // an error is shown
        onSubmit(ops);
        // Also saves the user's changes to the flight's cached schedule, without waiting. If that
        // fails, the item is still saved.
        if (selectedCat === 'flight') {
            const correction = flightCorrectionIfAny();
            if (correction) ChronoRoamApi.saveFlightCorrection(form.airline.trim().toUpperCase(), correction).catch(() => {});
        }
        onClose();
    };

    // Deletes the item and its linked other side, if any (flight, transportation, stay, car
    // rental; siblingTask comes from Planner.js's findSibling).
    const handleDelete = () => {
        onDelete(task.id);
        if (siblingTask) onDelete(siblingTask.id);
        onClose();
    };

    const modalTitle = mode === 'edit' ? (CAT_LABELS[selectedCat] || 'Edit item') : null;

    return (
        <>
        {/* This popup is hidden while the paste-email import popup is open. */}
        {!aiImportOpen && (
        <div className="modal-overlay modal-overlay-top open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll add-item-modal">
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                {modalTitle && <h3 className="add-item-title">{modalTitle}</h3>}

                    <div>
                        {/* The popup is anchored to the top of the screen (.modal-overlay-top),
                            so the category buttons stay in place as the form below changes size. */}
                        {/* "N Imports to review" when there are forwarded emails waiting. */}
                        {mode === 'add' && emailImportCount > 0 && (
                            <button type="button" className="email-import-review-btn" onClick={onReviewEmails}>
                                {emailImportCount} {emailImportCount === 1 ? 'Import' : 'Imports'} to review
                            </button>
                        )}

                        {mode === 'add' && (
                            <div className="cat-grid">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat}
                                        className={'cat-btn' + (selectedCat === cat ? ' active' : '')}
                                        onClick={() => setSelectedCat(cat)}
                                    >
                                        <img className="cat-btn-icon" src={CAT_PICKER_IMAGES[cat]} alt="" />
                                        <span>{CAT_PICKER_LABELS[cat] || CAT_LABELS[cat]}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {mode === 'add' && AI_FLIGHT_EXTRACTION_ENABLED && (
                            importLocked ? (
                                <button type="button" className="ai-import-link-btn ai-import-link-btn-center" onClick={() => setPurchaseOpen(true)}>
                                    <LockIcon width={13} height={13} /> Paste or forward confirmation email
                                </button>
                            ) : (
                                <button type="button" className="ai-import-link-btn ai-import-link-btn-center" onClick={() => setAiImportOpen(true)}>
                                    Paste or forward confirmation email
                                </button>
                            )
                        )}

                        {selectedCat === 'flight' && (
                            <div className="cat-fields">
                                <label className="field-label">Flight # or Name</label>
                                <input type="text" value={form.airline} onChange={setFlightNumber} onBlur={handleFlightNumberBlur} />
                                {flightLookupStatus === 'loading' && <p className="modal-sub">Looking up flight…</p>}
                                {flightLookupStatus === 'found' && <p className="modal-sub">Flight found — please double-check the details below against your confirmation email. This is based on the flight number, not your actual confirmation, so it may not match your exact date or reflect a later delay, gate change, or cancellation.</p>}
                                {flightLookupStatus === 'not-found' && <p className="modal-sub">Couldn't find that flight — enter details below manually.</p>}
                                {flightLookupStatus === 'error' && <p className="modal-sub">Flight lookup unavailable right now — enter details below manually.</p>}
                                <label className="field-label"><SideIcon cat="flight-depart" />Depart date</label>
                                <DatePickerInput value={form.depDate} min={tripStart} max={tripEnd} onChange={setDepDate} />
                                <label className="field-label"><SideIcon cat="flight-depart" />Depart airport</label>
                                <PlaceAutocompleteInput value={form.depAirport} onChange={set('depAirport')} searchFn={searchAirports} getFillValue={fillAirport} />
                                <label className="field-label"><SideIcon cat="flight-depart" />Depart time</label>
                                {timeField('depTime')}
                                <label className="field-label"><SideIcon cat="flight-arrive" />Arrival date</label>
                                <DatePickerInput value={form.arrDate} min={tripStart} max={tripEnd} onChange={setArrDate} />
                                <label className="field-label"><SideIcon cat="flight-arrive" />Arrival airport</label>
                                <PlaceAutocompleteInput value={form.arrAirport} onChange={set('arrAirport')} searchFn={searchAirports} getFillValue={fillAirport} />
                                <label className="field-label"><SideIcon cat="flight-arrive" />Arrival time</label>
                                {timeField('arrTime')}
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={form.duration} onChange={set('duration')} />
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                                {error && <div className="modal-error">{error}</div>}
                            </div>
                        )}

                        {selectedCat === 'lodging' && (
                            <div className="cat-fields">
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={form.name} onChange={set('name')} />
                                <label className="field-label"><SideIcon cat="lodging-checkin" arrow="in" />Check-in date</label>
                                <DatePickerInput value={form.checkInDate} min={tripStart} max={tripEnd} onChange={setCheckInDate} />
                                <label className="field-label"><SideIcon cat="lodging-checkin" arrow="in" />Hotel check-in time</label>
                                <TimePickerInput value={form.checkInTime} onChange={setCheckInTime} />
                                <label className="field-label"><SideIcon cat="lodging-checkin" arrow="in" />Actual check-in time</label>
                                <TimePickerInput value={form.actualCheckInTime} onChange={setActualCheckInTime} />
                                <label className="field-label"><SideIcon cat="lodging-checkout" arrow="out" />Check-out date</label>
                                <DatePickerInput value={form.checkOutDate} min={form.checkInDate || tripStart} max={tripEnd} onChange={setCheckOutDate} />
                                <label className="field-label"><SideIcon cat="lodging-checkout" arrow="out" />Hotel check-out time</label>
                                <TimePickerInput value={form.checkOutTime} onChange={setCheckOutTime} />
                                <label className="field-label"><SideIcon cat="lodging-checkout" arrow="out" />Actual check-out time</label>
                                <TimePickerInput value={form.actualCheckOutTime} onChange={setActualCheckOutTime} />
                                {error && <div className="modal-error">{error}</div>}
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                            </div>
                        )}

                        {selectedCat === 'transportation' && (
                            <div className="cat-fields">
                                <label className="field-label">Name</label>
                                <input type="text" value={form.name} onChange={set('name')} />
                                <label className="field-label">Depart date</label>
                                <DatePickerInput value={form.depDate} min={tripStart} max={tripEnd} onChange={setDepDate} />
                                <label className="field-label">From</label>
                                <LocationCopyField value={form.from} onChange={set('from')} />
                                <label className="field-label">Depart time</label>
                                <TimePickerInput value={form.depTime} onChange={setDepTime} />
                                <label className="field-label">Arrival date</label>
                                <DatePickerInput value={form.arrDate} min={tripStart} max={tripEnd} onChange={setArrDate} />
                                <label className="field-label">To</label>
                                <LocationCopyField value={form.to} onChange={set('to')} />
                                <label className="field-label">Arrival time</label>
                                <TimePickerInput value={form.arrTime} onChange={setArrTime} />
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={form.duration} onChange={set('duration')} />
                                {error && <div className="modal-error">{error}</div>}
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                            </div>
                        )}

                        {selectedCat === 'direction' && (
                            <div className="cat-fields">
                                <label className="field-label">Date<span className="required-mark">*</span></label>
                                <DatePickerInput value={form.date} min={tripStart} max={tripEnd} onChange={set('date')} />
                                <label className="field-label">From</label>
                                <LocationCopyField value={form.from} onChange={set('from')} />
                                <label className="field-label">To</label>
                                <LocationCopyField value={form.to} onChange={set('to')} />
                                <label className="field-label">Time</label>
                                {timeField('time')}
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={form.duration} onChange={set('duration')} />
                                {error && <div className="modal-error">{error}</div>}
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                            </div>
                        )}

                        {selectedCat === 'car' && (
                            <div className="cat-fields">
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={form.name} onChange={set('name')} />
                                <label className="field-label">Pick-up date</label>
                                <DatePickerInput value={form.pickupDate} min={tripStart} max={tripEnd} onChange={setPickupDate} />
                                <label className="field-label">Scheduled pick-up time</label>
                                <TimePickerInput value={form.pickupTime} onChange={setPickupTime} />
                                <label className="field-label">Actual pick-up time</label>
                                <TimePickerInput value={form.actualPickupTime} onChange={setActualPickupTime} />
                                <label className="field-label">Return date</label>
                                <DatePickerInput value={form.returnDate} min={form.pickupDate || tripStart} max={tripEnd} onChange={setReturnDate} />
                                <label className="field-label">Scheduled return time</label>
                                <TimePickerInput value={form.returnTime} onChange={setReturnTime} />
                                <label className="field-label">Actual return time</label>
                                <TimePickerInput value={form.actualReturnTime} onChange={setActualReturnTime} />
                                <label className="field-label">Location</label>
                                <LocationCopyField value={form.location} onChange={set('location')} />
                                {error && <div className="modal-error">{error}</div>}
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                            </div>
                        )}

                        {['restaurant', 'tour', 'activity'].includes(selectedCat) && (
                            <div className="cat-fields">
                                <label className="field-label">Name<span className="required-mark">*</span></label>
                                <input type="text" value={form.name} onChange={set('name')} />
                                <label className="field-label">Date<span className="required-mark">*</span></label>
                                <DatePickerInput value={form.date} min={tripStart} max={tripEnd} onChange={set('date')} />
                                <label className="field-label">Time</label>
                                {timeField('time')}
                                <label className="field-label">Duration</label>
                                <DurationPickerInput value={form.duration} onChange={set('duration')} />
                                <label className="field-label">Location</label>
                                <LocationCopyField value={form.location} onChange={set('location')} />
                                {error && <div className="modal-error">{error}</div>}
                                <label className="field-label">Link</label>
                                <input type="text" value={form.link} onChange={set('link')} />
                                <label className="field-label">Notes</label>
                                <input type="text" value={form.notes} onChange={set('notes')} />
                            </div>
                        )}

                        {/* The buttons don't take focus when pressed. Otherwise, tapping one while
                            typing first closes the keyboard, the popup moves, and iOS drops the
                            tap. */}
                        <div className="modal-btns" onMouseDown={(e) => { if (e.target.closest('button')) e.preventDefault(); }}>
                            <button className="cancel" onClick={onClose}>Cancel</button>
                            <button className="confirm" disabled={!canSubmit} onClick={handleConfirm}>
                                {mode === 'edit' ? 'Save' : 'Add'}
                            </button>
                        </div>

                        {mode === 'edit' && (
                            <div className="account-danger-zone">
                                <button type="button" className="account-delete-link" onClick={() => setConfirmingDelete(true)}>
                                    Delete item
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
        )}
        <ConfirmModal
            open={confirmingDelete}
            onClose={() => setConfirmingDelete(false)}
            onConfirm={handleDelete}
            heading="Delete this item?"
        />
        {AI_FLIGHT_EXTRACTION_ENABLED && (
            // "Paste confirmation email": ConfirmationImportModal in paste mode, for this trip.
            <ConfirmationImportModal
                open={aiImportOpen}
                onClose={() => setAiImportOpen(false)}
                defaultTripId={tripId}
                onResolved={() => { onImportSaved(); onClose(); }}
            />
        )}
        <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} reason="import" />
        </>
    );
}

export default AddItemModal;
