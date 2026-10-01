// Live updates: tells people who have a trip or packing list open that someone else just changed
// it, so their app reloads it right away instead of waiting for the next 20-second check.
//
// Each open page keeps one connection to GET /live (routes/liveRoutes.js) and names what it's
// showing, like "trip:<publicId>" or "packlist:<publicId>". After a change is saved, the
// middleware below sends "changed" to every connection watching it, except the one that made
// the change (the app sends its own X-Client-Id with every request). Only the fact that it
// changed is sent, not the change itself; the app reloads to get it.
//
// Connections are kept in this server's memory, which works while the backend runs as one server.

const watchers = new Map(); // "trip:<publicId>" -> Set of { res, clientId }

function watch(keys, res, clientId) {
    const entry = { res, clientId };
    for (const key of keys) {
        if (!watchers.has(key)) watchers.set(key, new Set());
        watchers.get(key).add(entry);
    }
    return () => {
        for (const key of keys) {
            const set = watchers.get(key);
            if (!set) continue;
            set.delete(entry);
            if (!set.size) watchers.delete(key);
        }
    };
}

function notify(key, fromClientId) {
    const set = watchers.get(key);
    if (!set) return;
    for (const { res, clientId } of set) {
        if (fromClientId && clientId === fromClientId) continue;
        res.write(`data: ${JSON.stringify({ key })}\n\n`);
    }
}

// Runs before the routes. After any successful change (not a GET) under /trips/<id> or
// /packlists/<id>, notifies the people watching that trip or list.
function notifyOnChange(req, res, next) {
    if (req.method === 'GET') return next();
    const match = req.path.match(/^\/(trips|packlists)\/([^/]+)/);
    if (!match) return next();
    const key = `${match[1] === 'trips' ? 'trip' : 'packlist'}:${match[2]}`;
    const fromClientId = req.get('X-Client-Id');
    res.on('finish', () => {
        if (res.statusCode < 400) notify(key, fromClientId);
    });
    return next();
}

module.exports = { watch, notify, notifyOnChange };
