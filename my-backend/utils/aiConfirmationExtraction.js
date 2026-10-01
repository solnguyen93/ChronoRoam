// Reads a booking email with AI: works out what kind of booking it is and pulls out its details.
// Tries the cheap AI first and checks the answer; if it looks wrong, asks Claude instead.
const { assertReasonableLength } = require('./aiTextLimits');
const { callStructuredJSON, extractionProvider } = require('./aiJsonCall');

// Real field values are short (a flight number, a date, a name). The cheap AI sometimes fills a
// field with hundreds of characters of repeated garbage, so anything longer than this is treated
// as broken.
const MAX_REASONABLE_FIELD_LENGTH = 200;

// Whether any field is broken: too long, or containing { or } (it has returned things like
// "22:00'}, {", pieces of JSON inside a value). Real values never contain braces.
function looksCorrupted(entries) {
    return entries.some((entry) =>
        Object.values(entry).some((v) => typeof v === 'string' && (v.length > MAX_REASONABLE_FIELD_LENGTH || /[{}]/.test(v))));
}

// Whether the cheap AI's answer looks like it missed something:
//   - several entries with exactly the same name,
//   - a transportation entry with no from and no to,
//   - fewer flights than the email has ("Flight 1", "Flight 2", ... labels, or "1 stop" meaning
//     2 flights).
// `text` is the email (only needed for the flight count).
function looksIncomplete(entries, text) {
    if (entries.length > 1) {
        const names = entries.map((e) => (e.name || '').trim()).filter(Boolean);
        if (names.length > 1 && new Set(names).size < names.length) return true;
    }
    if (entries.some((entry) => entry.category === 'transportation' && !entry.from && !entry.to)) return true;
    if (text) {
        const flightLabelCount = (text.match(/\bFlight\s+\d+\b/gi) || []).length;
        // "N stop(s)" means N + 1 flights. Uses the largest N mentioned (the same number is often
        // repeated).
        const stopMatches = [...text.matchAll(/(\d+)\s*stops?\b/gi)].map((m) => parseInt(m[1], 10));
        const impliedLegsFromStops = stopMatches.length ? Math.max(...stopMatches) + 1 : 0;
        const flightEntryCount = entries.filter((e) => e.category === 'flight').length;
        if (flightLabelCount >= 2 && flightEntryCount < flightLabelCount) return true;
        // Only when at least one flight came back, since "stops" can also appear in tour or car text.
        if (impliedLegsFromStops >= 2 && flightEntryCount >= 1 && flightEntryCount < impliedLegsFromStops) return true;
    }
    return false;
}

