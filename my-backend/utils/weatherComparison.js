// Trip Tips' weather section: the destination's typical temperature and humidity over the trip's
// dates, and which month at home feels most like it. Calculated from weatherHistory.js, no AI.
const { getHistoricalDayAverage } = require('./weatherHistory');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Average of a list of numbers (null for an empty list).
function avg(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

// One day's average temperature (halfway between high and low) and humidity.
function blend(day) {
    return {
        avgF: (day.hiF != null && day.loF != null) ? (day.hiF + day.loF) / 2 : null,
        avgHumidity: day.avgHumidity,
    };
}

// Typical weather over a date range at a place: the average temperature and humidity across the
// days, plus the coolest and warmest day's average.
async function tripRangeAverages(lat, lon, startDate, endDate) {
    const days = [];
    const cur = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cur <= end) {
        days.push({ month: cur.getUTCMonth() + 1, day: cur.getUTCDate() });
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    const perDay = (await Promise.all(days.map(({ month, day }) => getHistoricalDayAverage(lat, lon, month, day)))).map(blend);
    const dayAvgFs = perDay.map((d) => d.avgF).filter((v) => v != null);
    return {
        avgF: avg(dayAvgFs),
        avgHumidity: avg(perDay.map((d) => d.avgHumidity).filter((v) => v != null)),
        // Coolest and warmest day, so a trip whose weather really changes can show a range.
        minF: dayAvgFs.length ? Math.min(...dayAvgFs) : null,
        maxF: dayAvgFs.length ? Math.max(...dayAvgFs) : null,
    };
}

// Typical weather at home for a month, using the 15th as the sample day.
async function monthlyAverages(lat, lon, month) {
    return blend(await getHistoricalDayAverage(lat, lon, month, 15));
}

// The destination's typical temperature (with a range if it varies by 15°F or more) and humidity,
// plus, when there's a home location, the home month closest in temperature. Returns null when
// there's no weather data for the destination.
async function getWeatherComparison(destLat, destLon, startDate, endDate, homeLat, homeLon) {
    const dest = await tripRangeAverages(destLat, destLon, startDate, endDate);
    if (dest.avgF == null) return null;

    // Show a range only when the days differ by 15°F or more (same as multiDestinationWeather.js).
    const RANGE_THRESHOLD_F = 15;
    const hasRange = dest.minF != null && dest.maxF != null && (dest.maxF - dest.minF) >= RANGE_THRESHOLD_F;

    const result = {
        destAvgF: Math.round(dest.avgF),
        destMinF: hasRange ? Math.round(dest.minF) : null,
        destMaxF: hasRange ? Math.round(dest.maxF) : null,
        destHumidity: dest.avgHumidity != null ? Math.round(dest.avgHumidity) : null,
        homeMonthName: null,
        homeAvgF: null,
        homeHumidity: null,
    };

    if (homeLat == null || homeLon == null) return result;

    // Find the home month whose average is closest to the destination's.
    const homeMonthly = await Promise.all(Array.from({ length: 12 }, (_, i) => i + 1).map((m) => monthlyAverages(homeLat, homeLon, m)));

    let closestMonth = null;
    let closestDiff = Infinity;
    homeMonthly.forEach((m, i) => {
        if (m.avgF == null) return;
        const diff = Math.abs(m.avgF - dest.avgF);
        if (diff < closestDiff) { closestDiff = diff; closestMonth = i + 1; }
    });
    if (closestMonth == null) return result;

    result.homeMonthName = MONTH_NAMES[closestMonth - 1];
    result.homeAvgF = Math.round(homeMonthly[closestMonth - 1].avgF);
    result.homeHumidity = homeMonthly[closestMonth - 1].avgHumidity != null ? Math.round(homeMonthly[closestMonth - 1].avgHumidity) : null;
    return result;
}

module.exports = { getWeatherComparison, tripRangeAverages };
