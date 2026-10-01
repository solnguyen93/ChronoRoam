// Resets the test data: keeps a few accounts and the sample packing list, deletes everything else,
// and creates a fresh set of test trips. Run it again any time the test data needs resetting;
// change KEEP_USERNAMES/KEEP_EMAILS or TRIPS below rather than editing the database by hand.
//
// Local database (see db.js):
//   node scripts/seedTestData.js
// Production (Neon) — load .env first, because NODE_ENV=production skips db.js's .env loading
// and the script needs SAMPLE_PACKLIST_PUBLIC_ID from it:
//   set -a && source .env && set +a && NODE_ENV=production node scripts/seedTestData.js
//
// It only touches the test accounts (see main): trips and packlists that only testuser1/testuser2
// are on are deleted and recreated. Real users and anything shared with them are never touched.
//
// Steps of the old full reset (local only, `node scripts/seedTestData.js --full-reset`):
//   1. Deletes every user not in KEEP_USERNAMES/KEEP_EMAILS (the database deletes their
//      memberships, purchases and usage with them).
//   2. Empties the shared caches (flights, Trip Tips, weather, geocode).
//   3. Deletes every packing list except the sample (SAMPLE_PACKLIST_PUBLIC_ID), which every new
//      account gets a copy of.
//   4. Deletes every trip (with its items, to-dos, links and members).
//   5. Creates the trips in TRIPS, each with a packing list, some day items and to-dos.
//   6. Creates the trips saved as snapshots in scripts/seedData/*.json (e.g. the Tokyo trip).
// Every run ends with the same data.
const pool = require('../db');
const Trip = require('../models/Trip');
const Task = require('../models/Task');
const Todo = require('../models/Todo');
const Packlist = require('../models/Packlist');
const PacklistBag = require('../models/PacklistBag');
const PacklistItem = require('../models/PacklistItem');
const TripPacklist = require('../models/TripPacklist');
const { TripMembership, PacklistMembership } = require('../models/Membership');

// Accounts to keep. SEED_KEEP_USERNAME/SEED_KEEP_EMAIL (in .env, since this file is public) add
// a real account to keep.
const KEEP_USERNAMES = ['testuser1', 'testuser2', ...(process.env.SEED_KEEP_USERNAME ? [process.env.SEED_KEEP_USERNAME] : [])];
const KEEP_EMAILS = [...(process.env.SEED_KEEP_EMAIL ? [process.env.SEED_KEEP_EMAIL] : [])];

