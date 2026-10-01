const { BadRequestError } = require('../expressError');

// Flight lookup with AviationStack (key AVIATIONSTACK_API_KEY).
//
// AviationStack's scheduled times are the airport's local time but are wrongly marked as UTC
// ("2026-08-04T13:30:00+00:00" for a 1:30 PM Seattle departure). The real time zone comes
// separately (departure.timezone, like "America/Los_Angeles"). So the display reads the local
// time as written, and the flight length is worked out using each airport's real time zone.

const AVIATIONSTACK_URL = 'https://api.aviationstack.com/v1/flights';

// The local time as written, like "3:45 PM". (timeZone 'UTC' keeps the digits unchanged.)
function formatTime(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

// The date part as written, "YYYY-MM-DD" (taken straight from the text so it can't shift a day).
function rawDate(isoString) {
    return isoString ? isoString.slice(0, 10) : null;
}

// Days between the departure date and the arrival date (0 = same day, 1 = next day). The lookup
// returns today's flight, not the trip's, so only this difference is kept, not the dates.
function arrDayOffset(depScheduled, arrScheduled) {
    const dep = rawDate(depScheduled), arr = rawDate(arrScheduled);
    if (!dep || !arr) return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((new Date(`${arr}T00:00:00Z`) - new Date(`${dep}T00:00:00Z`)) / msPerDay);
}

// The real moment (UTC milliseconds) of a local time wrongly marked as UTC, given the airport's
// time zone. Works out the zone's offset (including daylight saving) with Intl, then corrects by it.
function trueUtcMs(mislabeledIso, timezone) {
    if (!mislabeledIso || !timezone) return null;
    const guessUtcMs = new Date(mislabeledIso).getTime();
    if (Number.isNaN(guessUtcMs)) return null;
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour) % 24; // Intl can write midnight as "24"
    const asUtcIfLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
    const offsetMs = asUtcIfLocal - guessUtcMs;
    return guessUtcMs - offsetMs;
}

// Flight length like "10h 30m", using each airport's real time zone.
function computeDuration(depISO, depTimezone, arrISO, arrTimezone) {
    const depMs = trueUtcMs(depISO, depTimezone);
    const arrMs = trueUtcMs(arrISO, arrTimezone);
    if (depMs == null || arrMs == null || arrMs <= depMs) return null;
    const mins = Math.round((arrMs - depMs) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// A flight number's scheduled route and times (never live status, gates or delays). Returns null
// when there's no such flight, and throws a 400 when the service fails or the key isn't set.
async function lookupFlight(flightNumber) {
    const apiKey = process.env.AVIATIONSTACK_API_KEY;
    if (!apiKey) {
        throw new BadRequestError('Flight lookup is not configured on the server (missing AVIATIONSTACK_API_KEY).');
    }

    const key = (flightNumber || '').trim().toUpperCase();
    if (!key) return null;

    const url = `${AVIATIONSTACK_URL}?access_key=${encodeURIComponent(apiKey)}&flight_iata=${encodeURIComponent(key)}`;
    let res;
    try {
        res = await fetch(url);
    } catch (err) {
        throw new BadRequestError('Could not reach the flight lookup service. Try again, or enter the details manually.');
    }
    if (!res.ok) {
        throw new BadRequestError(`Flight lookup service returned an error (${res.status}). Try again, or enter the details manually.`);
    }

    const json = await res.json();
    if (json.error) {
        // AviationStack's own error (limit reached, bad key): return it as a 400.
        throw new BadRequestError(json.error.message || 'Flight lookup service returned an error.');
    }

    const entry = Array.isArray(json.data) ? json.data[0] : null;
    if (!entry) return null; // no such flight

    return {
        airline: entry.airline?.name || null,
        depAirport: entry.departure?.iata || entry.departure?.airport || null,
        depTime: formatTime(entry.departure?.scheduled),
        arrAirport: entry.arrival?.iata || entry.arrival?.airport || null,
        arrTime: formatTime(entry.arrival?.scheduled),
        arrDayOffset: arrDayOffset(entry.departure?.scheduled, entry.arrival?.scheduled),
        duration: computeDuration(entry.departure?.scheduled, entry.departure?.timezone, entry.arrival?.scheduled, entry.arrival?.timezone),
    };
}

module.exports = { lookupFlight };