// The answer's shape: a list of entries, each with a category and every field any category uses.
// Fields that don't apply come back as empty strings. One shape for all bookings lets a single AI
// call both identify and read any booking email.
const CONFIRMATION_SCHEMA = {
    type: 'object',
    properties: {
        entries: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        enum: ['flight', 'transportation', 'lodging', 'restaurant', 'car', 'tour', 'activity'],
                        description: 'flight, transportation, lodging, restaurant, car, tour, or activity — see the classification guidance in the main instructions for how to decide between them.',
                    },
                    name: { type: 'string', description: "Carrier/hotel/vendor/venue name, whichever applies. When a booking has both an umbrella package title and a more specific per-entry product name (e.g. an umbrella \"Tokyo Disneyland & Tokyo DisneySea Park Tickets\" title covering a \"Tokyo Disneyland 1-Day Passport\" and separately a \"Tokyo DisneySea 1-Day Passport\"), use the specific product name for each entry, not the shared umbrella title — otherwise multiple genuinely different entries end up looking like identical duplicates. Empty string if not found." },
                    flightNumber: { type: 'string', description: "Flight category only, e.g. 'AA123'. Empty string otherwise." },
                    depAirport: { type: 'string', description: 'Flight category only — 3-letter IATA code if known, else airport/city name. Empty string otherwise.' },
                    arrAirport: { type: 'string', description: 'Flight category only — 3-letter IATA code if known, else airport/city name. Empty string otherwise.' },
                    from: { type: 'string', description: 'Transportation category only — starting station/location. Empty string otherwise.' },
                    to: { type: 'string', description: 'Transportation category only — destination station/location. Empty string otherwise.' },
                    depDate: { type: 'string', description: 'Flight/transportation only — departure date as YYYY-MM-DD. Empty string otherwise.' },
                    depTime: { type: 'string', description: "Flight/transportation only — departure time as written, e.g. '10:00 AM'. Empty string otherwise." },
                    arrDate: { type: 'string', description: 'Flight/transportation only — arrival date as YYYY-MM-DD (may differ from depDate). Empty string otherwise.' },
                    arrTime: { type: 'string', description: "Flight/transportation only — arrival time as written. Empty string otherwise." },
                    checkInDate: { type: 'string', description: 'Lodging only — check-in date as YYYY-MM-DD. Empty string otherwise.' },
                    checkInTime: { type: 'string', description: "Lodging only — check-in time as written, e.g. '3:00 PM'. Empty string otherwise." },
                    checkOutDate: { type: 'string', description: 'Lodging only — check-out date as YYYY-MM-DD. Empty string otherwise.' },
                    checkOutTime: { type: 'string', description: "Lodging only — check-out time as written, e.g. '11:00 AM'. Empty string otherwise." },
                    pickupDate: { type: 'string', description: 'Car rental only — pickup date as YYYY-MM-DD. Empty string otherwise.' },
                    pickupTime: { type: 'string', description: "Car rental only — pickup time as written, e.g. '10:00 AM'. Empty string otherwise." },
                    returnDate: { type: 'string', description: 'Car rental only — return/drop-off date as YYYY-MM-DD. Empty string otherwise.' },
                    returnTime: { type: 'string', description: "Car rental only — return/drop-off time as written. Empty string otherwise." },
                    date: { type: 'string', description: 'restaurant/tour/activity only — date as YYYY-MM-DD. Empty string otherwise.' },
                    time: { type: 'string', description: "restaurant/tour/activity only — time as written, e.g. '7:30 PM'. Empty string otherwise." },
                    location: { type: 'string', description: 'restaurant/car/tour/activity only — venue/meeting-point/rental pickup location. Empty string otherwise.' },
                    duration: { type: 'string', description: "Duration if stated, e.g. '2h 30m'. Empty string if unknown — not used for car rentals, which use pickup/return dates instead." },
                },
                required: [
                    'category', 'name', 'flightNumber', 'depAirport', 'arrAirport', 'from', 'to',
                    'depDate', 'depTime', 'arrDate', 'arrTime', 'checkInDate', 'checkInTime',
                    'checkOutDate', 'checkOutTime', 'pickupDate', 'pickupTime', 'returnDate', 'returnTime',
                    'date', 'time', 'location', 'duration',
                ],
                additionalProperties: false,
            },
        },
    },
    required: ['entries'],
    additionalProperties: false,
};

