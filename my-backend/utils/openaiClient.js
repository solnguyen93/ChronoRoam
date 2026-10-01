const OpenAI = require('openai');
const { BadRequestError } = require('../expressError');

// Returns an OpenAI client. Throws a 400 if OPENAI_API_KEY isn't set, so the AI feature reports
// "not available" instead of the server crashing.
function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new BadRequestError('This AI feature is not configured on the server (missing OPENAI_API_KEY).');
    }
    return new OpenAI({ apiKey });
}

module.exports = { getOpenAIClient };
