const TripPacklist = require('../models/TripPacklist');
const PacklistItem = require('../models/PacklistItem');
const PacklistBag = require('../models/PacklistBag');
const { PacklistMembership } = require('../models/Membership');

// Every packing list this user has linked to a trip, each as { packlist, items, bags }. Also makes the user a
// member of each one, so a trip's packing lists show up on their Home too. Used by tripRoutes.js
// and tripPacklistRoutes.js.
async function buildLinkedPacklists(trip, userId) {
    const packlists = await TripPacklist.getForTrip(trip.id, userId);
    return Promise.all(packlists.map(async (packlist) => {
        await PacklistMembership.ensureMember(packlist.id, userId);
        const [items, bags] = await Promise.all([
            PacklistItem.getAll(packlist.id),
            PacklistBag.getAllForPacklist(packlist.id),
        ]);
        return { packlist, items, bags };
    }));
}

module.exports = { buildLinkedPacklists };
