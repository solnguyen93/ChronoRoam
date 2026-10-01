// /auth routes: sign up, sign in, guests, restores, password reset and account settings.
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireUser } = require('../middleware/auth');
const router = express.Router();

// A login token holding the user's basic details (no expiry).
function makeToken(user) {
    return jwt.sign(
        { user: { id: user.id, name: user.name, username: user.username, email: user.email, tempUnit: user.tempUnit, location: user.location, passportCountry: user.passportCountry } },
        process.env.JWT_SECRET,
    );
}

// Checks an email while typing on the sign-up form (see User.checkEmailStatus).
router.get('/check-email', async (req, res) => {
    try {
        res.json(await User.checkEmailStatus(req.query.email));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Checks a username while typing on the sign-up form.
router.get('/check-username', async (req, res) => {
    try {
        res.json(await User.checkUsernameStatus(req.query.username));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Signs up. Returns the user and a token (201), or 202 { pendingVerification } for a deleted
// account's email, where a verification link was emailed and nothing was created yet.
router.post('/register', async (req, res) => {
    try {
        const { name, username, email, password, location, deviceId } = req.body;
        const result = await User.register(name, username, email, password, location, deviceId);
        if (result.pendingVerification) return res.status(202).json(result);
        res.status(201).json({ user: result, token: makeToken(result) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Creates a guest account so a visitor can start without signing up (see User.createGuest).
router.post('/guest', async (req, res) => {
    try {
        const user = await User.createGuest(req.body.deviceId);
        res.status(201).json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Turns the signed-in guest into a real account (see User.claimAccount). Same responses as /register.
router.put('/claim', async (req, res) => {
    try {
        const currentUser = requireUser(res);
        const result = await User.claimAccount(currentUser.id, req.body);
        if (result.pendingVerification) return res.status(202).json(result);
        res.json({ user: result, token: makeToken(result) }); // new token with the new username/email
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// The verification link for a deleted account's email was clicked: creates the account, restores
// its leftover credits, and signs the user in (see User.verifyRestoreRegistration).
router.post('/verify-restore', async (req, res) => {
    try {
        const user = await User.verifyRestoreRegistration(req.body.token);
        res.json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Signs in with username and password.
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.login(username, password);
        res.json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Signs in to the demo account for the portfolio's live demo (see User.demoLogin).
router.post('/demo-login', async (req, res) => {
    try {
        const user = await User.demoLogin();
        res.json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// A signed-in guest signing in to an existing account: moves the guest's trips and packing lists
// onto it (see User.mergeGuestIntoAccount).
router.put('/merge-guest', async (req, res) => {
    try {
        const currentUser = requireUser(res);
        const { username, password } = req.body;
        const user = await User.mergeGuestIntoAccount(currentUser.id, username, password);
        res.json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Emails a password reset link. The reply is the same whether or not the email has an account.
router.post('/forgot-password', async (req, res) => {
    try {
        await User.requestPasswordReset(req.body.email);
        res.json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Sets a new password from a reset link.
router.post('/reset-password', async (req, res) => {
    try {
        await User.resetPassword(req.body.token, req.body.password);
        res.json({ message: 'Password updated. You can now sign in.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Saves Account settings (see User.updateProfile) and returns a new token.
router.put('/profile', async (req, res) => {
    try {
        const currentUser = requireUser(res);
        const user = await User.updateProfile(currentUser.id, req.body);
        res.json({ user, token: makeToken(user) });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// The email-change link was clicked: saves the new email (see User.verifyEmailChange). No login
// needed; the link's token is the proof.
router.post('/verify-email-change', async (req, res) => {
    try {
        const user = await User.verifyEmailChange(req.body.token);
        res.json({ user, token: makeToken(user) }); // new token with the new email
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

// Deletes the signed-in account (see User.deleteAccount).
router.delete('/profile', async (req, res) => {
    try {
        const currentUser = requireUser(res);
        await User.deleteAccount(currentUser.id, req.body.currentPassword);
        res.json({ deleted: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

module.exports = router;
