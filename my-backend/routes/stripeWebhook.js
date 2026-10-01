const Stripe = require('stripe');
const User = require('../models/User');
const StripePurchase = require('../models/StripePurchase');

// Receives Stripe's payment events and adds credits for completed purchases.

// Stripe client, or null when STRIPE_SECRET_KEY isn't set.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// POST /billing/stripe/webhook (set up in server.js with the raw body). Checks the event really
// came from Stripe (its signature), then for a completed checkout adds the credits to the user
// named in the checkout.
async function stripeWebhook(req, res) {
    if (!stripe) return res.status(503).json({ message: 'Stripe is not configured.' });
    const signature = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).json({ message: `Webhook signature verification failed: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        // The user id and credit amount set when the checkout was created (billingRoutes.js).
        const userId = Number(session.client_reference_id);
        const creditsGrant = Number(session.metadata?.creditsGrant) || 0;
        if (userId && creditsGrant > 0) {
            // Add credits only the first time this checkout is seen (Stripe can resend events).
            const claimedFresh = await StripePurchase.claim(session.id, userId);
            if (claimedFresh) await User.grantPurchase(userId, 'stripe', creditsGrant);
        }
    }

    res.json({ received: true });
}

module.exports = { stripeWebhook };
