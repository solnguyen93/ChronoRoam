import AIRPORT_COORDS from './airportCodes';
import geocode from './geocode';
import PLACE_NAMES, { MAX_PLACE_NAME_WORDS, normalizeForMatch } from './placeNames';
import { to24Hour } from './dateHelpers';

// The airport code from an airport field, which is either just the code ("PUS", from an AI
// import) or "Name (PUS)" (picked in the add-item popup). Returned in capitals.
function extractAirportCode(raw) {
    const s = (raw || '').trim();
    const m = s.match(/\(([A-Za-z]{3})\)\s*$/);
    return (m ? m[1] : s).toUpperCase();
}

// The hour (0-23) of an arrival time like "10:00 PM", or null if there's no time.
function arrivalHour(timeStr) {
    const t24 = to24Hour(timeStr);
    if (!t24) return null;
    return parseInt(t24.split(':')[0], 10);
}

// Distance in km between two points on Earth.
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Removes words like "trip" and "vacation", so "Tokyo Trip" becomes "Tokyo".
function titleToQuery(title) {
    return (title || '').replace(/\b(trip|vacation|holiday|itinerary|getaway)\b/gi, '').trim();
}

// Finds a place in the trip title, e.g. "Seattle one day test" -> Seattle. Checks groups of
// words, longest first (so "New York City" finds "New York"), against a built-in list of
// country names and large cities (placeNames.js), then looks up the first match's location.
// Returns null without any lookup when no words match.
async function resolveTitleLocation(title) {
    const cleaned = titleToQuery(title);
    const words = cleaned.split(/\s+/).filter(Boolean);
    let match = null;
    for (let len = Math.min(words.length, MAX_PLACE_NAME_WORDS); len >= 1 && !match; len--) {
        for (let start = 0; start + len <= words.length; start++) {
            const phrase = words.slice(start, start + len).join(' ');
            // Compared without accents, but the words as typed (e.g. "Cancún") are what's
            // looked up.
            if (PLACE_NAMES.has(normalizeForMatch(phrase))) {
                match = phrase;
                break;
            }
        }
    }
    return match ? geocode(match) : null;
}

// The places a day's items point to, with the arrival hour when there is one:
//   - airportCandidates: flight arrival airports
//   - textCandidates: place names to look up, most trusted first: transportation or direction
//     destination (priority 1), hotel check-in (2), then a restaurant, car rental, tour or
//     activity location (3)
function dayCandidates(tasks) {
    const airportCandidates = [];
    const textCandidates = [];
    for (const t of tasks) {
        const f = t.fields || {};
        if (t.cat === 'flight-arrive' && f.arrAirport) {
            airportCandidates.push({ code: extractAirportCode(f.arrAirport), hour: arrivalHour(f.arrTime) });
        } else if (t.cat === 'transportation-arrive' && f.to) {
            textCandidates.push({ priority: 1, query: f.to, hour: arrivalHour(f.arrTime) });
        } else if (t.cat === 'direction' && f.to) {
            // A direction's time is in fields.time (not arrTime).
            textCandidates.push({ priority: 1, query: f.to, hour: arrivalHour(f.time) });
        } else if (t.cat === 'lodging-checkin' && f.name) {
            textCandidates.push({ priority: 2, query: f.name, hour: null });
        } else if (['restaurant', 'car-pickup', 'car-return', 'tour', 'activity'].includes(t.cat) && f.location) {
            textCandidates.push({ priority: 3, query: f.location, hour: null });
        }
    }
    textCandidates.sort((a, b) => a.priority - b.priority);
    return { airportCandidates, textCandidates };
}

// The trip's home airport: the airport of the first flight departure, if the last flight
// arrival is the same airport (a round trip). Otherwise null.
function detectBaseAirport(dateList, tasksByDay) {
    let outboundAirport = null;
    let finalArrivalAirport = null;
    for (const date of dateList) {
        for (const t of tasksByDay[date] || []) {
            const f = t.fields || {};
            if (t.cat === 'flight-depart' && f.depAirport && !outboundAirport) {
                outboundAirport = extractAirportCode(f.depAirport);
            }
            if (t.cat === 'flight-arrive' && f.arrAirport) {
                finalArrivalAirport = extractAirportCode(f.arrAirport); // keeps the last arrival
            }
        }
    }
    return (outboundAirport && outboundAirport === finalArrivalAirport) ? outboundAirport : null;
}

