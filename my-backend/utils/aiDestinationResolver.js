const { getOpenAIClient } = require('./openaiClient');
const ApiUsage = require('../models/ApiUsage');

// Asks a cheap AI model (gpt-4.1-nano, about $0.000007 per call) which real place a trip title
// names or implies — a city, country, region or landmark — and returns it as a lowercase
// "place, country" key, or null if there's none. Trip Tips (routes/aiRoutes.js) uses the key to
// reuse tips already cached for that place under another title, instead of paying for the full
// call, which costs about 2,300 times more.
async function resolveDestinationKey(title) {
    const trimmed = (title || '').trim();
    if (!trimmed) return null;

    try {
        const client = getOpenAIClient();
        await ApiUsage.increment('openai');
        const response = await client.responses.create({
            model: 'gpt-4.1-nano',
            input: [{
                role: 'user',
                content: `What real geographic destination does this trip title name or clearly imply — a specific city, a country, a clear region, or a named landmark/park (e.g. "Grand Canyon", "the Alps")? Reply with ONLY "Place, Country" (e.g. "Tokyo, Japan" or "Grand Canyon, United States") or "NONE" if no specific real place is named or clearly implied. Title: "${trimmed}"`,
            }],
        });
        const text = (response.output_text || '').trim();
        if (!text || /^none$/i.test(text)) return null;
        return text.toLowerCase().replace(/\s+/g, ' ').trim();
    } catch (err) {
        // Any failure (no key, network) returns null, and Trip Tips just makes the full call.
        return null;
    }
}

module.exports = { resolveDestinationKey };
