const { BadRequestError } = require('../expressError');
const { getAnthropicClient } = require('./anthropicClient');
const { buildTipsSystemPrompt, parseTipsResponse } = require('./tripTipsShared');
const ApiUsage = require('../models/ApiUsage');

// Trip Tips from Claude (claude-haiku-4-5) with web search, in one call: the visa tip and the local
// tips (getting around, cash or card, walkability, and so on). Takes the trip title and dates as
// they are — the AI works out the place, even for titles like "Europe Trip". The prompt and the
// parsing of the answer are in tripTipsShared.js.
async function getTripTips(tripTitle, startDate, endDate, passportCountry = 'United States', placeCount = 1) {
    const title = (tripTitle || '').trim();
    if (!title) return { hasDestination: false, experientialTips: [] };

    const client = getAnthropicClient();

    let response;
    await ApiUsage.increment('anthropic');
    try {
        response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 4096,
            // Up to 2 web searches per place (one for visa rules, one for things like cash vs card),
            // at most 8, to keep cost and time down for long trips.
            tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(Math.max(placeCount, 1) * 2, 8), allowed_callers: ['direct'] }],
            system: buildTipsSystemPrompt(passportCountry),
            messages: [{ role: 'user', content: `Trip title: "${title}"\nTrip dates: ${startDate} to ${endDate}` }],
        });
    } catch (err) {
        throw new BadRequestError(err.message || 'AI travel tips are unavailable right now. Try again later.');
    }

    if (response.stop_reason === 'refusal') {
        throw new BadRequestError("Couldn't generate travel tips for this trip.");
    }

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').replace(/\s+/g, ' ').trim();

    return parseTipsResponse(text);
}

module.exports = { getTripTips };
