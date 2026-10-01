const Anthropic = require('@anthropic-ai/sdk');
const { BadRequestError } = require('../expressError');

// Returns a client for Claude (Anthropic's API). Throws a 400 if ANTHROPIC_API_KEY isn't set, so
// the AI feature reports "not available" instead of the server crashing.
function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new BadRequestError('This AI feature is not configured on the server (missing ANTHROPIC_API_KEY).');
    }
    return new Anthropic({ apiKey });
}

module.exports = { getAnthropicClient };
