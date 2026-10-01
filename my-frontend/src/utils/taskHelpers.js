import { to24Hour } from './dateHelpers';

// The link an imported item gets if the user hasn't set one: a Google search for the flight
// number or place name (for example flight status, or the hotel's site). Only for flight,
// lodging, restaurant, tour, activity and car rental. Returns null otherwise, or with no name.
export function defaultImportLink(category, identifier) {
    if (!identifier) return null;
    if (!['flight', 'lodging', 'restaurant', 'tour', 'activity', 'car'].includes(category)) return null;
    return `https://www.google.com/search?q=${encodeURIComponent(identifier)}`;
}

// The name of each category as shown in the add/edit item popup.
export const CAT_LABELS = {
    flight: 'Flight', lodging: 'Lodging', restaurant: 'Restaurant', transportation: 'Transportation', direction: 'Direction',
    car: 'Car Rental', tour: 'Tour', activity: 'Activity',
};

// The heading for each stored item category (one per side of a flight, stay, trip or rental).
export const CAT_TITLES = {
    'flight-depart': 'Flight — Departure', 'flight-arrive': 'Flight — Arrival',
    'lodging-checkin': 'Lodging — Check-in', 'lodging-checkout': 'Lodging — Check-out',
    'transportation-depart': 'Transportation — Departure', 'transportation-arrive': 'Transportation — Arrival',
    'car-pickup': 'Car Rental — Pick-up', 'car-return': 'Car Rental — Return',
    direction: 'Direction',
    restaurant: 'Restaurant', tour: 'Tour', activity: 'Activity',
};

// The popup category for a stored item category, e.g. 'flight-depart' -> 'flight'.
export function uiCategoryFor(cat) {
    if (cat === 'flight-depart' || cat === 'flight-arrive') return 'flight';
    if (cat === 'lodging-checkin' || cat === 'lodging-checkout') return 'lodging';
    if (cat === 'transportation-depart' || cat === 'transportation-arrive') return 'transportation';
    if (cat === 'car-pickup' || cat === 'car-return') return 'car';
    return cat;
}

// Builds an item's one-line text from its category and form fields, e.g.
// "United: Depart SFO · 9:35 AM · 11h 20m". The category icon is drawn separately, so the text
// has no emoji.
export function buildTaskText(cat, f) {
    if (cat === 'flight-depart') {
        let t = (f.airline || 'Flight') + (f.depAirport ? ': Depart ' + f.depAirport + (f.depTime ? ' · ' + f.depTime : '') : '');
        if (f.duration) t += ' · ' + f.duration;
        return t;
    }
    if (cat === 'flight-arrive') {
        return 'Arrive ' + (f.arrAirport || '?') + (f.arrTime ? ' · ' + f.arrTime : '');
    }
    if (cat === 'direction') {
        let t = (f.from || '?') + ' → ' + (f.to || '?');
        if (f.time) t += ' · ' + f.time;
        if (f.duration) t += ' · (' + f.duration + ')';
        return t;
    }
    if (cat === 'lodging-checkin') {
        // Uses the user's own planned arrival time if set, otherwise the hotel's check-in time.
        const time = f.actualCheckInTime || f.checkInTime;
        return 'Check In: ' + (f.name || '?') + (time ? ' · ' + time : '');
    }
    if (cat === 'lodging-checkout') {
        // Same for check-out: planned time first, otherwise the hotel's check-out time.
        const time = f.actualCheckOutTime || f.checkOutTime;
        return 'Check Out: ' + (f.name || '?') + (time ? ' · ' + time : '');
    }
    if (cat === 'transportation-depart') {
        // Like a flight: a departure item and a separate arrival item (which can be on a later
        // day). The text says "Depart"/"Arrive" because both use the same icon.
        let t = (f.name || 'Transportation') + (f.from ? ': Depart ' + f.from + (f.depTime ? ' · ' + f.depTime : '') : '');
        if (f.duration) t += ' · ' + f.duration;
        return t;
    }
    if (cat === 'transportation-arrive') {
        return 'Arrive ' + (f.to || '?') + (f.arrTime ? ' · ' + f.arrTime : '');
    }
    if (cat === 'car-pickup') {
        // Planned time first, otherwise the rental's scheduled time (same for return below).
        const time = f.actualPickupTime || f.pickupTime;
        return 'Pick Up: ' + (f.name || '?') + (time ? ' · ' + time : '');
    }
    if (cat === 'car-return') {
        const time = f.actualReturnTime || f.returnTime;
        return 'Return: ' + (f.name || '?') + (time ? ' · ' + time : '');
    }
    // Restaurant, tour and activity: "Name: time · (duration)".
    let t = f.name;
    if (f.time) t += ': ' + f.time;
    if (f.duration) t += ' · (' + f.duration + ')';
    return t;
}

// For showing an item's text (TaskRow.js): shows every time in 12-hour form, and adds the
// 24-hour time as a small badge for afternoon and evening times. Examples:
//   "2:20 PM" -> "2:20 PM" + badge "14:20"
//   "16:15"   -> "4:15 PM" + badge "16:15"   (a time with no AM/PM is read as 24-hour)
//   "9:35 AM" -> "9:35 AM"                   (no badge; the 24-hour form looks the same)
// Durations like "(2h 30m)" aren't matched. Returns a list of text pieces and { badge } objects,
// so TaskRow can draw each badge in its own dimmer color. Only for display; the saved text isn't
// changed.
export function withTimeBadges(text) {
    if (!text) return [text];
    const regex = /\b(\d{1,2}):(\d{2})(\s*[AaPp][Mm])?\b/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const [full, hStr, mStr, ampm] = match;
        let display = full;
        let badge = null;
        if (ampm) {
            const t24 = to24Hour(full);
            const h24 = parseInt(t24.split(':')[0], 10);
            if (h24 > 12) badge = t24;
        } else {
            const h24 = parseInt(hStr, 10);
            if (h24 <= 23) { // hours above 23 aren't a time, so they're left as they are
                const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                display = `${h12}:${mStr} ${h24 >= 12 ? 'PM' : 'AM'}`;
                if (h24 > 12) badge = full;
            }
        }
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push(display);
        if (badge) { parts.push(' '); parts.push({ badge }); }
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
}
