// /billing routes: credit status and buying credits (Apple and Stripe).
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { requireUser } = require('../middleware/auth');
const { getImportQuotaStatus } = require('../utils/importQuota');
const { getResourceQuotaStatus } = require('../utils/resourceQuota');
const { verifyAppleTransaction, CREDITS_BY_PRODUCT } = require('../utils/appleReceiptVerification');
const { PURCHASE_CREDIT_GRANT, PURCHASE_PRICE_CENTS } = require('../utils/creditGrants');
const User = require('../models/User');
const ApplePurchase = require('../models/ApplePurchase');
const { BadRequestError } = require('../expressError');

// Stripe client, or null when STRIPE_SECRET_KEY isn't set (creating it without a key would crash
// the server at startup).
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Everything the app needs to show credits and limits, in one object: credit status plus the
// trip and packing list limits (which only apply to guests).
async function fullStatus(userId) {
    const [imports, trips, packlists] = await Promise.all([
        getImportQuotaStatus(userId),
        getResourceQuotaStatus(userId, 'trip'),
        getResourceQuotaStatus(userId, 'packlist'),
    ]);
    return { ...imports, trips, packlists };
}

// The signed-in user's credits and limits (used by the app's useBillingStatus hook).
router.get('/status', async (req, res) => {
    try {
        const user = requireUser(res);
        res.json(await fullStatus(user.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Called by the iPhone app after an Apple purchase. Checks with Apple that the purchase is real
// and for our product (verifyAppleTransaction), records it (ApplePurchase.claim: only once, and
// only for one account), adds the credits the first time, and returns the new status.
router.post('/apple/verify', async (req, res) => {
    try {
        const user = requireUser(res);
        const { jwsRepresentation } = req.body;
        if (!jwsRepresentation) throw new BadRequestError('jwsRepresentation is required.');
        const decoded = await verifyAppleTransaction(jwsRepresentation);
        const claimedFresh = await ApplePurchase.claim(decoded.originalTransactionId, user.id);
        if (claimedFresh) await User.grantPurchase(user.id, 'apple', CREDITS_BY_PRODUCT[decoded.productId]);
        res.json(await fullStatus(user.id));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Starts a web purchase: creates a Stripe checkout and returns its client secret, which the
// purchase popup uses to show Stripe's payment form inside the app (PurchaseModal.js). Card
// details go straight to Stripe. Credits are added later, when Stripe's webhook confirms the
// payment (stripeWebhook.js). Price and credits come from utils/creditGrants.js.
router.post('/stripe/checkout', async (req, res) => {
    try {
        const user = requireUser(res);
        if (!stripe) throw new BadRequestError('Web checkout is not configured yet.');
        const session = await stripe.checkout.sessions.create({
            ui_mode: 'embedded_page',
            mode: 'payment',
            // Hide Klarna (which asks for a phone number) and US bank transfers. Stripe's Link
            // can't be hidden here; it's turned off in the Stripe Dashboard instead.
            excluded_payment_method_types: ['klarna', 'us_bank_account'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        // Same name as the purchase screen and the App Store product: "100 Credits".
                        name: `ChronoRoam — ${PURCHASE_CREDIT_GRANT.toLocaleString('en-US')} Credits`,
                    },
                    unit_amount: PURCHASE_PRICE_CENTS,
                },
                quantity: 1,
            }],
            // Stripe sends these back in the webhook, so it knows which user to credit and how many.
            client_reference_id: String(user.id),
            metadata: { creditsGrant: String(PURCHASE_CREDIT_GRANT) },
            // Where Stripe sends the browser when the payment finishes (success or not). The credits
            // themselves come from the webhook.
            return_url: `${process.env.FRONTEND_URL}/#/home?purchase=complete`,
        });
        res.json({ clientSecret: session.client_secret });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
