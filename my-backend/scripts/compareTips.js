// Compares Trip Tips from Claude and from OpenAI for the same trip, printing both, to judge
// quality before switching. Not used by the app.
//
// Usage: node scripts/compareTips.js "Birthday Trip to Porto" 2026-09-01 2026-09-05
require('dotenv').config();
const { getTripTips } = require('../utils/aiTripTips');
const { getTripTipsOpenAI } = require('../utils/aiTripTipsOpenAI');

// Prints one AI's tips.
function printResult(label, result) {
    console.log(`\n===== ${label} =====`);
    if (!result.hasDestination) {
        console.log('(no destination detected)');
        return;
    }
    console.log(`Visa tip: ${result.tipText}`);
    console.log(`Source: ${result.sourceLabel} — ${result.sourceUrl}`);
    console.log(`Resolved city: ${result.resolvedCity || '(none)'}, ${result.resolvedCountry || ''}`);
    console.log('Experiential tips:');
    for (const tip of result.experientialTips) {
        console.log(`  - [${tip.topic}] ${tip.text}`);
    }
}

async function main() {
    const [title, startDate, endDate] = process.argv.slice(2);
    if (!title || !startDate || !endDate) {
        console.error('Usage: node scripts/compareTips.js "<trip title>" <startDate YYYY-MM-DD> <endDate YYYY-MM-DD>');
        process.exit(1);
    }

    console.log(`Comparing Trip Tips for "${title}" (${startDate} to ${endDate})...`);

    const [claudeResult, claudeErr] = await getTripTips(title, startDate, endDate).then((r) => [r, null]).catch((e) => [null, e]);
    const [gptResult, gptErr] = await getTripTipsOpenAI(title, startDate, endDate).then((r) => [r, null]).catch((e) => [null, e]);

    if (claudeErr) {
        console.log('\n===== Claude (Haiku 4.5) =====');
        console.log(`ERROR: ${claudeErr.message}`);
    } else {
        printResult('Claude (Haiku 4.5)', claudeResult);
    }

    if (gptErr) {
        console.log('\n===== GPT (gpt-4.1-mini) =====');
        console.log(`ERROR: ${gptErr.message}`);
    } else {
        printResult('GPT (gpt-4.1-mini)', gptResult);
    }
}

main();
