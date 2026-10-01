import { DOW_SHORT, MON_SHORT, parseISO } from './dateHelpers';

// Trip search: finds the days that match a search.

// A day's label, like "Wed Jul 29".
function dateLabel(dateISO) {
    const d = parseISO(dateISO);
    return `${DOW_SHORT[d.getDay()]} ${MON_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// Whether every word of the query appears in the text, ignoring case and order ("tsukiji
// breakfast" matches "Tsukiji Market Breakfast", "jul 29" matches "Wed Jul 29").
function wordsMatch(query, haystack) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const lower = haystack.toLowerCase();
    return words.every((w) => lower.includes(w));
}

// One result per day whose date, name and items together contain every word, with up to 3 of its
// items that match on their own (each with its category, for the icon).
export function searchTrip(query, dates, tasksByDay, dayTitles) {
    const q = query.trim();
    if (!q) return [];

    const results = [];
    for (const dateISO of dates) {
        const dayTitle = dayTitles[dateISO] || '';
        const label = dateLabel(dateISO);
        const tasks = tasksByDay[dateISO] || [];
        const haystack = [label, dayTitle, ...tasks.map((t) => t.text)].join(' ');
        if (!wordsMatch(q, haystack)) continue;

        const matchingTasks = tasks.filter((t) => wordsMatch(q, t.text)).slice(0, 3).map((t) => ({ text: t.text, cat: t.cat }));
        results.push({ dateISO, label, dayTitle, matchingTasks });
    }
    return results;
}
