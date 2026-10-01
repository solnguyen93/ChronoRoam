const { BadRequestError } = require('../expressError');
const { getAnthropicClient } = require('./anthropicClient');
const { getOpenAIClient } = require('./openaiClient');
const ApiUsage = require('../models/ApiUsage');

// Runs an AI call whose answer must match a JSON schema, with OpenAI or Claude.

// Which AI to use for imports: 'openai' when AI_EXTRACTION_PROVIDER=openai, otherwise 'anthropic'.
// (OpenAI uses gpt-4.1-nano: in testing it was the cheapest model that got every field right. The
// gpt-5 models cost more per call because they use extra hidden "reasoning" output.)
function extractionProvider() {
    return process.env.AI_EXTRACTION_PROVIDER === 'openai' ? 'openai' : 'anthropic';
}

// Sends the prompt and returns the answer as an object (or null if the AI returned nothing).
// Throws a 400 with the given messages when the AI refuses, can't be reached, or returns bad JSON.
// The same schema works for both AIs. `provider` picks the AI for this one call (used to retry
// with the other one, see aiConfirmationExtraction.js).
async function callStructuredJSON({ schemaName, schema, prompt, refusalMessage, parseErrorMessage, unavailableMessage, provider }) {
    if ((provider || extractionProvider()) === 'openai') {
        const client = getOpenAIClient();
        let response;
        await ApiUsage.increment('openai'); // count the call
        try {
            response = await client.responses.create({
                model: 'gpt-4.1-nano',
                input: [{ role: 'user', content: prompt }],
                text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
                // Room for long answers (a big packing list), so the answer isn't cut off partway.
                max_output_tokens: 8000,
            }, {
                // The cheap AI sometimes keeps writing until it runs out of room (over a minute) and
                // then fails. Give up after 20 seconds, with no automatic retries, so the caller can
                // ask Claude instead (aiConfirmationExtraction.js).
                timeout: 20000,
                maxRetries: 0,
            });
        } catch (err) {
            throw new BadRequestError(err.message || unavailableMessage);
        }

        // The answer was cut off or refused.
        if (response.status === 'incomplete') {
            throw new BadRequestError(refusalMessage);
        }
        if (!response.output_text) return null;

        try {
            return JSON.parse(response.output_text);
        } catch (err) {
            throw new BadRequestError(parseErrorMessage);
        }
    }

    const client = getAnthropicClient();
    let response;
    await ApiUsage.increment('anthropic');
    try {
        response = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 8000,
            output_config: { format: { type: 'json_schema', schema } },
            messages: [{ role: 'user', content: prompt }],
        });
    } catch (err) {
        throw new BadRequestError(err.message || unavailableMessage);
    }

    if (response.stop_reason === 'refusal') {
        throw new BadRequestError(refusalMessage);
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return null;

    try {
        return JSON.parse(textBlock.text);
    } catch (err) {
        throw new BadRequestError(parseErrorMessage);
    }
}

module.exports = { callStructuredJSON, extractionProvider };