// The test trips.
//   owners: usernames that are members (two owners = a trip shared by both).
//   packlist.bags: { name, color, items }; packlist.items: items not in a bag. An item is a string
//     or { text, hot, cold, lastMin }.
//   tasks: day items, { day: days after the start date, text }.
//   todos: to-do texts.
const TRIPS = [
    {
        title: 'NYC Work Trip',
        startDate: '2026-09-14',
        endDate: '2026-09-15',
        destinations: ['New York City'],
        owners: ['testuser1'],
        packlist: {
            title: 'NYC Work Trip Packlist',
            items: [
                'Laptop + charger',
                'Phone charger',
                'Business cards',
                '2 dress shirts',
                'Dress pants',
                'Blazer',
                'Dress shoes',
                'Toiletry bag',
                { text: 'Deodorant', lastMin: true },
                'Toothbrush + toothpaste',
                { text: 'Wallet & ID', lastMin: true },
                'Headphones',
                'Notebook & pen',
                { text: 'Phone', lastMin: true },
                { text: 'Medications', lastMin: true },
            ],
        },
        tasks: [
            { day: 0, text: 'Flight to NYC — JFK, 8:00 AM' },
            { day: 0, text: 'Check into hotel near Midtown' },
            { day: 0, text: 'Client dinner meeting' },
            { day: 1, text: 'Morning meetings at client office' },
            { day: 1, text: 'Flight home — JFK, 6:30 PM' },
        ],
        todos: ['Confirm meeting agenda with client', 'Print handouts', 'Set out-of-office reply'],
    },
    {
        title: 'Cancún Family Getaway',
        startDate: '2026-10-10',
        endDate: '2026-10-18',
        destinations: ['Cancún'],
        owners: ['testuser1'],
        packlist: {
            title: 'Cancún Family Getaway Packlist',
            bags: [
                {
                    name: 'Checked Bag 1 — Dad',
                    color: '#3568c9',
                    items: [
                        { text: 'Swim trunks x3', hot: true },
                        { text: 'T-shirts x5', hot: true },
                        { text: 'Shorts x3', hot: true },
                        'Sandals',
                        { text: 'Sun hat', hot: true },
                    ],
                },
                {
                    name: 'Checked Bag 2 — Mom',
                    color: '#d8629a',
                    items: [
                        { text: 'Sundresses x3', hot: true },
                        { text: 'Swimsuits x2', hot: true },
                        'Sandals',
                        { text: 'Sun hat', hot: true },
                        'Light cardigan',
                    ],
                },
                {
                    name: 'Checked Bag 3 — Kid 1',
                    color: '#dcb32e',
                    items: [
                        { text: 'Swimsuits x2', hot: true },
                        'T-shirts x5',
                        'Shorts x4',
                        'Water shoes',
                    ],
                },
                {
                    name: 'Checked Bag 4 — Kid 2',
                    color: '#4a9660',
                    items: [
                        { text: 'Swimsuits x2', hot: true },
                        'Onesies x5',
                        { text: 'Sun hat', hot: true },
                        'Water shoes',
                    ],
                },
                {
                    name: 'Checked Bag 5 — Beach Gear',
                    color: '#e2822f',
                    items: [
                        'Beach towels x4',
                        'Beach umbrella',
                        'Snorkel set',
                        'Beach toys',
                        'Cooler bag',
                    ],
                },
                {
                    name: 'Checked Bag 6 — Family Shared',
                    color: '#8355c9',
                    items: [
                        { text: 'First-aid kit', lastMin: true },
                        'Extra diapers',
                        { text: 'Sunscreen SPF50', hot: true, lastMin: true },
                        { text: 'Bug spray', hot: true },
                        'Phone chargers x2',
                    ],
                },
                {
                    name: 'Carry-On — Parents',
                    color: '#1a1a1a',
                    items: [
                        { text: 'Passports & documents', lastMin: true },
                        { text: 'Wallet & cards', lastMin: true },
                        'Snacks',
                        'Tablet + headphones',
                        'Travel pillow',
                    ],
                },
                {
                    name: 'Carry-On — Kids',
                    color: '#8a5a3f',
                    items: [
                        'Coloring books',
                        'Snacks',
                        'Favorite stuffed animals',
                        'Spare clothes for kids',
                        'Wipes',
                    ],
                },
            ],
            items: [
                { text: 'Stroller', lastMin: true },
                { text: 'Car seat x2', lastMin: true },
                'Baby carrier',
            ],
        },
        tasks: [
            { day: 0, text: 'Flight to Cancún — 9:15 AM' },
            { day: 0, text: 'Check into beachfront resort' },
            { day: 1, text: 'Beach day + kids club' },
            { day: 3, text: 'Family snorkeling excursion' },
            { day: 5, text: 'Resort pool day' },
            { day: 8, text: 'Flight home — 4:45 PM' },
        ],
        todos: ['Pack kids’ travel documents', 'Arrange airport stroller check', 'Confirm kids club hours'],
    },
    {
        title: '3-Month Europe Adventure',
        startDate: '2026-12-01',
        endDate: '2027-02-28',
        destinations: ['Paris', 'Rome', 'Berlin'],
        owners: ['testuser1'],
        packlist: {
            title: '3-Month Europe Adventure Packlist',
            bags: [
                {
                    name: 'Layering Clothes',
                    color: '#3568c9',
                    items: [
                        { text: 'Thermal base layers x2', cold: true },
                        { text: 'Sweaters x3', cold: true },
                        { text: 'Light t-shirts x5', hot: true },
                        { text: 'Packable down jacket', cold: true },
                        'Rain jacket',
                    ],
                },
                {
                    name: 'Footwear',
                    color: '#8a5a3f',
                    items: [
                        { text: 'Hiking boots', cold: true },
                        { text: 'Sandals', hot: true },
                        'Sneakers',
                        'Dress shoes (one nice dinner)',
                    ],
                },
                {
                    name: 'Toiletries & Health',
                    color: '#4a9660',
                    items: [
                        { text: '3-month medication supply', lastMin: true },
                        'Travel-size toiletries',
                        'First-aid kit',
                        { text: 'Sunscreen', hot: true },
                    ],
                },
                {
                    name: 'Electronics',
                    color: '#1a1a1a',
                    items: [
                        'Laptop',
                        { text: 'Universal adapter', lastMin: true },
                        'Portable charger',
                        'E-reader',
                        'Camera',
                    ],
                },
            ],
            items: [
                { text: 'Passport + visas', lastMin: true },
                'Main backpack',
                'Daypack',
                { text: 'Travel insurance documents', lastMin: true },
                'Money belt',
            ],
        },
        tasks: [
            { day: 0, text: 'Flight to Paris — 11:00 AM' },
            { day: 0, text: 'Check into Paris apartment' },
            { day: 20, text: 'Train to Rome' },
            { day: 45, text: 'Train to Berlin' },
            { day: 88, text: 'Flight home' },
        ],
        todos: ['Notify bank of international travel', 'Buy Eurail pass', 'Photocopy passport'],
    },
    {
        title: 'Alaska Winter Lights',
        startDate: '2027-01-15',
        endDate: '2027-01-22',
        destinations: ['Anchorage, Alaska'],
        owners: ['testuser1', 'testuser2'],
        packlist: {
            title: 'Alaska Winter Lights Packlist',
            bags: [
                {
                    name: 'Cold Weather Layers',
                    color: '#3568c9',
                    items: [
                        { text: 'Thermal base layers x3', cold: true },
                        { text: 'Fleece mid-layers x2', cold: true },
                        { text: 'Heavy parka', cold: true },
                        { text: 'Snow pants', cold: true },
                        { text: 'Wool socks x5', cold: true },
                    ],
                },
                {
                    name: 'Accessories',
                    color: '#8f8f8f',
                    items: [
                        { text: 'Insulated gloves', cold: true },
                        { text: 'Wool hat', cold: true },
                        { text: 'Scarf', cold: true },
                        { text: 'Hand warmers', cold: true, lastMin: true },
                        { text: 'Balaclava', cold: true },
                    ],
                },
                {
                    name: 'Footwear',
                    color: '#8a5a3f',
                    items: [
                        { text: 'Insulated winter boots', cold: true },
                        { text: 'Traction cleats', cold: true },
                    ],
                },
            ],
            items: [
                'Camera + extra batteries',
                'Headlamp',
                { text: 'Passport', lastMin: true },
                'Aurora viewing chair/blanket',
            ],
        },
        tasks: [
            { day: 0, text: 'Flight to Anchorage — 1:30 PM' },
            { day: 0, text: 'Check into lodge' },
            { day: 1, text: 'Northern lights viewing tour' },
            { day: 3, text: 'Dog sledding excursion' },
            { day: 6, text: 'Flight home' },
        ],
        todos: ['Check aurora forecast', 'Rent extra cold-weather gear if needed', 'Charge camera batteries'],
    },
    {
        title: 'Best Friends Road Trip',
        startDate: '2026-11-05',
        endDate: '2026-11-15',
        destinations: ['Chicago', 'Nashville', 'New Orleans'],
        owners: ['testuser1', 'testuser2'],
        packlist: {
            title: 'Best Friends Road Trip Packlist',
            bags: [
                {
                    name: 'Clothes',
                    color: '#e2822f',
                    items: [
                        'Mixed casual outfits (7 days)',
                        'Light jacket',
                        'Comfortable sneakers',
                    ],
                },
                {
                    name: 'Road Trip Essentials',
                    color: '#dcb32e',
                    items: [
                        'Phone mount',
                        'Car charger',
                        'Snacks',
                        'Aux cable',
                        'Roadside emergency kit',
                    ],
                },
            ],
            items: [
                { text: 'Driver’s license', lastMin: true },
                'Cooler with drinks',
                'Camera',
                { text: 'Sunglasses', hot: true },
                'Reusable water bottles',
            ],
        },
        tasks: [
            { day: 0, text: 'Depart Chicago — 8:00 AM' },
            { day: 3, text: 'Arrive Nashville' },
            { day: 7, text: 'Arrive New Orleans' },
            { day: 10, text: 'Drop off rental car / fly home' },
        ],
        todos: ['Book rental car', 'Plan playlist', 'Split gas money spreadsheet'],
    },
    {
        title: 'Paris Anniversary Getaway',
        startDate: '2026-09-20',
        endDate: '2026-09-25',
        destinations: ['Paris'],
        owners: ['testuser2'],
        packlist: {
            title: 'Paris Anniversary Getaway Packlist',
            bags: [
                {
                    name: 'His Clothes',
                    color: '#3568c9',
                    items: ['Dress shirts x3', 'Slacks x2', 'Blazer', 'Dress shoes', 'Walking shoes'],
                },
                {
                    name: 'Her Clothes',
                    color: '#d8629a',
                    items: ['Dresses x3', 'Cardigan', 'Heels (for dinner)', 'Walking shoes', 'Scarf'],
                },
            ],
            items: [
                { text: 'Passports', lastMin: true },
                'Camera',
                { text: 'Anniversary card/gift', lastMin: true },
                'Museum pass printouts',
                'Phrasebook',
            ],
        },
        tasks: [
            { day: 0, text: 'Flight to Paris — 7:00 PM' },
            { day: 0, text: 'Check into boutique hotel' },
            { day: 1, text: 'Louvre + Seine river dinner cruise' },
            { day: 3, text: 'Anniversary dinner reservation' },
            { day: 5, text: 'Flight home' },
        ],
        todos: ['Book anniversary dinner reservation', 'Buy museum passes online', 'Pick up gift'],
    },
];

