// Optional locks on Trip Tips' Weather/outlet sections and each day's weather once a user is out
// of credits — switched off: those features are free for everyone, and only AI imports use
// credits (see my-backend/utils/importQuota.js). The lock code is kept in place so it can be
// brought back later by flipping this to true.
export const CREDIT_LOCKS_ENABLED = false;

