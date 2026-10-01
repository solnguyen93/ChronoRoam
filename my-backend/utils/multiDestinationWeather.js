// Trip Tips' weather for a trip to several places: the typical weather at each place over the
// whole trip's dates (we don't know which days are spent where), summed up in one sentence by AI.
const { getGeocode } = require('./geocode');
const { tripRangeAverages } = require('./weatherComparison');
const { getAnthropicClient } = require('./anthropicClient');
const ApiUsage = require('../models/ApiUsage');

// Typical weather for each place: `rows` for places with data, and `excluded` for places that
// couldn't be found or had no data (the summary is told to leave those out by name).
async function getMultiDestinationWeather(destinations, startDate, endDate) {
    const results = await Promise.all(destinations.map(async (destination) => {
        const geo = await getGeocode(destination);
        if (!geo) return { destination, ok: false };
        const { avgF, avgHumidity, minF, maxF } = await tripRangeAverages(geo.lat, geo.lon, startDate, endDate);
        if (avgF == null) return { destination, ok: false };
        // Show a range only when the days differ by 15°F or more.
        const hasRange = minF != null && maxF != null && (maxF - minF) >= 15;
        return {
            destination, ok: true,
            city: geo.city,
            country: geo.country,
            avgF: Math.round(avgF),
            minF: hasRange ? Math.round(minF) : null,
            maxF: hasRange ? Math.round(maxF) : null,
            avgHumidity: avgHumidity != null ? Math.round(avgHumidity) : null,
        };
    }));
    return {
        rows: results.filter((r) => r.ok),
        excluded: results.filter((r) => !r.ok).map((r) => r.destination),
    };
}

// A plain summary without AI ("Tokyo: ~65-82°F, Seoul: ~55°F."), used when the AI answer can't be used.
function buildFallbackSummary(rows) {
    return rows.map((r) => `${r.destination}: ~${r.minF != null ? `${r.minF}-${r.maxF}` : r.avgF}°F`).join(', ') + '.';
}

// Asks Claude (claude-haiku-4-5) for a one-sentence, casual weather summary of the places, using
// only the numbers given. Returns the text, or null if it refused.
async function callWeatherHaiku(client, dataLines, excludedLine, startDate, endDate) {
    await ApiUsage.increment('anthropic');
    const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: `You're a local, asked casually "hey, I'm heading to these places — what should I expect weather-wise?" You're given REAL historical data for each place on their trip (${startDate} to ${endDate}) below — this list is the traveler's COMPLETE itinerary. Only discuss the exact places listed — never mention, describe, or give numbers for any other place, even one you recognize and know something about from your own knowledge. Never invent or adjust a number for a place that IS listed either.${excludedLine}

Write ONE tight sentence, 35 words or fewer — hard limit, not a suggestion. Casual and direct, like a text message, not a formal report — this is a bonus "good to know," not a serious weather bulletin.

State the actual number for every place you mention — a real figure is more useful than an adjective alone, so don't just say "warm," say "warm, around 75°F." Each place's data line below already tells you whether to give ONE number (avgF) or a RANGE (minF-maxF, only present when the spread is real, see the line itself) — give whichever one that place's line provides, never both, never a number you weren't given. You can still lean into genuinely notable extremes in your wording (e.g. "HOT and humid" for 95°F+, "freezing" near/below 32°F) — the adjective adds color, the number adds the actually useful part; never state the adjective alone with no number.

Do NOT add a packing suggestion or any other advisory tail ("pack a jacket," "bring layers," "dress in layers") — once the reader has the real number and a one-word feel for it, what to pack is obvious to them; adding it is just padding, not help. State what it's actually like and stop there.

Scale your level of detail to how many places there are, the way a person actually would when asked this: a couple places — name them specifically ("Tokyo's warm, around 78°F; Seoul's colder, around 55°F"). A handful with a real spread — group the similar ones and call out the standout, numbers included for each group. Many places (roughly 6+) — don't try to give every one its own number; just give the overall shape, broadly, with maybe one or two standout figures ("this trip spans a huge range, from freezing up in the mountains to 90°F+ on the coast"). The more places there are, the broader and less itemized your answer should get, exactly like a real person would stop listing things out one by one and just summarize.

If the places vary enough from EACH OTHER to matter for packing, that contrast IS the answer — lead with it. If everything's similar throughout, just give one clear expectation. Never mention rain/precipitation (no data given for it). No preamble, no hedging, just the answer.`,
        messages: [{ role: 'user', content: dataLines }],
    });
    if (response.stop_reason === 'refusal') return null;
    return response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

// One sentence about the weather across the places. One place: written without AI. Several: AI
// writes it from the real numbers. If the AI mentions a place that had no data (it sometimes
// describes places from its own knowledge), it's asked once more, and after that the plain
// summary is used instead.
async function summarizeMultiDestinationWeather(rows, excluded, startDate, endDate) {
    if (rows.length === 0) return null;
    if (rows.length === 1) {
        const r = rows[0];
        const figure = r.minF != null ? `~${r.minF}-${r.maxF}°F` : `around ${r.avgF}°F`;
        return `Expect ${figure}${r.avgHumidity != null ? `, ~${r.avgHumidity}% humidity` : ''} in ${r.city || r.destination}.`;
    }

    const client = getAnthropicClient();
    const dataLines = rows.map((r) => {
        const figure = r.minF != null ? `ranges ~${r.minF}-${r.maxF}°F (real spread — state as a range)` : `avg ~${r.avgF}°F (fairly consistent — state as one number)`;
        return `${r.destination}: ${figure}${r.avgHumidity != null ? `, ~${r.avgHumidity}% humidity` : ''}`;
    }).join('\n');
    const excludedLine = excluded?.length
        ? ` The following were part of the trip but have NO real data and must not appear anywhere in your answer, not even in passing: ${excluded.join(', ')}.`
        : '';

    let summary;
    try {
        summary = await callWeatherHaiku(client, dataLines, excludedLine, startDate, endDate);
        if (summary && excluded?.some((name) => summary.toLowerCase().includes(name.toLowerCase()))) {
            summary = await callWeatherHaiku(client, dataLines, excludedLine, startDate, endDate);
        }
        if (!summary || excluded?.some((name) => summary.toLowerCase().includes(name.toLowerCase()))) {
            return buildFallbackSummary(rows);
        }
    } catch (err) {
        return buildFallbackSummary(rows); // the AI call failed: use the plain summary
    }
    return summary;
}

module.exports = { getMultiDestinationWeather, summarizeMultiDestinationWeather };
