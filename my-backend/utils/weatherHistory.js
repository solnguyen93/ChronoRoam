const WeatherHistoryCache = require('../models/WeatherHistoryCache');
const ApiUsage = require('../models/ApiUsage');

// Typical weather for a place and date: the average of the same calendar day over the last 3
// years, from Open-Meteo's free history API, cached.

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// 5 -> "05".
function pad(n) {
    return String(n).padStart(2, '0');
}

// One year's high, low (°F) and humidity for a date. If the request fails or comes back empty,
// tries once more after 0.4 s — a long trip makes many requests at once, and without the retry an
// odd failure left a day with no weather.
async function fetchYear(lat, lon, dateStr, attempt = 1) {
    try {
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=auto&temperature_unit=fahrenheit`;
        await ApiUsage.increment('open-meteo-weather'); // one real fetch per year (3 total per call)
        const res = await fetch(url);
        const json = await res.json();
        const hi = json.daily?.temperature_2m_max?.[0];
        const lo = json.daily?.temperature_2m_min?.[0];
        const hum = json.daily?.relative_humidity_2m_mean?.[0];
        if (hi == null && lo == null && hum == null && attempt < 2) {
            await new Promise((r) => setTimeout(r, 400));
            return fetchYear(lat, lon, dateStr, attempt + 1);
        }
        return {
            hi: typeof hi === 'number' ? hi : null,
            lo: typeof lo === 'number' ? lo : null,
            hum: typeof hum === 'number' ? hum : null,
        };
    } catch (err) {
        if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 400));
            return fetchYear(lat, lon, dateStr, attempt + 1);
        }
        return { hi: null, lo: null, hum: null };
    }
}

// The average high, low (°F) and humidity for a month/day over the last 3 years (not cached; use
// getHistoricalDayAverage).
async function computeHistoricalDayAverage(lat, lon, month, day) {
    const thisYear = new Date().getFullYear();
    const years = [1, 2, 3].map((back) => thisYear - back);
    try {
        const perYear = await Promise.all(years.map((y) => {
            // Use Feb 28 for Feb 29 in years that aren't leap years.
            const d = (month === 2 && day === 29 && !isLeapYear(y)) ? 28 : day;
            const dateStr = `${y}-${pad(month)}-${pad(d)}`;
            return fetchYear(lat, lon, dateStr);
        }));
        const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
        return {
            hiF: avg(perYear.map((v) => v.hi).filter((v) => v != null)),
            loF: avg(perYear.map((v) => v.lo).filter((v) => v != null)),
            avgHumidity: avg(perYear.map((v) => v.hum).filter((v) => v != null)),
        };
    } catch (err) {
        return { hiF: null, loF: null, avgHumidity: null };
    }
}

// Typical weather for a place and month/day: cached, or worked out and cached. Used by each day's
// weather (routes/weatherRoutes.js) and by Trip Tips (weatherComparison.js).
async function getHistoricalDayAverage(lat, lon, month, day) {
    if (lat == null || lon == null) return { hiF: null, loF: null, avgHumidity: null };
    let row = await WeatherHistoryCache.get(lat, lon, month, day);
    if (!row || WeatherHistoryCache.isStale(row)) {
        const fresh = await computeHistoricalDayAverage(lat, lon, month, day);
        // Nothing came back at all: don't cache that (it would stick for 180 days); use the old
        // cached row if there is one.
        if (fresh.hiF == null && fresh.loF == null && fresh.avgHumidity == null) {
            return row || fresh;
        }
        row = await WeatherHistoryCache.upsert(lat, lon, month, day, fresh);
    }
    return row;
}

module.exports = { getHistoricalDayAverage };
