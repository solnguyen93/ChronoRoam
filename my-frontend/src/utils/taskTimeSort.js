import { to24Hour } from './dateHelpers';

// Keeping a day's items in time order.

// The time an item happens at, for sorting: departure or arrival time, check-in/out time (the
// actual time if the user set one), pickup/return time, or the time of a restaurant/tour/etc.
function timeFieldFor(cat, fields) {
    if (!fields) return '';
    switch (cat) {
        case 'flight-depart':
        case 'transportation-depart':
            return fields.depTime || '';
        case 'flight-arrive':
        case 'transportation-arrive':
            return fields.arrTime || '';
        case 'lodging-checkin':
            return fields.actualCheckInTime || fields.checkInTime || '';
        case 'lodging-checkout':
            return fields.actualCheckOutTime || fields.checkOutTime || '';
        case 'car-pickup':
            return fields.actualPickupTime || fields.pickupTime || '';
        case 'car-return':
            return fields.actualReturnTime || fields.returnTime || '';
        case 'direction':
        case 'restaurant':
        case 'tour':
        case 'activity':
            return fields.time || '';
        default:
            return '';
    }
}

// An item's time as minutes after midnight, or null when it has no time.
export function getSortMinutes(task) {
    const t12 = timeFieldFor(task?.cat, task?.fields);
    if (!t12) return null;
    const t24 = to24Hour(t12);
    if (!t24) return null;
    const [h, m] = t24.split(':').map(Number);
    return h * 60 + m;
}

// Puts the items that have a time back in time order, leaving items without a time where they
// are. Used after a drag or a time edit on a day.
export function enforceTimedOrder(tasksInOrder) {
    const timedIndices = [];
    const timedTasks = [];
    tasksInOrder.forEach((t, i) => {
        if (getSortMinutes(t) != null) { timedIndices.push(i); timedTasks.push(t); }
    });
    const sorted = [...timedTasks].sort((a, b) => getSortMinutes(a) - getSortMinutes(b));
    const result = tasksInOrder.slice();
    timedIndices.forEach((idx, i) => { result[idx] = sorted[i]; });
    return result;
}

// Groups new items by linkId (a flight's departure and arrival, a stay's check-in and check-out),
// keeping each pair in the order it was created. That keeps a flight's arrival after its departure
// even when the landing time looks earlier (e.g. leave Tokyo 4:20 PM, land Seattle 9:35 AM).
function groupNewTasks(newTasks) {
    const groups = [];
    const seen = new Set();
    for (const t of newTasks) {
        if (t.linkId) {
            if (seen.has(t.linkId)) continue;
            seen.add(t.linkId);
            groups.push(newTasks.filter((x) => x.linkId === t.linkId));
        } else {
            groups.push([t]);
        }
    }
    return groups;
}

// Adds new items into a day's existing list, each at the spot its time belongs (items without a
// time go at the end). Existing items keep their order. Returns the whole list in order.
export function mergeNewTasksByTime(existingTasks, newTasks) {
    const groups = groupNewTasks(newTasks);
    // Order the groups by their first item's time; groups without a time go last, in creation order.
    const withIdx = groups.map((g, i) => ({ g, i, m: getSortMinutes(g[0]) }));
    withIdx.sort((a, b) => {
        if (a.m == null && b.m == null) return a.i - b.i;
        if (a.m == null) return 1;
        if (b.m == null) return -1;
        return a.m - b.m;
    });
    const orderedNew = withIdx.flatMap((x) => x.g);

    const result = existingTasks.slice();
    const lastIndexForLink = {};
    for (const task of orderedNew) {
        const m = getSortMinutes(task);
        let insertAt = result.length;
        if (m != null) {
            insertAt = result.length;
            for (let idx = 0; idx < result.length; idx++) {
                const existingMinutes = getSortMinutes(result[idx]);
                if (existingMinutes != null && existingMinutes > m) { insertAt = idx; break; }
            }
        }
        // The second item of a pair always goes after the first.
        if (task.linkId && lastIndexForLink[task.linkId] != null) {
            insertAt = Math.max(insertAt, lastIndexForLink[task.linkId] + 1);
        }
        result.splice(insertAt, 0, task);
        // Inserting moves the later saved positions down by one.
        for (const key in lastIndexForLink) {
            if (lastIndexForLink[key] >= insertAt) lastIndexForLink[key] += 1;
        }
        if (task.linkId) lastIndexForLink[task.linkId] = insertAt;
    }
    return result;
}
