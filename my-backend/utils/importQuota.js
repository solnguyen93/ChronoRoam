const User = require('../models/User');
const AiImportUsage = require('../models/AiImportUsage');
const { QuotaExceededError } = require('../expressError');
const { tierFor } = require('./accountTier');
const { PURCHASE_CREDIT_GRANT } = require('./creditGrants');

// Credits: each AI import uses one.
//
// Free credits: 3 for a guest, 50 for a user, for the life of the account (they never refill).
// Signing up clears a guest's usage, so every new user starts with 50. An account made with a
// deleted account's email gets no free credits (created_at is backdated, see User.js).
//
// Balance (import_credits): purchases add to it, and so do credits restored from a deleted account.
// Free credits are spent first, then the balance. Guests can't buy credits.
const GUEST_IMPORT_LIMIT = 3;
const FREE_IMPORT_LIMIT = 50;

const IMPORT_LIMITS = { guest: GUEST_IMPORT_LIMIT, user: FREE_IMPORT_LIMIT };

// Whether this account gets no free credits: User.js sets created_at to 2000-01-01 for that.
function freeImportsAlreadySpent(user) {
    return new Date(user.createdAt).getUTCFullYear() <= 2000;
}

// A user's credit status. The app shows this (GET /billing/status) and the checks below use it, so
// what the user sees always matches what's enforced.
async function getImportQuotaStatus(userId) {
    const user = await User.getById(userId);
    const tier = tierFor(user);
    // Free credits left = allowance minus imports used. Total they can spend = that + the balance.
    const used = await AiImportUsage.getTotal(userId);
    const limit = freeImportsAlreadySpent(user) ? 0 : IMPORT_LIMITS[tier];
    const freeRemaining = Math.max(0, limit - used);
    return {
        tier, isGuest: tier === 'guest',
        // Whether they've ever bought credits, and where.
        hasPurchased: user.hasPurchased, purchasePlatform: user.purchasePlatform,
        used, limit,
        credits: user.importCredits,
        freeRemaining,
        remaining: freeRemaining + user.importCredits,
        purchaseCreditGrant: PURCHASE_CREDIT_GRANT,
        freeImportLimit: FREE_IMPORT_LIMIT,
    };
}

// Called before an AI import: throws a 429 if the user has no credits left, so the AI call never
// happens. Returns the status, to pass to recordImportUsage after the call.
async function assertImportQuota(userId) {
    const status = await getImportQuotaStatus(userId);
    if (status.remaining <= 0) {
        const messages = {
            user: `You're out of credits. Purchase more to keep using AI imports.`,
            guest: `You've used all your guest credits. Sign up for free to get ${FREE_IMPORT_LIMIT} more.`,
        };
        throw new QuotaExceededError(messages[status.tier]);
    }
    return status;
}

// Called after every AI import call, even one that found nothing (the call still costs money).
// Uses a free credit if there's one left (counts the import), otherwise one from the balance.
async function recordImportUsage(userId, status) {
    if (status.freeRemaining <= 0) {
        await User.consumeCredit(userId);
    } else {
        await AiImportUsage.increment(userId);
    }
}

module.exports = { assertImportQuota, getImportQuotaStatus, recordImportUsage, GUEST_IMPORT_LIMIT, FREE_IMPORT_LIMIT };
