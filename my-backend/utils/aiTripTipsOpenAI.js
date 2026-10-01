const { BadRequestError } = require('../expressError');
const { getOpenAIClient } = require('./openaiClient');
const { buildTipsSystemPrompt, parseTipsResponse } = require('./tripTipsShared');

// Trip Tips from OpenAI (gpt-4.1-mini with web search) instead of Claude, using the same prompt and
// parsing as aiTripTips.js. Not used by the app — only by scripts/compareTips.js to compare the two.
async function getTripTipsOpenAI(tripTitle, startDate, endDate, passportCountry = 'United States') {
    const title = (tripTitle || '').trim();
    if (!title) return { hasDestination: false, experientialTips: [] };

    const client = getOpenAIClient();

    let response;
    try {
        response = await client.responses.create({
            model: 'gpt-4.1-mini',
            tools: [{ type: 'web_search' }],
            input: [
                { role: 'developer', content: buildTipsSystemPrompt(passportCountry) },
                { role: 'user', content: `Trip title: "${title}"\nTrip dates: ${startDate} to ${endDate}` },
            ],
        });
    } catch (err) {
        throw new BadRequestError(err.message || 'AI travel tips are unavailable right now. Try again later.');
    }

    const text = (response.output_text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        throw new BadRequestError("Couldn't generate travel tips for this trip.");
    }

    return parseTipsResponse(text);
}

module.exports = { getTripTipsOpenAI };
