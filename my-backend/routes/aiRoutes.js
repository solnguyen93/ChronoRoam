// /ai routes: AI imports (pasted booking emails and packing lists) and Trip Tips.
const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { extractConfirmation } = require('../utils/aiConfirmationExtraction');
const { assertImportQuota, recordImportUsage } = require('../utils/importQuota');
const { extractPacklistItems } = require('../utils/aiPacklistExtraction');
const { getTripTips } = require('../utils/aiTripTips');
const { resolveDestinationKey } = require('../utils/aiDestinationResolver');
const { getOutletType, compareOutlets, compareOutletsParts, sameCountry } = require('../utils/staticOutlets');
const { getWeatherComparison } = require('../utils/weatherComparison');
const { getMultiDestinationWeather, summarizeMultiDestinationWeather } = require('../utils/multiDestinationWeather');
const { getGeocode } = require('../utils/geocode');
const CachedTripTips = require('../models/CachedTripTips');

// The city part of a place ("Osaka, Japan" -> "Osaka").
function cityOnly(place) {
    return (place || '').split(',')[0].trim();
}

// Plug and outlet notes for a trip to several places, one per place (they can differ from each
// other, e.g. Busan uses Type C/F and Hong Kong Type G). Skips places in the home country or with
// no known plug type. Returns null when there's nothing to show.
async function buildMultiOutlets(places, homeCountry) {
    const geos = await Promise.all(places.map((p) => getGeocode(p)));
    const parts = [];
    geos.forEach((geo, i) => {
        if (!geo?.country || sameCountry(geo.country, homeCountry)) return;
        const outletType = getOutletType(geo.country);
        if (!outletType) return;
        const p = compareOutletsParts(outletType, homeCountry);
        if (p) parts.push({ place: geo.city || cityOnly(places[i]), ...p });
    });
    if (!parts.length) return null;

    // Places with the same advice and voltage note are grouped, so that sentence is written once,
    // on the last place of the group, instead of repeated for each place.
    const groups = new Map();
    for (const p of parts) {
        const key = `${p.advisory}|${p.voltageNote}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }

    return parts.map((p) => {
        const group = groups.get(`${p.advisory}|${p.voltageNote}`);
        if (group.length === 1) {
            return { place: p.place, text: `${p.verdictPhrase} — ${p.advisory} (${p.typesComparison})${p.voltageNote ? ` ${p.voltageNote}` : ''}` };
        }
        if (group[group.length - 1] !== p) {
            return { place: p.place, text: `${p.verdictPhrase} — (${p.typesComparison})` };
        }
        const sharedVoltage = p.voltageNote
            ? ` — ${group.length === 2 ? 'both' : 'all'} are fine for dual-voltage electronics (most phone/laptop chargers say "100-240V" on the label), but check before plugging in single-voltage appliances like hair dryers.`
            : '';
        return { place: p.place, text: `${p.verdictPhrase} — ${p.advisory} (${p.typesComparison})${sharedVoltage}` };
    });
}

// Distance in km between two points on Earth.
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Whether all the places are within 50 km of each other (one city and its neighborhoods). Used
// to double-check the AI when it says a trip is one city, since it sometimes merges different
// cities (like Tokyo and Kyoto).
async function placesAreClustered(places, radiusKm = 50) {
    if (places.length <= 1) return true;
    const geos = (await Promise.all(places.map((p) => getGeocode(p)))).filter(Boolean);
    for (let i = 0; i < geos.length; i++) {
        for (let j = i + 1; j < geos.length; j++) {
            if (haversineKm(geos[i].lat, geos[i].lon, geos[j].lat, geos[j].lon) > radiusKm) return false;
        }
    }
    return true;
}

// Whether a place name is the same as an already-known city or country ("Tokyo" vs a cached
// Tokyo), by simple text matching.
function placeMatchesResolved(place, resolvedCity, resolvedCountry) {
    const norm = (s) => (s || '').toLowerCase().trim();
    const p = norm(place);
    if (!p) return true;
    const city = norm(resolvedCity);
    const country = norm(resolvedCountry);
    // The country only matches when the place is just the country, so "Osaka, Japan" doesn't
    // match a cached Tokyo because both are in Japan.
    return (!!city && (p.includes(city) || city.includes(p))) || (!!country && (p === country || country.includes(p)));
}

// Reuses cached tips from one of the trip's other place sources (see POST /trip-tips) when these
// places are the same place (e.g. the title was already worked out as Tokyo, and the
// destinations now just say "Tokyo"). Database reads only, no AI calls. Returns the row or null.
async function findAlreadyResolvedMatch(places, passportCountry, otherTexts) {
    if (!places || !places.length) return null; // the title has no separate places to compare
    for (const text of otherTexts) {
        if (!text) continue;
        const otherRow = await CachedTripTips.get(text, passportCountry);
        if (otherRow && otherRow.hasDestination && otherRow.resolvedCity && !CachedTripTips.isStale(otherRow) &&
            places.every((p) => placeMatchesResolved(p, otherRow.resolvedCity, otherRow.resolvedCountry))) {
            return otherRow;
        }
    }
    return null;
}

// Pasted booking email: one AI call works out what kind of booking it is (flight, hotel, car,
// etc.) and pulls out its details (utils/aiConfirmationExtraction.js). Uses one credit.
router.post('/extract-confirmation', async (req, res) => {
    try {
        const user = requireUser(res);
        const status = await assertImportQuota(user.id);
        const { category, legs } = await extractConfirmation(req.body.emailText);
        // The credit is used after the AI call, even if it found nothing (the call still costs money).
        await recordImportUsage(user.id, status);
        res.json({ category, legs });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Pasted packing list: the AI splits it into items, grouped by any section headings
// (utils/aiPacklistExtraction.js). Handles messy formats like checklists and bullet lists. Uses
// one credit.
router.post('/extract-packlist-items', async (req, res) => {
    try {
        const user = requireUser(res);
        const status = await assertImportQuota(user.id);
        const groups = await extractPacklistItems(req.body.text);
        // The credit is used after the AI call.
        await recordImportUsage(user.id, status);
        res.json({ groups });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Gets Trip Tips for one piece of text (destinations, itinerary places, or the trip title),
// cheapest first:
//   1. Cached tips for this exact text.
//   2. A cheap AI call (about $0.000007, aiDestinationResolver.js) names the destination, or says
//      there isn't one; then cached tips for that destination (from other titles) are reused.
//   3. Otherwise the full AI call with web search (aiTripTips.js), cached under this text and
//      destination.
// placeCount lets the full call search more when there are several places.
async function resolveTripTitle(effectiveTitle, passportCountry, startDate, endDate, placeCount = 1) {
    let row = await CachedTripTips.get(effectiveTitle, passportCountry);

    // Cached tips are reused for 75 days. A cached "no destination" only for 1 day, because the AI
    // sometimes wrongly says no for real places (like "Grand Canyon Trip").
    if (row && !CachedTripTips.isStale(row, row.hasDestination ? 75 : 1)) return row;

    const destinationKey = await resolveDestinationKey(effectiveTitle);

    if (!destinationKey) {
        // No real destination: save that, and skip the expensive call.
        return CachedTripTips.upsert(effectiveTitle, { hasDestination: false, experientialTips: [] }, passportCountry);
    }

    const cityRow = await CachedTripTips.getByDestinationKey(destinationKey, passportCountry);
    if (cityRow && !CachedTripTips.isStale(cityRow)) {
        return CachedTripTips.upsert(effectiveTitle, { ...cityRow, destinationKey }, passportCountry);
    }

    let fresh = await getTripTips(effectiveTitle, startDate, endDate, passportCountry, placeCount);
    // The cheap call found a destination but the full call said there isn't one: try the full
    // call once more before saving.
    if (!fresh.hasDestination) {
        fresh = await getTripTips(effectiveTitle, startDate, endDate, passportCountry, placeCount);
    }
    return CachedTripTips.upsert(effectiveTitle, { ...fresh, destinationKey }, passportCountry);
}

// Trip Tips for a trip: visa tip, local tips, plug/outlet notes and a weather comparison with home.
router.post('/trip-tips', async (req, res) => {
    try {
        requireUser(res);
        const { title, startDate, endDate, homeLat, homeLon, homeCountry, itineraryPlaces, destinations } = req.body;
        // Visa tips always assume a US passport (where someone lives doesn't tell us their
        // passport). Still passed around and part of the cache key, so other passports can be
        // added later.
        const passportCountry = 'United States';
        // Plugs are compared with the home location's country (the US if none is set).
        const homeOutletCountry = homeCountry || 'United States';

        const explicitPlaces = Array.isArray(destinations) ? destinations.map((d) => (d || '').trim()).filter(Boolean) : [];
        const distinctItineraryPlaces = Array.isArray(itineraryPlaces)
            ? [...new Set(itineraryPlaces.map((p) => p?.city).filter(Boolean))]
            : [];
        const trimmedTitle = (title || '').trim();

        // Where to look for the destination, in order: the Destinations field, then the places
        // from the day plan, then the trip title. The first one that gives a real destination is
        // used; if one gives nothing, the next is tried.
        const candidates = [];
        if (explicitPlaces.length) candidates.push({ text: explicitPlaces.join(', '), places: explicitPlaces });
        if (distinctItineraryPlaces.length) candidates.push({ text: distinctItineraryPlaces.join(', '), places: distinctItineraryPlaces });
        if (trimmedTitle) candidates.push({ text: trimmedTitle, places: null });

        // The places behind the tips that were used (needed for trips to several places).
        let effectivePlaces = [];
        let row = null;

        for (const candidate of candidates) {
            // Reuse another source's cached tips if these places are the same place; otherwise
            // look them up.
            const otherTexts = candidates.filter((c) => c !== candidate).map((c) => c.text);
            const reused = await findAlreadyResolvedMatch(candidate.places, passportCountry, otherTexts);
            row = reused || await resolveTripTitle(candidate.text, passportCountry, startDate, endDate, candidate.places?.length || 1);
            effectivePlaces = candidate.places || [];
            if (row.hasDestination) break;
        }
        if (!row) row = { hasDestination: false, experientialTips: [] };

        // One city: the AI found one, and (with several places) they're all within 50 km.
        const singleCityConfirmed = row.resolvedLat != null && (effectivePlaces.length <= 1 || await placesAreClustered(effectivePlaces));

        let outlets = null;
        let weatherComparison = null;
        if (row.hasDestination && singleCityConfirmed && row.resolvedLat != null && row.resolvedLon != null) {
            // Plug notes only when traveling to another country.
            if (!sameCountry(row.resolvedCountry, homeOutletCountry)) {
                outlets = compareOutlets(getOutletType(row.resolvedCountry), homeOutletCountry);
            }
            // Destination weather, compared with home when there's a home location.
            weatherComparison = await getWeatherComparison(row.resolvedLat, row.resolvedLon, startDate, endDate, homeLat, homeLon);
        }

        // A trip to several places: an AI-written weather summary across them (worked out once,
        // then cached) and plug notes per place.
        let multiWeatherSummary = null;
        let multiOutlets = null;
        if (row.hasDestination && !singleCityConfirmed && effectivePlaces.length > 1) {
            if (row.multiWeatherSummary) {
                multiWeatherSummary = row.multiWeatherSummary;
            } else {
                const { rows: weatherRows, excluded } = await getMultiDestinationWeather(effectivePlaces, startDate, endDate);
                multiWeatherSummary = await summarizeMultiDestinationWeather(weatherRows, excluded, startDate, endDate);
                if (multiWeatherSummary) await CachedTripTips.setMultiWeatherSummary(row.titleKey, passportCountry, multiWeatherSummary);
            }
            // Plug notes aren't cached; they're a quick lookup with no AI call.
            multiOutlets = await buildMultiOutlets(effectivePlaces, homeOutletCountry);
        }

        res.json({
            hasDestination: row.hasDestination,
            visa: (row.hasDestination && row.tipText) ? {
                tipText: row.tipText, sourceLabel: row.sourceLabel, sourceUrl: row.sourceUrl,
                // The name shown in the panel header: the city, or for several places all of them
                // ("Busan & Hong Kong").
                resolvedCity: singleCityConfirmed ? row.resolvedCity : effectivePlaces.map(cityOnly).filter(Boolean).join(' & '),
                lastVerified: row.lastVerified,
            } : null,
            outlets,
            multiOutlets,
            weatherComparison,
            multiWeatherSummary,
            experientialTips: row.experientialTips || [],
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
