import { parseISO, fmtISO } from './dateHelpers';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The weeks (Sunday to Saturday) from the week of the start date to the week of the end date.
export function weeksForTrip(startISO, endISO) {
    const start = parseISO(startISO);
    const end = parseISO(endISO);
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() - cursor.getDay());
    const weekEnd = new Date(end);
    weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));

    const weeks = [];
    while (cursor <= weekEnd) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            week.push(fmtISO(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}
