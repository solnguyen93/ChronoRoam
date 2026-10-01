// The old to-do / day item tags (food, cafe, shopping), stored as { key: true }. The app now puts
// these emoji in the item's text instead; this only keeps older items' tags.
const ITEM_TAG_KEYS = ['food', 'cafe', 'shopping'];

// Keeps only the known tags that are on, so nothing else can be stored in the column.
function cleanTags(tags) {
    const out = {};
    for (const k of ITEM_TAG_KEYS) if (tags && tags[k]) out[k] = true;
    return out;
}

module.exports = { cleanTags, ITEM_TAG_KEYS };
