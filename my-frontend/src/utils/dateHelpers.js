// Short day and month names.
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "YYYY-MM-DD" (or a date from the server) -> a Date at local midnight.
export function parseISO(dateStr) {
    const isoPart = String(dateStr).slice(0, 10);
    const [y, m, d] = isoPart.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// A Date -> "YYYY-MM-DD" (local time).
export function fmtISO(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// Today as "YYYY-MM-DD".
export function todayISO() {
    return fmtISO(new Date());
}

// Every date from start to end, both included, as "YYYY-MM-DD".
export function dateRange(startISO, endISO) {
    const dates = [];
    const start = parseISO(startISO);
    const end = parseISO(endISO);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(fmtISO(d));
    }
    return dates;
}

// Whether a date is within start..end (an empty date counts as inside).
export function isDateInRange(dateISO, startISO, endISO) {
    if (!dateISO) return true;
    return dateISO >= startISO && dateISO <= endISO;
}

// A date plus some days.
export function addDays(dateISO, days) {
    const d = parseISO(dateISO);
    d.setDate(d.getDate() + days);
    return fmtISO(d);
}

// Calendar days from startISO to endISO (e.g. for a flight landing the next day).
export function daysBetween(startISO, endISO) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / msPerDay);
}

// A date like "Wed·Jul 29", or "Wed·Jul 29, 2026" with the year.
export function formatRangeDate(dateISO, includeYear) {
    const d = parseISO(dateISO);
    return DOW_SHORT[d.getDay()] + '·' + MON_SHORT[d.getMonth()] + ' ' + d.getDate() + (includeYear ? ', ' + d.getFullYear() : '');
}

// A trip's dates, like "Wed·Jul 29 – Sun·Aug 2, 2026", or just one date for a one-day trip.
export function formatTripDateRange(startISO, endISO, includeStartYear) {
    if (startISO === endISO) return formatRangeDate(startISO, true);
    return `${formatRangeDate(startISO, includeStartYear)} – ${formatRangeDate(endISO, true)}`;
}

// "14:30" -> "2:30 PM".
export function to12Hour(t24) {
    if (!t24) return '';
    const parts = t24.split(':');
    if (parts.length < 2) return t24;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + ampm;
}

// "2:30 PM" -> "14:30".
export function to24Hour(t12) {
    if (!t12) return '';
    const m = t12.match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
    if (m) {
        let h = parseInt(m[1], 10);
        const min = m[2];
        const ampm = m[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return String(h).padStart(2, '0') + ':' + min;
    }
    // No AM/PM: accept a 24-hour time as it is ("14:30"), otherwise return ''.
    const bare = t12.match(/^(\d{1,2}):(\d{2})$/);
    if (bare && parseInt(bare[1], 10) <= 23) return bare[1].padStart(2, '0') + ':' + bare[2];
    return '';
}
