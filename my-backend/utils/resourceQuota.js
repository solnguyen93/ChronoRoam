const User = require('../models/User');
const { tierFor } = require('./accountTier');
const { QuotaExceededError } = require('../expressError');
const { TripMembership, PacklistMembership } = require('../models/Membership');

// Limits on how many trips and packing lists an account can have. Guests get 1 of each; users
// have no limit. A user limit of 3 is kept but switched off (USER_CAPS_ENABLED).
const USER_CAPS_ENABLED = false;

const LIMITS = {
    trip: { guest: 1, user: 3 },
    packlist: { guest: 1, user: 3 },
};

const MEMBERSHIP = { trip: TripMembership, packlist: PacklistMembership };

// The limit for this kind of account, or null for no limit.
function limitFor(tier, kind) {
    if (tier === 'user' && !USER_CAPS_ENABLED) return null;
    return LIMITS[kind][tier];
}

// How many trips (or packing lists) the user has, their limit, and how many are left (null = no limit).
async function getResourceQuotaStatus(userId, kind) {
    const user = await User.getById(userId);
    const tier = tierFor(user);
    const used = await MEMBERSHIP[kind].countForUser(userId);
    const limit = limitFor(tier, kind);
    if (limit === null) return { tier, used, limit: null, remaining: null };
    return { tier, used, limit, remaining: Math.max(0, limit - used) };
}

// Called before creating a trip or packing list: throws a 429 if the user is at their limit.
async function assertResourceQuota(userId, kind) {
    const status = await getResourceQuotaStatus(userId, kind);
    if (status.limit !== null && status.used >= status.limit) {
        const noun = kind === 'trip' ? 'trip' : 'packlist';
        const label = status.limit === 1 ? noun : `${noun}s`;
        const messages = {
            guest: USER_CAPS_ENABLED
                ? `Guests are limited to ${status.limit} ${label}. Sign up to get ${LIMITS[kind].user}.`
                : `Guests are limited to ${status.limit} ${label}. Sign up for free to get unlimited trips and packlists.`,
            user: `You've reached the limit of ${status.limit} ${label}.`,
        };
        throw new QuotaExceededError(messages[status.tier]);
    }
    return status;
}

module.exports = { assertResourceQuota, getResourceQuotaStatus, LIMITS, USER_CAPS_ENABLED };