// The fields each category keeps (the rest are dropped).
const CATEGORY_PICKS = {
    flight: ['flightNumber', 'depAirport', 'depDate', 'depTime', 'arrAirport', 'arrDate', 'arrTime', 'duration'],
    transportation: ['name', 'from', 'to', 'depDate', 'depTime', 'arrDate', 'arrTime', 'duration'],
    lodging: ['name', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime'],
    restaurant: ['name', 'date', 'time', 'duration', 'location'],
    car: ['name', 'pickupDate', 'pickupTime', 'returnDate', 'returnTime', 'location'],
    tour: ['name', 'date', 'time', 'duration', 'location'],
    activity: ['name', 'date', 'time', 'duration', 'location'],
};

// An entry with only its category's fields.
function pickFields(entry, category) {
    const picked = {};
    for (const key of CATEGORY_PICKS[category]) picked[key] = entry[key];
    return picked;
}

// The instructions sent with the email, used for both AIs. Kept short on purpose (a longer prompt
// made Claude refuse more often); the checks above catch bad answers instead. It covers what the
// categories mean, one entry per flight, and how to pick the year and dates.
function buildExtractionPrompt(text, today) {
    return `Today's date is ${today}. Read this email (or several forwarded/pasted together) and extract every booking/reservation entry into the given schema, the way a person skimming it would.

Categories: flight (airline + flight number, depart/arrive AIRPORTS), transportation (train/bus/ferry/rideshare — depart/arrive locations that are NOT airports), lodging (an overnight stay — needs an actual check-in AND check-out, or a number of nights; don't use this for a dated ticket/pass with no room or stay attached), restaurant (one dining reservation, a date + time), car (a rental car — needs a pickup date AND a return date), tour (a guide-led experience), activity (a self-directed ticket/pass/admission — a theme park day pass, a museum/show ticket, a timed-entry voucher, even from an operator that also sells guided tours). A tour or activity spanning multiple days (a multi-day pass, a multi-day trekking package) gets one entry per calendar day it covers, same name repeated — there's no date-range field, and this is never lodging even if the dates could superficially look like a check-in/check-out.

If the email contains more than one separate booking (e.g. two forwarded emails concatenated), extract one entry per distinct booking — never merge two bookings' dates together. If a single itinerary shows more than one flight segment under one confirmation (labeled "Flight 1," "Flight 2," or otherwise more than one flight number/route), output one separate entry per segment — never merge two segments into one entry's fields.

If a date has no year printed, pick this year or next year, whichever falls on or after today (${today}) — travel bookings are for upcoming trips, so never pick a year that's already passed.

DATES: never compute a date from duration or timezone math — a long-haul flight can land a calendar day earlier OR later than naive arithmetic suggests, and that kind of reasoning is exactly what gets this wrong. Instead just use whichever date is actually printed: if a specific time has its own date right next to it, use that. If the source instead states ONE overall date for the whole journey (e.g. a header like "Hong Kong to Seattle - Sunday, November 29, 2026") and a leg's arrival time has no date of its own printed next to it, use that same stated journey date for it — don't assume a next-day (or previous-day) rollover just because the flight is long or overnight.

If a field isn't present or doesn't apply, use an empty string — never guess. If the text isn't a booking confirmation at all, return an empty entries array.

${text}`;
}

// Runs the AI call. With the cheap AI (AI_EXTRACTION_PROVIDER=openai) as the main one, its answer
// is checked and Claude is asked instead when needed (see below). With Claude as the main one,
// its answer is returned as it is.
async function callWithCorruptionFallback(callArgs, sourceText) {
    const primary = extractionProvider();

    // Emails labeling 2 or more flights ("Flight 1", "Flight 2") go straight to Claude: the cheap AI
    // often drops a later flight on these.
    const flightLabelCount = (sourceText.match(/\bFlight\s+\d+\b/gi) || []).length;
    if (primary === 'openai' && flightLabelCount >= 2) {
        try {
            return await callStructuredJSON({ ...callArgs, provider: 'anthropic' });
        } catch (err) {
            // Claude sometimes refuses real booking emails, and asking again doesn't help, so use the
            // cheap AI instead (it doesn't refuse).
            return callStructuredJSON({ ...callArgs, provider: 'openai' });
        }
    }

    let parsed;
    try {
        parsed = await callStructuredJSON({ ...callArgs, provider: primary });
    } catch (err) {
        // The cheap AI failed or took too long: ask Claude instead of showing an error.
        if (primary !== 'openai') throw err;
        return callStructuredJSON({ ...callArgs, provider: 'anthropic' });
    }
    const entries = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
    if (primary !== 'openai') return parsed;
    // Ask Claude when the cheap AI's answer is empty, broken, looks incomplete, or is a tour or
    // activity (the cheap AI doesn't reliably split a multi-day tour into one entry per day).
    const alwaysEscalate = entries.some((e) => e.category === 'tour' || e.category === 'activity');
    const unreliable = entries.length === 0 || looksCorrupted(entries) || looksIncomplete(entries, sourceText) || alwaysEscalate;
    if (!unreliable) return parsed;
    try {
        return await callStructuredJSON({ ...callArgs, provider: 'anthropic' });
    } catch (err) {
        // Claude refused: use the cheap AI's answer rather than showing an error.
        return parsed;
    }
}

// Reads a booking email (forwarded or pasted). Returns { category, legs } — the kind of booking and
// its entries (one per flight, stay, reservation, or tour/activity day) — or
// { category: null, legs: [] } when it isn't a booking. If the AI returns several kinds of
// booking, only the first kind is kept.
async function extractConfirmation(emailText) {
    const text = (emailText || '').trim();
    if (!text) return { category: null, legs: [] };
    assertReasonableLength(text);

    const today = new Date().toISOString().slice(0, 10);
    const parsed = await callWithCorruptionFallback({
        schemaName: 'confirmation_entries',
        schema: CONFIRMATION_SCHEMA,
        prompt: buildExtractionPrompt(text, today),
        refusalMessage: "Couldn't extract details from that email.",
        parseErrorMessage: "Couldn't parse the extracted details from that email.",
        unavailableMessage: 'AI extraction is unavailable right now.',
    }, text);

    const entries = parsed && Array.isArray(parsed.entries) ? parsed.entries : [];
    if (entries.length === 0) return { category: null, legs: [] };

    const category = entries[0].category;
    const legs = entries.filter((e) => e.category === category).map((e) => pickFields(e, category));
    return { category, legs };
}

module.exports = { extractConfirmation };
