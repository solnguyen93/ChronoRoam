// /flights routes: look up a flight by its number, and save a user's corrections.
const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const CachedFlight = require('../models/CachedFlight');
const ApiUsage = require('../models/ApiUsage');
const { lookupFlightAeroDataBox } = require('../utils/aerodatabox');
const { lookupFlight } = require('../utils/aviationstack');
const { lookupFlightAI } = require('../utils/aiFlightLookup');

// Free monthly limits: AeroDataBox allows 600 units/month at 2 units per lookup (300 lookups);
// AviationStack allows 100 requests/month.
const AERODATABOX_MONTHLY_CAP = 300;
const AVIATIONSTACK_MONTHLY_CAP = 100;

// Tries one limited provider. Skips it (returns null) once this month's limit is reached;
// otherwise counts the call and returns its answer, or null if it found nothing or failed.
async function tryMeteredProvider(provider, cap, lookupFn, flightNumber) {
    const usage = await ApiUsage.getCount(provider);
    if (usage >= cap) return null;
    await ApiUsage.increment(provider);
    try {
        return await lookupFn(flightNumber);
    } catch (err) {
        return null;
    }
}

// Looks up a flight number (when the user enters one in the flight form). Returns the cached
// answer if there is one; otherwise tries AeroDataBox, then AviationStack, then an AI web search
// (costs about $0.0034 per lookup, aiFlightLookup.js), and caches the first answer found.
router.get('/:flightNumber', async (req, res) => {
    try {
        requireUser(res);
        const cached = await CachedFlight.get(req.params.flightNumber);
        if (cached) return res.json({ flight: cached, source: 'cache' });

        let looked = await tryMeteredProvider('aerodatabox', AERODATABOX_MONTHLY_CAP, lookupFlightAeroDataBox, req.params.flightNumber);
        let source = 'aerodatabox';

        if (!looked) {
            looked = await tryMeteredProvider('aviationstack', AVIATIONSTACK_MONTHLY_CAP, lookupFlight, req.params.flightNumber);
            source = 'aviationstack';
        }

        if (!looked) {
            looked = await lookupFlightAI(req.params.flightNumber);
            source = 'ai';
        }

        if (!looked) return res.status(404).json({ message: 'No flight found for that number.' });

        const saved = await CachedFlight.upsert(req.params.flightNumber, looked);
        res.json({ flight: saved, source });
    } catch (error) {
        // Only the AI lookup's errors get here. The app treats it as "couldn't look it up", and the
        // user can still fill in the fields by hand.
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves a user's correction to a flight, replacing the cached answer for everyone.
router.put('/:flightNumber', async (req, res) => {
    try {
        requireUser(res);
        const { airline, depAirport, depTime, arrAirport, arrTime, arrDayOffset, duration } = req.body;
        const saved = await CachedFlight.upsert(req.params.flightNumber, { airline, depAirport, depTime, arrAirport, arrTime, arrDayOffset, duration });
        res.json({ flight: saved });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
