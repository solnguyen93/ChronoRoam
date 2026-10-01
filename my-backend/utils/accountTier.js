// The kind of account: 'guest' (no username yet) or 'user'. Buying credits doesn't change it.
// Used by importQuota.js and resourceQuota.js.
function tierFor(user) {
    if (!user?.username) return 'guest';
    return 'user';
}

module.exports = { tierFor };
