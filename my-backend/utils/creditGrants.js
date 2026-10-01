// What one purchase costs and how many credits it adds, used by both Stripe (billingRoutes.js) and
// Apple (appleReceiptVerification.js). Free credits are in importQuota.js.
//
// Each $5 purchase adds PURCHASE_CREDIT_GRANT credits; people buy again to get more. A few early
// accounts have purchase_platform = 'promo' from an old free giveaway (given, not bought).
const PURCHASE_CREDIT_GRANT = 100;
const PURCHASE_PRICE_CENTS = 500;

module.exports = { PURCHASE_CREDIT_GRANT, PURCHASE_PRICE_CENTS };
