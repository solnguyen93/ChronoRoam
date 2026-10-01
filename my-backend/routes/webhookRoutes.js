// /webhooks routes: booking emails forwarded to a user's address, sent here by the Cloudflare
// email worker (email-worker/).
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PendingEmailImport = require('../models/PendingEmailImport');
const { extractConfirmation } = require('../utils/aiConfirmationExtraction');
const { assertImportQuota, recordImportUsage } = require('../utils/importQuota');
const { BadRequestError, UnauthorizedError, NotFoundError, QuotaExceededError } = require('../expressError');

// The worker proves it's the worker with a shared secret in the x-webhook-secret header (there's
// no user login on this call). Throws a 401 if it's wrong, or if EMAIL_INTAKE_SHARED_SECRET isn't
// set (which turns the feature off).
function checkSharedSecret(req) {
    const configured = process.env.EMAIL_INTAKE_SHARED_SECRET;
    if (!configured) throw new UnauthorizedError('Email intake is not enabled.');
    const provided = req.headers['x-webhook-secret'];
    // Compare in constant time. timingSafeEqual needs equal lengths, so a different length is
    // simply wrong.
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(configured);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new UnauthorizedError('Invalid webhook secret.');
    }
}

// Called for each email forwarded to <username>@<domain>, with { username, emailText,
// fromAddress }. Uses one credit to extract the booking with AI (same as pasting an email), then
// saves it for the user to review in the app (emailImportRoutes.js) — nothing is added to a trip
// until they do.
router.post('/email-intake', async (req, res) => {
    try {
        checkSharedSecret(req);

        const { username, emailText, fromAddress } = req.body;
        if (!username || !emailText) throw new BadRequestError('username and emailText are required.');

        const user = await User.getByUsername(username);
        if (!user) throw new NotFoundError(`No ChronoRoam user found for "${username}".`);

        // Out of credits: skip the AI call and save nothing (the email just never shows up for
        // review).
        let status;
        try {
            status = await assertImportQuota(user.id);
        } catch (err) {
            if (err instanceof QuotaExceededError) return res.json({ imported: false, reason: 'quota_exceeded' });
            throw err;
        }

        // One AI call works out the kind of booking and pulls out its details, then the credit is used.
        const { category, legs } = await extractConfirmation(emailText);
        await recordImportUsage(user.id, status);

        if (!category || legs.length === 0) {
            // Not a booking email (or nothing to extract): save nothing.
            return res.json({ imported: false });
        }

        const row = await PendingEmailImport.create(user.id, { category, legs, fromAddress });
        res.json({ imported: true, id: row.id, category, legCount: legs.length });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