// Works out where the traveler is on each day of the trip, for that day's weather. Returns:
//   - byDay: { 'YYYY-MM-DD': { lat, lon, city, ... } or null }
//   - fallback: the location from the first destination, or else from the trip title
//   - itineraryPlaces: the cities the day items point to, in order ({ city, country }), used by
//     Trip Tips and to fill in empty destinations
// A day with its own place (flight arrival, train or direction destination, hotel, activity)
// uses it. A day without one keeps the last place the traveler arrived at. Days before any
// arrival use the first flight's departure airport, then `fallback`. With none of these, the
// day is null and no weather is shown.
export async function resolveDayLocations(dateList, tasksByDay, tripTitle, destinations) {
    const allQueries = new Set();
    // Restaurant, car rental, tour and activity locations (priority 3), which are checked for
    // wrong matches below.
    const lowConfidenceQueries = new Set();
    for (const date of dateList) {
        dayCandidates(tasksByDay[date] || []).textCandidates.forEach((c) => {
            allQueries.add(c.query);
            if (c.priority === 3) lowConfidenceQueries.add(c.query);
        });
    }

    const firstDestination = (destinations || []).map((d) => (d || '').trim()).find(Boolean);

    const [geocodeResults, destinationFallback, titleFallback] = await Promise.all([
        (async () => {
            const results = {};
            await Promise.all([...allQueries].map(async (q) => { results[q] = await geocode(q); }));
            return results;
        })(),
        firstDestination ? geocode(firstDestination) : null,
        resolveTitleLocation(tripTitle),
    ]);
    const fallback = destinationFallback || titleFallback;

    // A place name like a neighborhood can match a same-named town far away (e.g. "Tsukiji"
    // matched a town in Kyushu, about 1,000km from Tokyo). So a priority-3 location is ignored if
    // it's over 500km from every other place found for the trip. Skipped when there are no other
    // places to compare with.
    const highConfidencePoints = Object.entries(geocodeResults)
        .filter(([q, r]) => r && !lowConfidenceQueries.has(q))
        .map(([, r]) => r);
    if (highConfidencePoints.length) {
        for (const [query, result] of Object.entries(geocodeResults)) {
            if (!result || !lowConfidenceQueries.has(query)) continue;
            const tooFar = highConfidencePoints.every((p) => haversineKm(result.lat, result.lon, p.lat, p.lon) > 500);
            if (tooFar) geocodeResults[query] = null;
        }
    }

    const baseAirport = detectBaseAirport(dateList, tasksByDay);

    // The first flight departure (in date order) with a known airport. The traveler is at that
    // airport's city up to and including the departure day, until they first arrive somewhere.
    let firstDepartureDate = null;
    let firstDepartureLocation = null;
    outer: for (const date of dateList) {
        for (const t of tasksByDay[date] || []) {
            const f = t.fields || {};
            if (t.cat !== 'flight-depart' || !f.depAirport) continue;
            const coords = AIRPORT_COORDS[extractAirportCode(f.depAirport)];
            if (coords) { firstDepartureDate = date; firstDepartureLocation = coords; break outer; }
        }
    }

    // Arriving before 2 PM: that day's weather is for the new place. Arriving at 2 PM or later:
    // that day shows where the traveler started, and the new place starts the next day.
    const LATE_ARRIVAL_CUTOFF_HOUR = 14;

    const locationsByDay = {};
    // Each city the day items point to, once, in trip order (not including `fallback`).
    const itineraryPlaces = [];
    const seenPlaces = new Set();
    let current = null;
    for (const date of dateList) {
        const { airportCandidates, textCandidates } = dayCandidates(tasksByDay[date] || []);
        let resolved = null;
        let resolvedHour = null;
            // confident: the place is a flight arrival, transportation or direction destination, or
        // hotel. Only these change where the traveler is for the following days. A restaurant,
        // car rental, tour or activity location only sets that one day's weather (e.g. "Hong
        // Kong Disneyland" shouldn't become the city for the rest of the trip).
        let confident = false;
        // Uses the day's last flight arrival (earlier ones that day are connections).
        for (const cand of airportCandidates) {
            // Flying back into the home airport doesn't count as arriving somewhere.
            if (cand.code === baseAirport) continue;
            if (AIRPORT_COORDS[cand.code]) { resolved = AIRPORT_COORDS[cand.code]; resolvedHour = cand.hour; confident = true; }
        }
        if (!resolved) {
            for (const c of textCandidates) {
                if (geocodeResults[c.query]) {
                    resolved = geocodeResults[c.query];
                    resolvedHour = c.hour;
                    confident = c.priority <= 2;
                    break;
                }
            }
        }
        if (resolved) {
            // `current` (where the traveler is from now on) only changes for a confident place.
            const dayStartLocation = current;
            if (confident) current = resolved;
            if (resolved.city && !seenPlaces.has(resolved.city)) {
                seenPlaces.add(resolved.city);
                itineraryPlaces.push({ city: resolved.city, country: resolved.country || null });
            }
            locationsByDay[date] = (resolvedHour == null || resolvedHour < LATE_ARRIVAL_CUTOFF_HOUR)
                ? resolved
                : (dayStartLocation || fallback);
        } else {
            // Days up to and including the first departure day use its airport.
            const backwardInferred = (!current && firstDepartureLocation && date <= firstDepartureDate) ? firstDepartureLocation : null;
            locationsByDay[date] = current || backwardInferred || fallback;
        }
    }
    return { byDay: locationsByDay, fallback, itineraryPlaces };
}
