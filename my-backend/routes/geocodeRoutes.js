// /geocode routes: place names to coordinates, using Open-Meteo.
const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { getGeocode } = require('../utils/geocode');
const ApiUsage = require('../models/ApiUsage');

// The best match for a place name (cached, see utils/geocode.js). Used for each day's location
// and the home location.
router.get('/', async (req, res) => {
    try {
        requireUser(res);
        const query = req.query.q;
        if (!query) return res.status(400).json({ message: 'q is required.' });
        const result = await getGeocode(query);
        res.json(result || {});
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Up to 5 matching cities for the home location field as the user types (e.g. "Seattle,
// Washington, United States" and "Seattle, Jalisco, Mexico"). Not cached, since it changes with
// every keystroke. No login needed, because the sign-up form uses it too.
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length < 2) return res.json({ results: [] });
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;
        await ApiUsage.increment('open-meteo-geocode');
        const apiRes = await fetch(url);
        const json = await apiRes.json();
        const results = (json.results || []).map((r) => ({
            label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
            lat: r.latitude,
            lon: r.longitude,
            city: r.name,
            country: r.country || null,
        }));
        res.json({ results });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