// Adds days to a 'YYYY-MM-DD' date.
function addDaysISO(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

// An item definition as { text, tags }.
function normalizeItem(entry) {
    if (typeof entry === 'string') return { text: entry, tags: {} };
    const { text, hot, cold, lastMin } = entry;
    return { text, tags: { isHot: !!hot, isCold: !!cold, isLastMin: !!lastMin } };
}

// Every user's id by lowercase username.
async function getUserIdMap() {
    const { rows } = await pool.query(`SELECT id, LOWER(username) AS username FROM users WHERE username IS NOT NULL`);
    const map = {};
    for (const row of rows) map[row.username] = row.id;
    return map;
}

// Step 1: delete every user not being kept.
async function deleteNonKeptUsers() {
    const placeholders = KEEP_USERNAMES.map((_, i) => `$${i + 1}`).join(', ');
    const emailPlaceholders = KEEP_EMAILS.map((_, i) => `$${KEEP_USERNAMES.length + i + 1}`).join(', ');
    const { rowCount } = await pool.query(
        `DELETE FROM users
         WHERE LOWER(COALESCE(username, '')) NOT IN (${placeholders})
           AND LOWER(COALESCE(email, '')) NOT IN (${emailPlaceholders})`,
        [...KEEP_USERNAMES.map((u) => u.toLowerCase()), ...KEEP_EMAILS.map((e) => e.toLowerCase())],
    );
    console.log(`Deleted ${rowCount} user(s) not in the keep list.`);
}

// Step 2: empty the shared caches.
async function clearCaches() {
    await pool.query('TRUNCATE cached_flights, cached_trip_tips, weather_history_cache, geocode_cache');
    console.log('Cleared cached_flights, cached_trip_tips, weather_history_cache, geocode_cache.');
}

// Step 3: delete every packing list except the sample.
async function deleteExtraPacklists() {
    const sampleId = process.env.SAMPLE_PACKLIST_PUBLIC_ID;
    // Stop if the sample's id isn't set or doesn't exist, rather than deleting every packing list
    // (this happened once when the script ran without .env).
    if (!sampleId) throw new Error('SAMPLE_PACKLIST_PUBLIC_ID is not set in this process\'s env — refusing to touch packlists.');
    const { rows } = await pool.query('SELECT 1 FROM packlists WHERE public_id = $1', [sampleId]);
    if (!rows[0]) throw new Error(`No packlist found with public_id ${sampleId} — refusing to delete the rest without it existing first.`);
    const { rowCount } = await pool.query('DELETE FROM packlists WHERE public_id != $1', [sampleId]);
    console.log(`Deleted ${rowCount} packlist(s) (kept the sample template).`);
}

// Step 4: delete every trip.
async function deleteAllTrips() {
    const { rowCount } = await pool.query('DELETE FROM trips');
    console.log(`Deleted ${rowCount} trip(s).`);
}

// Adds a packing list definition's loose items, bags and bag items.
async function buildPacklistTree(packlistId, def) {
    for (const item of def.items || []) {
        const { text, tags } = normalizeItem(item);
        await PacklistItem.add(packlistId, null, text, tags);
    }
    for (const bagDef of def.bags || []) {
        const bag = await PacklistBag.create(packlistId, null, bagDef.name, bagDef.color);
        for (const item of bagDef.items) {
            const { text, tags } = normalizeItem(item);
            await PacklistItem.add(packlistId, bag.id, text, tags);
        }
    }
}

// Step 5: create each trip with its members, day items, to-dos and linked packing list. Skips a
// trip whose owners don't exist.
async function seedTrips(userIdByUsername) {
    for (const def of TRIPS) {
        const ownerIds = def.owners.map((u) => userIdByUsername[u.toLowerCase()]).filter(Boolean);
        if (ownerIds.length !== def.owners.length) {
            console.warn(`Skipping "${def.title}" — owner(s) not found: ${def.owners.join(', ')}`);
            continue;
        }

        const trip = await Trip.create(def.title, def.startDate, def.endDate, pool, def.destinations);
        for (const userId of ownerIds) await TripMembership.ensureMember(trip.id, userId);

        for (const t of def.tasks) {
            await Task.add(trip.id, { dayDate: addDaysISO(def.startDate, t.day), text: t.text });
        }
        for (const text of def.todos) await Todo.add(trip.id, text);

        const packlist = await Packlist.create(def.packlist.title, pool);
        await PacklistMembership.ensureMember(packlist.id, ownerIds[0]);
        for (const userId of ownerIds.slice(1)) await PacklistMembership.ensureMember(packlist.id, userId);
        for (const userId of ownerIds) await TripPacklist.link(trip.id, userId, packlist.id);
        await buildPacklistTree(packlist.id, def.packlist);

        console.log(`Created "${def.title}" (${def.owners.join(' + ')}) — trip ${trip.publicId}, packlist ${packlist.publicId}`);
    }
}

// Runs the steps in order.
// Step 6: trips saved as full snapshots in scripts/seedData/*.json (day items with categories and
// linked pairs, day names, to-dos, and packlists with nested bags), for test trips too detailed
// for TRIPS above. Each snapshot's owners are its members; its packlists are linked for everyone.
// Skips a snapshot whose owners don't exist.
async function seedSnapshotTrips(userIdByUsername) {
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const dir = path.join(__dirname, 'seedData');
    if (!fs.existsSync(dir)) return;
    const newId = () => crypto.randomBytes(9).toString('base64url');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const snap = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const ownerIds = snap.owners.map((u) => userIdByUsername[u.toLowerCase()]).filter(Boolean);
        if (ownerIds.length !== snap.owners.length) {
            console.warn(`Skipping "${snap.title}" — owner(s) not found: ${snap.owners.join(', ')}`);
            continue;
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: [trip] } = await client.query(
                `INSERT INTO trips (public_id, title, start_date, end_date, day_titles, destinations, todo_title)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, public_id`,
                [newId(), snap.title, snap.startDate, snap.endDate, snap.dayTitles || {}, snap.destinations || [], snap.todoTitle || null],
            );
            for (const userId of ownerIds) {
                await client.query('INSERT INTO trip_members (trip_id, user_id) VALUES ($1, $2)', [trip.id, userId]);
            }
            // Linked pairs keep their link, under a new link id.
            const linkIds = {};
            for (const t of snap.tasks) {
                const linkId = t.linkId ? (linkIds[t.linkId] ||= `seed-${newId()}`) : null;
                await client.query(
                    `INSERT INTO tasks (trip_id, day_date, text, done, fixed, flight, cat, fields, tags, link, link_id, position)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [trip.id, t.day, t.text, !!t.done, !!t.fixed, !!t.flight, t.cat, t.fields || {}, t.tags || {}, t.link || null, linkId, t.position],
                );
            }
            for (const [i, todo] of snap.todos.entries()) {
                await client.query('INSERT INTO todos (trip_id, text, done, tags, position) VALUES ($1, $2, $3, $4, $5)',
                    [trip.id, todo.text, !!todo.done, todo.tags || {}, i]);
            }
            for (const pl of snap.packlists || []) {
                const { rows: [packlist] } = await client.query(
                    'INSERT INTO packlists (public_id, title) VALUES ($1, $2) RETURNING id, public_id', [newId(), pl.title],
                );
                for (const userId of ownerIds) {
                    await client.query('INSERT INTO packlist_members (packlist_id, user_id) VALUES ($1, $2)', [packlist.id, userId]);
                    await client.query('INSERT INTO trip_packlists (trip_id, user_id, packlist_id, for_everyone) VALUES ($1, $2, $3, TRUE)', [trip.id, userId, packlist.id]);
                }
                // Bags go in parents first; bagIds maps each snapshot bag id to its new id.
                const bagIds = {};
                let remaining = [...pl.bags];
                while (remaining.length) {
                    const ready = remaining.filter((b) => b.parent == null || bagIds[b.parent]);
                    if (!ready.length) throw new Error(`"${pl.title}" has bags whose parent is missing.`);
                    for (const b of ready) {
                        const { rows: [bag] } = await client.query(
                            'INSERT INTO packlist_bags (packlist_id, parent_bag_id, name, color, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                            [packlist.id, b.parent == null ? null : bagIds[b.parent], b.name, b.color, b.position],
                        );
                        bagIds[b.id] = bag.id;
                    }
                    remaining = remaining.filter((b) => !ready.includes(b));
                }
                for (const it of pl.items) {
                    await client.query(
                        `INSERT INTO packlist_items (packlist_id, bag_id, text, done, is_hot, is_cold, is_last_min, position)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [packlist.id, it.bag == null ? null : bagIds[it.bag], it.text, !!it.done, !!it.isHot, !!it.isCold, !!it.isLastMin, it.position],
                    );
                }
            }
            await client.query('COMMIT');
            console.log(`Created "${snap.title}" (${snap.owners.join(' + ')}) from ${file} — trip ${trip.public_id}`);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

// The test accounts. In test-users-only mode (always on production) nothing else is touched.
const TEST_USERNAMES = ['testuser1', 'testuser2'];

// Test-users-only mode: deletes the trips and packlists that only test accounts are on (anything
// shared with a real user is left alone), so the test trips can be recreated. Never deletes users,
// never clears caches, never touches the sample packlist.
async function deleteTestUsersOnlyData() {
    const names = TEST_USERNAMES.map((u) => u.toLowerCase());
    const trips = await pool.query(
        `DELETE FROM trips t
         WHERE EXISTS (SELECT 1 FROM trip_members m JOIN users u ON u.id = m.user_id
                       WHERE m.trip_id = t.id AND LOWER(u.username) = ANY($1))
           AND NOT EXISTS (SELECT 1 FROM trip_members m JOIN users u ON u.id = m.user_id
                           WHERE m.trip_id = t.id AND LOWER(COALESCE(u.username, '')) <> ALL($1))`,
        [names],
    );
    const packlists = await pool.query(
        `DELETE FROM packlists p
         WHERE p.public_id <> $2
           AND EXISTS (SELECT 1 FROM packlist_members m JOIN users u ON u.id = m.user_id
                       WHERE m.packlist_id = p.id AND LOWER(u.username) = ANY($1))
           AND NOT EXISTS (SELECT 1 FROM packlist_members m JOIN users u ON u.id = m.user_id
                           WHERE m.packlist_id = p.id AND LOWER(COALESCE(u.username, '')) <> ALL($1))`,
        [names, process.env.SAMPLE_PACKLIST_PUBLIC_ID || ''],
    );
    console.log(`Deleted ${trips.rowCount} trip(s) and ${packlists.rowCount} packlist(s) that only test accounts were on.`);
}

// Creates any test account that doesn't exist yet: name and username the same, email
// <username>@example.com, password SEED_TEST_PASSWORD (default test1234). Existing accounts are
// left as they are.
async function ensureTestUsers() {
    const bcrypt = require('bcrypt');
    const password = await bcrypt.hash(process.env.SEED_TEST_PASSWORD || 'test1234', 12);
    for (const username of TEST_USERNAMES) {
        const { rowCount } = await pool.query(
            `INSERT INTO users (name, username, email, password)
             SELECT $1::text, $1::text, $2::text, $3::text
             WHERE NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER($1::text))`,
            [username, `${username}@example.com`, password],
        );
        if (rowCount) console.log(`Created test account ${username}.`);
    }
}

// The test accounts' ids, by lowercase username (test-users-only mode).
async function getTestUserIdMap() {
    const { rows } = await pool.query(
        `SELECT id, LOWER(username) AS username FROM users WHERE LOWER(username) = ANY($1)`,
        [TEST_USERNAMES.map((u) => u.toLowerCase())],
    );
    const map = {};
    for (const row of rows) map[row.username] = row.id;
    return map;
}

// Only touches the test accounts' data by default, everywhere. The old full reset (which deletes
// every other user and all data) needs --full-reset and never runs on production.
async function main() {
    const production = process.env.NODE_ENV === 'production';
    const fullReset = process.argv.includes('--full-reset');
    if (fullReset && production) throw new Error('--full-reset is local only; it would delete real users.');
    // Without DATABASE_URL the connection quietly falls back to the local database settings.
    if (production && !process.env.DATABASE_URL) throw new Error('NODE_ENV=production needs DATABASE_URL (the Neon connection string).');
    const testUsersOnly = !fullReset;
    console.log(`Seeding against ${production ? 'PRODUCTION (Neon)' : 'dev (local Postgres)'}${testUsersOnly ? ', test accounts only' : ', FULL RESET'}...`);
    let userIdByUsername;
    if (testUsersOnly) {
        await ensureTestUsers();
        await deleteTestUsersOnlyData();
        userIdByUsername = await getTestUserIdMap();
    } else {
        await deleteNonKeptUsers();
        await clearCaches();
        await deleteExtraPacklists();
        await deleteAllTrips();
        userIdByUsername = await getUserIdMap();
    }
    await seedTrips(userIdByUsername);
    await seedSnapshotTrips(userIdByUsername);
    console.log('Done.');
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
