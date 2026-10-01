// Login token handling for every request.
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { UnauthorizedError } = require('../expressError');

// Reads the "Authorization: Bearer <token>" header. If the token is valid and its user still
// exists, puts the token's contents on res.locals (so res.locals.user is the signed-in user).
// Never rejects a request itself — routes that need a login call requireUser below.
//
// The user check matters for deleted accounts: their old token is otherwise still valid, and
// would fail later with a database error instead of a clean 401 (which makes the app sign out).
async function authenticateJWT(req, res, next) {
    try {
        const authHeader = req.headers && req.headers.authorization;
        if (authHeader) {
            const token = authHeader.replace(/^[Bb]earer /, '').trim();
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const result = await pool.query('SELECT 1 FROM users WHERE id = $1', [payload.user.id]);
            if (result.rows[0]) res.locals = payload;
        }
    } catch {
        // Invalid or expired token: leave res.locals.user unset.
    }
    return next();
}

// Called at the start of a route that needs a login. Returns the signed-in user, or throws a 401.
function requireUser(res) {
    if (!res.locals.user) throw new UnauthorizedError();
    return res.locals.user;
}

module.exports = { authenticateJWT, requireUser };
