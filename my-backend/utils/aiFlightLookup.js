const { BadRequestError } = require('../expressError');
const { getOpenAIClient } = require('./openaiClient');
const ApiUsage = require('../models/ApiUsage');

// Looks up a flight number with OpenAI (gpt-4.1-mini with web search), the last option after
// AeroDataBox and AviationStack (see flightRoutes.js). About $0.0034 per lookup. The answer must
// match FLIGHT_SCHEMA, so it comes back as fields, not text.
const FLIGHT_SCHEMA = {
    type: 'object',
    properties: {
        found: { type: 'boolean', description: 'true if this flight number is a real, findable scheduled flight' },
        airline: { type: 'string', description: "Airline name, e.g. 'Alaska Airlines'. Empty string if not found." },
        depAirport: { type: 'string', description: '3-letter IATA code.' },
        depTime: { type: 'string', description: "Scheduled local departure time as written, e.g. '1:30 PM'." },
        arrAirport: { type: 'string', description: '3-letter IATA code.' },
        arrTime: { type: 'string', description: "Scheduled local arrival time as written, e.g. '4:00 PM'." },
        arrDayOffset: { type: 'integer', description: 'Calendar days between departure and arrival: 0 if same day, 1 if the flight arrives the next day, etc.' },
        duration: { type: 'string', description: "Flight duration, e.g. '10h 30m'." },
    },
    required: ['found', 'airline', 'depAirport', 'depTime', 'arrAirport', 'arrTime', 'arrDayOffset', 'duration'],
    additionalProperties: false,
};

// The flight's route and times, or null if not found.
async function lookupFlightAI(flightNumber) {
    const key = (flightNumber || '').trim().toUpperCase();
    if (!key) return null;

    const client = getOpenAIClient();
    let response;
    await ApiUsage.increment('openai');
    try {
        response = await client.responses.create({
            model: 'gpt-4.1-mini',
            tools: [{ type: 'web_search' }],
            text: { format: { type: 'json_schema', name: 'flight_schedule', schema: FLIGHT_SCHEMA, strict: true } },
            input: `What is the typical scheduled route (departure/arrival airport and time, duration) for flight ${key}?`,
        });
    } catch (err) {
        throw new BadRequestError(err.message || 'AI flight lookup is unavailable right now.');
    }

    if (!response.output_text) return null;
    let parsed;
    try {
        parsed = JSON.parse(response.output_text);
    } catch (err) {
        return null;
    }
    if (!parsed.found) return null;

    return {
        airline: parsed.airline || null,
        depAirport: parsed.depAirport || null,
        depTime: parsed.depTime || null,
        arrAirport: parsed.arrAirport || null,
        arrTime: parsed.arrTime || null,
        arrDayOffset: parsed.arrDayOffset ?? null,
        duration: parsed.duration || null,
    };
}

module.exports = { lookupFlightAI };
