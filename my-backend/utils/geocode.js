const GeocodeCache = require('../models/GeocodeCache');
const ApiUsage = require('../models/ApiUsage');

// Place name -> coordinates, using Open-Meteo's geocoding, cached.

// Open-Meteo returns no country name for Hong Kong and Macau (only a country code), so these fill
// it in. Plug types and the "same country" check need the name.
const COUNTRY_CODE_FALLBACK = { HK: 'Hong Kong', MO: 'Macau' };

// Asks Open-Meteo for the top match (use getGeocode below instead, which caches). Returns
// found:true when the request worked, even with no match (that answer gets cached too), and
// found:false when it failed, which isn't cached.
async function computeGeocode(query) {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
        await ApiUsage.increment('open-meteo-geocode');
        const res = await fetch(url);
        const json = await res.json();
        const match = json.results?.[0];
        return match
            ? { found: true, lat: match.latitude, lon: match.longitude, city: match.name, country: match.country || COUNTRY_CODE_FALLBACK[match.country_code] || null }
            : { found: true, lat: null, lon: null, city: null, country: null };
    } catch (err) {
        return { found: false };
    }
}

// { lat, lon, city, country } for a place name, or null. Uses the cache first, and asks Open-Meteo
// when there's no cached answer, it's over a year old, or it's a place saved without a country
// (e.g. Hong Kong, cached before the country fill-in above existed).
async function getGeocode(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) return null;

    let row = await GeocodeCache.get(trimmed);
    if (!row || GeocodeCache.isStale(row) || (row.lat != null && !row.country)) {
        const fresh = await computeGeocode(trimmed);
        if (!fresh.found) {
            row = row || null; // the request failed: use the old cached answer if there is one
        } else {
            row = await GeocodeCache.upsert(trimmed, fresh);
        }
    }
    if (!row || row.lat == null) return null;
    return { lat: row.lat, lon: row.lon, city: row.city, country: row.country };
}

module.exports = { getGeocode };
