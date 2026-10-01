const pool = require('../db');
const { NotFoundError } = require('../expressError');
const { cleanTags } = require('../utils/itemTags');

const TASK_FIELDS = `id, trip_id AS "tripId", to_char(day_date, 'YYYY-MM-DD') AS "dayDate", text, done, fixed, flight,
    cat, fields, tags, link, link_id AS "linkId", position, created_at AS "createdAt"`;

// The position just after the last item on that day (0 if the day is empty).
async function nextPosition(tripId, dayDate) {
    const { rows: [{ next }] } = await pool.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE trip_id = $1 AND day_date = $2`,
        [tripId, dayDate],
    );
    return next;
}

// Adds days to a 'YYYY-MM-DD' date. Uses UTC so the server's time zone can't shift the result by a day.
function addDaysISO(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// A trip's day-by-day items ("tasks"): plain items and categorized ones (flight, lodging, car,
// etc. — `cat`, with details in `fields`). Paired items, like a flight's departure and arrival,
// share a linkId.
class Task {
    // All of a trip's items, by day and then position.
    static async getAll(tripId) {
        const result = await pool.query(
            `SELECT ${TASK_FIELDS} FROM tasks WHERE trip_id = $1 ORDER BY day_date ASC, position ASC`,
            [tripId],
        );
        return result.rows;
    }

    // Adds an item at the end of its day.
    static async add(tripId, { dayDate, text, done = false, fixed = false, flight = false, cat = null, fields = {}, tags = {}, link = null, linkId = null }) {
        const position = await nextPosition(tripId, dayDate);
        const result = await pool.query(
            `INSERT INTO tasks (trip_id, day_date, text, done, fixed, flight, cat, fields, link, link_id, position, tags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb)
             RETURNING ${TASK_FIELDS}`,
            [tripId, dayDate, text, done, fixed, flight, cat, JSON.stringify(fields), link, linkId, position, JSON.stringify(cleanTags(tags))],
        );
        return result.rows[0];
    }

    // Updates an item. Fields not in `changes` keep their current value. If the day changes, the
    // item goes to the end of the new day.
    static async update(id, tripId, changes = {}) {
        const existing = await pool.query(`SELECT ${TASK_FIELDS} FROM tasks WHERE id = $1 AND trip_id = $2`, [id, tripId]);
        if (!existing.rows[0]) throw new NotFoundError('Task not found');
        const merged = { ...existing.rows[0], ...changes };
        const position = merged.dayDate !== existing.rows[0].dayDate
            ? await nextPosition(tripId, merged.dayDate)
            : existing.rows[0].position;
        const result = await pool.query(
            `UPDATE tasks SET day_date = $1, text = $2, done = $3, fixed = $4, flight = $5,
                cat = $6, fields = $7::jsonb, link = $8, link_id = $9, position = $10, tags = $13::jsonb
             WHERE id = $11 AND trip_id = $12
             RETURNING ${TASK_FIELDS}`,
            [merged.dayDate, merged.text, merged.done, merged.fixed, merged.flight, merged.cat,
                JSON.stringify(merged.fields), merged.link, merged.linkId, position, id, tripId, JSON.stringify(cleanTags(merged.tags))],
        );
        return result.rows[0];
    }

    // Deletes an item.
    static async remove(id, tripId) {
        const result = await pool.query(`DELETE FROM tasks WHERE id = $1 AND trip_id = $2 RETURNING id`, [id, tripId]);
        if (!result.rows[0]) throw new NotFoundError('Task not found');
    }

    // The first and second half of each kind of pair. When both halves are on the same day, the
    // first half (e.g. check-in) must stay above the second (check-out).
    static EARLIER_CATS = new Set(['flight-depart', 'transportation-depart', 'lodging-checkin', 'car-pickup']);
    static LATER_CATS = new Set(['flight-arrive', 'transportation-arrive', 'lodging-checkout', 'car-return']);

    // Saves a new order for one day's items, but first moves any second half that was dragged
    // above its first half to just after it.
    static async reorder(tripId, dayDate, orderedIds) {
        const { rows } = await pool.query(
            `SELECT id, cat, link_id AS "linkId" FROM tasks WHERE trip_id = $1 AND day_date = $2`,
            [tripId, dayDate],
        );
        let finalOrder = orderedIds;
        // For each second half on this day, find its first half; if the second half is above it,
        // move it to right after.
        for (const row of rows) {
            if (!Task.LATER_CATS.has(row.cat) || !row.linkId) continue;
            const sibling = rows.find((r) => r.id !== row.id && r.linkId === row.linkId && Task.EARLIER_CATS.has(r.cat));
            if (!sibling) continue;
            const laterIdx = finalOrder.indexOf(row.id);
            const earlierIdx = finalOrder.indexOf(sibling.id);
            if (laterIdx === -1 || earlierIdx === -1 || laterIdx > earlierIdx) continue;
            // Move the second half to just after the first half.
            finalOrder = finalOrder.filter((id) => id !== row.id);
            finalOrder.splice(finalOrder.indexOf(sibling.id) + 1, 0, row.id);
        }
        // Save each id's position as its index.
        for (let i = 0; i < finalOrder.length; i++) {
            await pool.query(
                `UPDATE tasks SET position = $1 WHERE id = $2 AND trip_id = $3 AND day_date = $4`,
                [i, finalOrder[i], tripId, dayDate],
            );
        }
        return Task.getAll(tripId);
    }

    // Rules for moving the other half when one half of a pair is dragged to another day:
    //
    // Flight: moving the departure moves the arrival by the same number of days. Moving the
    // arrival alone leaves the departure (it's fixing the landing day). A flight can land on an
    // earlier date than it left (crossing the date line), so there's no "arrival before
    // departure" check.
    static FLIGHT_ANCHOR_CATS = new Set(['flight-depart']);
    // Transportation (bus, train, ferry): moving either end moves the other by the same number of
    // days, but never so that the arrival is before the departure.
    static TRANSPORT_ANCHOR_CATS = new Set(['transportation-depart', 'transportation-arrive']);
    // Lodging check-in/check-out and car pickup/return are date ranges: moving one end just
    // lengthens or shortens the stay. The other end only moves if it would otherwise end up
    // before the start (or the start after the end).
    static RANGE_START_CATS = new Set(['lodging-checkin', 'car-pickup']);
    static RANGE_END_CATS = new Set(['lodging-checkout', 'car-return']);

    // Moves an item to another day (to the end of that day) and, if it's half of a pair, moves the
    // other half by the rules above. All in one transaction.
    static async moveToDay(id, tripId, newDayDate) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: [task] } = await client.query(
                `SELECT ${TASK_FIELDS} FROM tasks WHERE id = $1 AND trip_id = $2 FOR UPDATE`,
                [id, tripId],
            );
            if (!task) throw new NotFoundError('Task not found');

            // How many days the item is moving (negative = earlier).
            const deltaDays = Math.round(
                (new Date(newDayDate) - new Date(task.dayDate)) / (24 * 60 * 60 * 1000)
            );

            const { rows: [{ next: taskPosition }] } = await client.query(
                `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE trip_id = $1 AND day_date = $2`,
                [tripId, newDayDate],
            );
            await client.query(
                `UPDATE tasks SET day_date = $1, position = $2 WHERE id = $3 AND trip_id = $4`,
                [newDayDate, taskPosition, id, tripId],
            );

            // Find the other half of the pair and work out its new date, if it needs one.
            if (task.linkId && deltaDays !== 0) {
                const { rows: [sibling] } = await client.query(
                    `SELECT ${TASK_FIELDS} FROM tasks WHERE trip_id = $1 AND link_id = $2 AND id != $3 FOR UPDATE`,
                    [tripId, task.linkId, id],
                );
                if (sibling) {
                    let siblingNewDate = null;

                    if (Task.FLIGHT_ANCHOR_CATS.has(task.cat)) {
                        siblingNewDate = addDaysISO(sibling.dayDate, deltaDays);
                    } else if (Task.TRANSPORT_ANCHOR_CATS.has(task.cat)) {
                        const shifted = addDaysISO(sibling.dayDate, deltaDays);
                        if (task.cat === 'transportation-depart') {
                            // The other half is the arrival: not before the new departure date.
                            siblingNewDate = shifted < newDayDate ? newDayDate : shifted;
                        } else {
                            // The other half is the departure: not after the new arrival date.
                            siblingNewDate = shifted > newDayDate ? newDayDate : shifted;
                        }
                    } else if (Task.RANGE_START_CATS.has(task.cat) && newDayDate > sibling.dayDate) {
                        siblingNewDate = newDayDate; // the end would be before the new start
                    } else if (Task.RANGE_END_CATS.has(task.cat) && newDayDate < sibling.dayDate) {
                        siblingNewDate = newDayDate; // the start would be after the new end
                    }

                    if (siblingNewDate) {
                        const { rows: [{ next: siblingPosition }] } = await client.query(
                            `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks
                             WHERE trip_id = $1 AND day_date = $2 AND id != $3`,
                            [tripId, siblingNewDate, sibling.id],
                        );
                        await client.query(
                            `UPDATE tasks SET day_date = $1, position = $2 WHERE id = $3 AND trip_id = $4`,
                            [siblingNewDate, siblingPosition, sibling.id, tripId],
                        );

                        // If both halves are now on the same day, make sure the first half is
                        // above the second, swapping their positions if not.
                        if (siblingNewDate === newDayDate) {
                            const taskIsLater = Task.LATER_CATS.has(task.cat);
                            const laterId = taskIsLater ? id : sibling.id;
                            const laterPos = taskIsLater ? taskPosition : siblingPosition;
                            const earlierId = taskIsLater ? sibling.id : id;
                            const earlierPos = taskIsLater ? siblingPosition : taskPosition;
                            if (laterPos < earlierPos) {
                                await client.query(`UPDATE tasks SET position = $1 WHERE id = $2`, [earlierPos, laterId]);
                                await client.query(`UPDATE tasks SET position = $1 WHERE id = $2`, [laterPos, earlierId]);
                            }
                        }
                    }
                }
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        return Task.getAll(tripId);
    }
}

module.exports = Task;
