// /weather routes.
const express = require('express');
const router = express.Router();
const { requireUser } = require('../middleware/auth');
const { getHistoricalDayAverage } = require('../utils/weatherHistory');

// Typical weather for a place on a month/day (the 3-year average, cached — see
// utils/weatherHistory.js). The app uses it for days too far ahead for a real forecast (about
// 16 days out).
router.get('/historical', async (req, res) => {
    try {
        requireUser(res);
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        const month = parseInt(req.query.month, 10);
        const day = parseInt(req.query.day, 10);
        if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(month) || Number.isNaN(day)) {
            return res.status(400).json({ message: 'lat, lon, month, and day are required.' });
        }
        const result = await getHistoricalDayAverage(lat, lon, month, day);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
