// /contact route: the contact form.
const express = require('express');
const router = express.Router();
const { sendContactEmail } = require('../mailer');
const { BadRequestError } = require('../expressError');

const CATEGORIES = ['Technical Issue', 'Account & Login', 'Billing & Purchases', 'Feedback & Suggestions', 'Other'];
const MAX_MESSAGE_LENGTH = 5000;

// Emails a contact form message to us. No login needed, so anyone can reach support; it only
// sends an email and saves nothing.
router.post('/', async (req, res) => {
    try {
        // "website" is a hidden field people never see. If it's filled in, a bot sent this: pretend
        // it worked and send nothing.
        if (req.body.website) return res.json({ sent: true });

        const name = (req.body.name || '').trim();
        const email = (req.body.email || '').trim();
        const category = req.body.category;
        const message = (req.body.message || '').trim();

        if (!name || !email || !message) throw new BadRequestError('Name, email, and message are all required.');
        if (!CATEGORIES.includes(category)) throw new BadRequestError('Invalid category.');
        if (message.length > MAX_MESSAGE_LENGTH) throw new BadRequestError(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);

        await sendContactEmail({ name, email, category, message });
        res.json({ sent: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
