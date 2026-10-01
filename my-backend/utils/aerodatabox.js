const { BadRequestError } = require('../expressError');

// Flight lookup with AeroDataBox (through RapidAPI, key RAPIDAPI_KEY).

const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// The time part of a local time string: "2026-10-15 13:20-07:00" -> "1:20 PM".
function formatLocalTime(localStr) {
    const m = (localStr || '').match(/(\d{2}):(\d{2})[+-]/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ampm}`;
}

// The date part: "2026-10-15 13:20-07:00" -> "2026-10-15".
function localDatePart(localStr) {
    return localStr ? localStr.slice(0, 10) : null;
}

// Days between the departure date and the arrival date (0 = same day, 1 = next day).
function arrDayOffset(depLocal, arrLocal) {
    const dep = localDatePart(depLocal), arr = localDatePart(arrLocal);
    if (!dep || !arr) return null;
    return Math.round((new Date(`${arr}T00:00:00Z`) - new Date(`${dep}T00:00:00Z`)) / 86400000);
}

// Flight length from the UTC departure and arrival times, like "10h 30m".
function computeDuration(depUtc, arrUtc) {
    if (!depUtc || !arrUtc) return null;
    const depMs = new Date(depUtc.replace(' ', 'T')).getTime();
    const arrMs = new Date(arrUtc.replace(' ', 'T')).getTime();
    if (Number.isNaN(depMs) || Number.isNaN(arrMs) || arrMs <= depMs) return null;
    const mins = Math.round((arrMs - depMs) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// A flight number's scheduled route and times, looked up for today's date (the cache stores the
// route, not a date). Returns null when there's no such flight, and throws a 400 when the service
// fails or RAPIDAPI_KEY isn't set.
async function lookupFlightAeroDataBox(flightNumber) {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
        throw new BadRequestError('AeroDataBox lookup is not configured on the server (missing RAPIDAPI_KEY).');
    }

    const key = (flightNumber || '').trim().toUpperCase();
    if (!key) return null;

    const today = new Date().toISOString().slice(0, 10);
    const url = `https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(key)}/${today}`;
    let res;
    try {
        res = await fetch(url, { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': apiKey } });
    } catch (err) {
        throw new BadRequestError('Could not reach the AeroDataBox flight lookup service.');
    }
    if (res.status === 404) return null; // no matching flight — not an error
    if (!res.ok) {
        throw new BadRequestError(`AeroDataBox lookup returned an error (${res.status}).`);
    }

    const json = await res.json();
    const entry = Array.isArray(json) ? json[0] : null;
    if (!entry) return null;

    const depLocal = entry.departure?.scheduledTime?.local;
    const arrLocal = entry.arrival?.scheduledTime?.local;

    return {
        airline: entry.airline?.name || null,
        depAirport: entry.departure?.airport?.iata || null,
        depTime: formatLocalTime(depLocal),
        arrAirport: entry.arrival?.airport?.iata || null,
        arrTime: formatLocalTime(arrLocal),
        arrDayOffset: arrDayOffset(depLocal, arrLocal),
        duration: computeDuration(entry.departure?.scheduledTime?.utc, entry.arrival?.scheduledTime?.utc),
    };
}

module.exports = { lookupFlightAeroDataBox };
