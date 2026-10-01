import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import ChronoRoamApi from '../api';

// Weather results already fetched this session, by date, location and unit.
const cache = {};

// A day's max wind speed at or above this (km/h, about 19 mph) shows the windy icon.
const WINDY_THRESHOLD_KMH = 30;
// The windy icon only replaces these icons. Rain, snow and storm icons stay as they are.
const WINDY_OVERRIDABLE = new Set(['sun', 'partly-cloudy', 'cloudy']);

// Turns Open-Meteo's weather code (and the day's max wind speed) into the name of an icon in
// WeatherIcon.js.
function wmoIconKind(code, windSpeedKmh) {
    let kind;
    if (code === 0) kind = 'sun';
    else if ([1, 2].includes(code)) kind = 'partly-cloudy';
    else if (code === 3) kind = 'cloudy';
    else if ([45, 48].includes(code)) kind = 'fog';
    else if ([51, 53, 55, 61].includes(code)) kind = 'rain';
    else if ([63, 65, 81, 82].includes(code)) kind = 'heavy-rain';
    else if (code === 80) kind = 'sun-rain'; // light rain showers
    else if ([71, 73, 75, 77, 85, 86].includes(code)) kind = 'snow';
    // Freezing drizzle and freezing rain also use the snow icon.
    else if ([56, 57, 66, 67].includes(code)) kind = 'snow';
    else if (code === 95) kind = 'storm';
    else if ([96, 99].includes(code)) kind = 'hail'; // thunderstorm with hail
    else kind = 'default';

    if (windSpeedKmh != null && windSpeedKmh >= WINDY_THRESHOLD_KMH && WINDY_OVERRIDABLE.has(kind)) {
        return 'windy';
    }
    return kind;
}

// Converts a Fahrenheit temperature to the given unit ('C' or 'F').
function toUnit(f, unit) {
    return unit === 'C' ? (f - 32) * 5 / 9 : f;
}

// For dates past the 16-day forecast: asks our server for the average high and low on that
// month and day over the last 3 years at this location (my-backend/utils/weatherHistory.js,
// which caches it and shares it with Trip Tips). The server returns Fahrenheit; this converts to
// the user's unit. The result has `historical: true` so the day card can label it as typical
// weather, not a forecast. Returns null if there's no data or the request fails.
async function fetchHistoricalWeather(dateISO, lat, lon, unit) {
    const [, m, d] = dateISO.split('-').map(Number);
    try {
        const { hiF, loF } = await ChronoRoamApi.getHistoricalWeather(lat, lon, m, d);
        if (hiF == null || loF == null) return null;
        return {
            hi: Math.round(toUnit(hiF, unit)),
            lo: Math.round(toUnit(loF, unit)),
            unit,
            historical: true,
        };
    } catch (e) {
        return null;
    }
}

// Weather for one date and location, in the given unit (°F or °C):
//   - past dates: null
//   - within the next 16 days: Open-Meteo's forecast (high, low and icon)
//   - further out: the 3-year average from fetchHistoricalWeather
// Results, including null, are cached for the session. The unit is part of the cache key, so
// switching °F/°C fetches again.
async function fetchWeather(dateISO, lat, lon, unit) {
    const cacheKey = `${dateISO}@${lat},${lon}@${unit}`;
    if (cache[cacheKey] !== undefined) return cache[cacheKey];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateISO.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const daysOut = Math.round((target - today) / 86400000);
    if (daysOut < 0) {
        cache[cacheKey] = null;
        return null;
    }
    if (daysOut > 15) {
        cache[cacheKey] = await fetchHistoricalWeather(dateISO, lat, lon, unit);
        return cache[cacheKey];
    }
    try {
        const tempUnitParam = unit === 'C' ? 'celsius' : 'fahrenheit';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,wind_speed_10m_max&timezone=auto&forecast_days=16&temperature_unit=${tempUnitParam}`;
        const res = await fetch(url);
        const json = await res.json();
        const idx = json.daily.time.indexOf(dateISO);
        if (idx === -1) {
            cache[cacheKey] = null;
            return null;
        }
        const hi = Math.round(json.daily.temperature_2m_max[idx]);
        const lo = Math.round(json.daily.temperature_2m_min[idx]);
        const windSpeedKmh = json.daily.wind_speed_10m_max?.[idx];
        const icon = wmoIconKind(json.daily.weathercode[idx], windSpeedKmh);
        cache[cacheKey] = { hi, lo, icon, unit };
        return cache[cacheKey];
    } catch (e) {
        cache[cacheKey] = null;
        return null;
    }
}

// Weather for one trip day, from fetchWeather above. Returns null while loading, when there's
// no location, or when `locked` is true (then nothing is fetched). The unit comes from the
// signed-in user's °F/°C setting, defaulting to °F.
//
// `locked` is passed down from Planner.js, which works it out once for the whole trip (it's the
// optional out-of-credits weather lock, currently switched off in utils/creditLocks.js).
function useWeather(dateISO, location, locked) {
    const { user } = useAuth();
    const unit = user?.tempUnit || 'F';
    const lat = location?.lat;
    const lon = location?.lon;
    const [weather, setWeather] = useState(lat != null && !locked ? cache[`${dateISO}@${lat},${lon}@${unit}`] ?? null : null);

    useEffect(() => {
        if (locked || lat == null || lon == null) { setWeather(null); return undefined; }
        let cancelled = false;
        fetchWeather(dateISO, lat, lon, unit).then((w) => { if (!cancelled) setWeather(w); });
        return () => { cancelled = true; };
    }, [dateISO, lat, lon, unit, locked]);

    return weather;
}

export default useWeather;
