const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const bcrypt = require('bcrypt');
const { sendResetEmail, sendRestoreVerificationEmail, sendEmailChangeVerificationEmail } = require('../mailer');
const { getTempUnitFromLocation } = require('../utils/tempUnit');
const { NotFoundError, BadRequestError, UnauthorizedError } = require('../expressError');
const SpentTrial = require('./SpentTrial');
const Packlist = require('./Packlist');
const { PacklistMembership } = require('./Membership');
const { PURCHASE_CREDIT_GRANT } = require('../utils/creditGrants');

// Users: sign-up, sign-in, guests, account settings, credits and account deletion.

// Restore links (signing up with a deleted account's email) expire after 30 minutes.
const RESTORE_TOKEN_EXPIRY = '30m';
const RESTORE_TOKEN_PURPOSE = 'restore-verification';
const EMAIL_CHANGE_TOKEN_PURPOSE = 'email-change-verification';

// A created_at date older than any real account. Setting an account's created_at to this means
// "no free credits" (see utils/importQuota.js's freeImportsAlreadySpent).
const TRIAL_ALREADY_SPENT_DATE = new Date('2000-01-01');

// The "Sample Packlist" copied into every new account (see _seedSamplePacklist).
const DEFAULT_SAMPLE_PACKLIST_PUBLIC_ID = 'BCDUFLSXodBQ';

// How slow bcrypt makes each password hash (higher = harder to crack).
const BCRYPT_WORK_FACTOR = 12;
// Columns returned for a user. hasPurchased = has bought credits at least once.
const USER_FIELDS = `id, name, username, email, temp_unit AS "tempUnit", location, passport_country AS "passportCountry", (purchase_platform IS NOT NULL) AS "hasPurchased", purchase_platform AS "purchasePlatform", import_credits AS "importCredits", created_at AS "createdAt"`;
// Minimum password length. The web app checks it too (AuthPage.js, AccountModal.js), but this is
// the check that can't be skipped.
const MIN_PASSWORD_LENGTH = 8;

// Throws a 400 if the password is too short.
function checkPasswordLength(password) {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
}

class User {
    // Checks an email while someone types it on the sign-up form: { taken } if an account already
    // uses it, { restoreEligible } if it belonged to a deleted account (sign-up will send a
    // verification link). Changes nothing.
    static async checkEmailStatus(email) {
        if (!email) return {};
        if ((await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0]) {
            return { taken: true };
        }
        if (await SpentTrial.isSpent('email', email)) return { taken: false, restoreEligible: true };
        return { taken: false };
    }

    // Checks a username while someone types it: { taken } (ignoring case). Changes nothing.
    static async checkUsernameStatus(username) {
        if (!username) return {};
        const taken = Boolean((await pool.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`, [username])).rows[0]);
        return { taken };
    }

    // A user by username (ignoring case), or null. Used to find whose forwarding address an email
    // was sent to (routes/webhookRoutes.js).
    static async getByUsername(username) {
        const result = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
        return result.rows[0] || null;
    }

    // A user by id, read fresh from the database (credits can change at any time, e.g. a purchase
    // arriving from Stripe), or null.
    static async getById(userId) {
        const result = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [userId]);
        return result.rows[0] || null;
    }

    // Gives a new account a copy of the sample packing list, named "Sample Packlist". The source is
    // SAMPLE_PACKLIST_PUBLIC_ID, or DEFAULT_SAMPLE_PACKLIST_PUBLIC_ID when that isn't set (with a
    // warning). The source list has no members on purpose — don't delete it. A failure is only
    // logged, so it never stops an account from being created.
    static async _seedSamplePacklist(userId) {
        const templateId = process.env.SAMPLE_PACKLIST_PUBLIC_ID || DEFAULT_SAMPLE_PACKLIST_PUBLIC_ID;
        if (!process.env.SAMPLE_PACKLIST_PUBLIC_ID) {
            console.warn(`SAMPLE_PACKLIST_PUBLIC_ID not set; using default template ${DEFAULT_SAMPLE_PACKLIST_PUBLIC_ID}`);
        }
        try {
            const copy = await Packlist.duplicate(templateId, pool, 'Sample Packlist');
            await PacklistMembership.ensureMember(copy.id, userId);
        } catch (err) {
            console.error('Failed to seed sample packlist for user', userId, err);
        }
    }

    // Adds credits after a purchase (Stripe or Apple) or a restore, and records the first
    // purchase's date and platform (COALESCE keeps them once set).
    static async grantPurchase(userId, platform, credits) {
        await pool.query(
            `UPDATE users SET first_purchased_at = COALESCE(first_purchased_at, NOW()),
                              purchase_platform = COALESCE(purchase_platform, $2),
                              import_credits = import_credits + $3
             WHERE id = $1`,
            [userId, platform, credits],
        );
    }

    // Takes one credit from the balance after an import that used it (see utils/importQuota.js's
    // recordImportUsage). Never goes below 0.
    static async consumeCredit(userId) {
        await pool.query(`UPDATE users SET import_credits = GREATEST(import_credits - 1, 0) WHERE id = $1`, [userId]);
    }

    // Creates an account and returns the user — unless the email belonged to a deleted account,
    // in which case nothing is created yet: a verification link is emailed and this returns
    // { pendingVerification: true }.
    static async register(name, username, email, password, location, deviceId) {
        if (!name || !username || !email || !password) {
            throw new BadRequestError('Name, username, email, and password are all required.');
        }
        checkPasswordLength(password);
        if ((await pool.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`, [username])).rows[0]) {
            throw new BadRequestError('Username is already taken.');
        }
        if ((await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0]) {
            throw new BadRequestError('Email is already registered.');
        }

        // An email from a deleted account: send a verification link instead of creating the
        // account, so only the inbox's owner can take the email and its leftover credits (see
        // verifyRestoreRegistration).
        if (await SpentTrial.isSpent('email', email)) {
            await User._sendRestoreVerification({ mode: 'register', name, username, email, password, location, deviceId });
            return { pendingVerification: true };
        }

        // A new email gets the full free credits. The device isn't checked here (only for guests),
        // so someone who deleted a test account can sign up with their real email on the same phone.
        const hashed = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
        const result = await pool.query(
            `INSERT INTO users (name, username, email, password, location, device_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${USER_FIELDS}`,
            [name, username, email, hashed, location || null, deviceId || null, new Date()],
        );
        const user = result.rows[0];
        await User._seedSamplePacklist(user.id);
        return user;
    }

    // Emails the verification link for a deleted account's email (used by register and
    // claimAccount). The link's token holds everything needed to create the account later,
    // with the password already hashed. Saves nothing to the database.
    static async _sendRestoreVerification({ mode, userId, name, username, email, password, location, deviceId }) {
        const passwordHash = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
        const token = jwt.sign(
            { purpose: RESTORE_TOKEN_PURPOSE, mode, userId, name, username, email, passwordHash, location, deviceId },
            process.env.JWT_SECRET,
            { expiresIn: RESTORE_TOKEN_EXPIRY },
        );
        await sendRestoreVerificationEmail(email, token);
    }

    // Runs when the verification link is clicked (POST /verify-restore). Creates the account
    // ('register'), or turns the guest into a real account ('claim'), then restores the leftover
    // credits. Checks again that the username and email are still free, since time has passed.
    static async verifyRestoreRegistration(token) {
        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            throw new BadRequestError('This verification link is invalid or has expired.');
        }
        if (payload.purpose !== RESTORE_TOKEN_PURPOSE) throw new BadRequestError('This verification link is invalid or has expired.');
        const { mode, userId, name, username, email, passwordHash, location, deviceId } = payload;

        let user;
        if (mode === 'register') {
            if ((await pool.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)`, [username])).rows[0]) {
                throw new BadRequestError('Username is already taken.');
            }
            if ((await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email])).rows[0]) {
                throw new BadRequestError('Email is already registered.');
            }
            // Backdated so there are no new free credits — only what the old account had left
            // comes back (see _restoreCredits below).
            const result = await pool.query(
                `INSERT INTO users (name, username, email, password, location, device_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${USER_FIELDS}`,
                [name, username, email, passwordHash, location || null, deviceId || null, TRIAL_ALREADY_SPENT_DATE],
            );
            user = result.rows[0];
            await User._seedSamplePacklist(user.id);
        } else {
            if ((await pool.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`, [username, userId])).rows[0]) {
                throw new BadRequestError('Username is already taken.');
            }
            if ((await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [email, userId])).rows[0]) {
                throw new BadRequestError('Email is already registered.');
            }
            const result = await pool.query(
                `UPDATE users SET name = COALESCE($1, name), username = $2, email = $3, password = $4, location = COALESCE($5, location),
                 device_id = COALESCE(device_id, $7), created_at = LEAST(created_at, $8) WHERE id = $6 RETURNING ${USER_FIELDS}`,
                [name || null, username, email, passwordHash, location || null, userId, deviceId || null, TRIAL_ALREADY_SPENT_DATE],
            );
            if (!result.rows[0]) throw new NotFoundError('User not found');
            user = result.rows[0];
        }

        await User._restoreCredits(user.id, email);
        return User.getById(user.id);
    }

    // Adds the credits a deleted account with this email had left (free and purchased) to this
    // account's balance, once (SpentTrial.takeCreditsLeft). If that account had bought credits,
    // this one gets the same purchase_platform.
    static async _restoreCredits(userId, email) {
        const platform = await SpentTrial.purchasePlatformFor('email', email);
        const credits = await SpentTrial.takeCreditsLeft(email);
        if (platform) await User.grantPurchase(userId, platform, credits);
        else if (credits > 0) await pool.query(`UPDATE users SET import_credits = import_credits + $2 WHERE id = $1`, [userId, credits]);
    }

    // Creates a guest account (named "Guest", no username or password) so a visitor can start
    // right away. A device that belonged to a deleted account gets no guest credits (backdated
    // created_at). Returns the user like register and login do.
    static async createGuest(deviceId) {
        const spent = await SpentTrial.isSpent('device', deviceId);
        const result = await pool.query(
            `INSERT INTO users (name, device_id, created_at) VALUES ('Guest', $1, $2) RETURNING ${USER_FIELDS}`,
            [deviceId || null, spent ? TRIAL_ALREADY_SPENT_DATE : new Date()],
        );
        const user = result.rows[0];
        await User._seedSamplePacklist(user.id);
        return user;
    }

    // Turns a guest into a real account by adding a username, email and password to the same
    // user row, so their trips and packing lists stay. Returns the user, or
    // { pendingVerification: true } for a deleted account's email, like register.
    static async claimAccount(userId, { name, username, email, password, location, deviceId }) {
        if (!username || !email || !password) throw new BadRequestError('Username, email, and password are all required.');
        checkPasswordLength(password);
        if ((await pool.query(`SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`, [username, userId])).rows[0]) {
            throw new BadRequestError('Username is already taken.');
        }
        if ((await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [email, userId])).rows[0]) {
            throw new BadRequestError('Email is already registered.');
        }

        // A deleted account's email: send a verification link and leave the guest as it is until
        // it's clicked (see verifyRestoreRegistration's 'claim' mode).
        if (await SpentTrial.isSpent('email', email)) {
            await User._sendRestoreVerification({ mode: 'claim', userId, name, username, email, password, location, deviceId });
            return { pendingVerification: true };
        }

        const hashed = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
        const result = await pool.query(
            `UPDATE users SET name = COALESCE($1, name), username = $2, email = $3, password = $4, location = COALESCE($5, location),
             device_id = COALESCE(device_id, $7), created_at = NOW()
             WHERE id = $6 RETURNING ${USER_FIELDS}`,
            [name || null, username, email, hashed, location || null, userId, deviceId || null],
        );
        if (!result.rows[0]) throw new NotFoundError('User not found');
        const user = result.rows[0];
        // Start the new user at the full free credits, whatever happened as a guest: clear the
        // guest's import count (created_at was reset to now above).
        await pool.query(`DELETE FROM ai_import_usage WHERE user_id = $1`, [userId]);
        return user;
    }

    // Signs in with username (ignoring case) and password. Returns the user, or throws a 401.
    static async login(username, password) {
        const result = await pool.query(`SELECT ${USER_FIELDS}, password FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
        const user = result.rows[0];
        // Guests have no password, so they can never sign in this way.
        if (user && user.password && (await bcrypt.compare(password, user.password))) {
            delete user.password;
            return user;
        }
        throw new UnauthorizedError('Invalid username/password');
    }

    // Signs in to the demo account (DEMO_USERNAME) with no password, for the portfolio's live
    // demo. 404 if DEMO_USERNAME isn't set. The web app only calls this when nobody is signed in
    // yet (DemoPage.js).
    static async demoLogin() {
        const username = process.env.DEMO_USERNAME;
        if (!username) throw new NotFoundError('Demo login is not configured.');
        const result = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
        const user = result.rows[0];
        if (!user) throw new NotFoundError('Demo account not found.');
        return user;
    }

    // A guest signing in to an existing account: checks the account's password, moves the guest's
    // trips and packing lists onto that account, then deletes the guest. If both already share a
    // trip or packing list, the guest's copy of that membership is just dropped. One transaction.
    static async mergeGuestIntoAccount(guestUserId, username, password) {
        const guestCheck = await pool.query(`SELECT username FROM users WHERE id = $1`, [guestUserId]);
        if (!guestCheck.rows[0]) throw new NotFoundError('User not found');
        if (guestCheck.rows[0].username !== null) throw new BadRequestError('Only a guest session can switch into an existing account this way.');

        const target = await User.login(username, password); // throws UnauthorizedError if wrong

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const table of ['trip_members', 'packlist_members']) {
                const fk = table === 'trip_members' ? 'trip_id' : 'packlist_id';
                // Drop the guest's memberships the account already has, then move the rest over.
                await client.query(
                    `DELETE FROM ${table} WHERE user_id = $1
                     AND ${fk} IN (SELECT ${fk} FROM ${table} WHERE user_id = $2)`,
                    [guestUserId, target.id],
                );
                await client.query(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [target.id, guestUserId]);
            }
            // The guest's packing list links on trips, the same way: drop the ones the account already
            // has, then move the rest over.
            await client.query(
                `DELETE FROM trip_packlists g WHERE g.user_id = $1 AND EXISTS (
                     SELECT 1 FROM trip_packlists a
                     WHERE a.user_id = $2 AND a.trip_id = g.trip_id AND a.packlist_id = g.packlist_id)`,
                [guestUserId, target.id],
            );
            await client.query(`UPDATE trip_packlists SET user_id = $1 WHERE user_id = $2`, [target.id, guestUserId]);
            await client.query(`DELETE FROM users WHERE id = $1`, [guestUserId]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return target;
    }

    // Saves Account settings. A new password needs the current one. A new email isn't saved here:
    // a verification link is emailed to it (verifyEmailChange applies it), and the result has
    // emailChangePending. Everything else is saved right away.
    static async updateProfile(userId, { name, email, currentPassword, password, tempUnit, location, passportCountry }) {
        // Name and email can't be blank. (Location, passport and units are optional: leaving them
        // out keeps the current value.)
        if (name != null && !name.trim()) throw new BadRequestError('Name is required.');
        if (email != null && !email.trim()) throw new BadRequestError('Email is required.');
        if (password) {
            checkPasswordLength(password);
            const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [userId]);
            if (!result.rows[0]) throw new NotFoundError('User not found');
            const matches = result.rows[0].password && (await bcrypt.compare(currentPassword || '', result.rows[0].password));
            if (!matches) throw new BadRequestError('Current password is incorrect.');
        }
        if (tempUnit && tempUnit !== 'F' && tempUnit !== 'C') {
            throw new BadRequestError("Temperature unit must be 'F' or 'C'.");
        }

        // A changed email: make sure no one else has it, then email the verification link.
        let emailChangePending = false;
        const currentUser = await pool.query(`SELECT email AS "currentEmail" FROM users WHERE id = $1`, [userId]);
        if (!currentUser.rows[0]) throw new NotFoundError('User not found');
        if (email && email !== currentUser.rows[0].currentEmail) {
            if ((await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [email, userId])).rows[0]) {
                throw new BadRequestError('Email is already registered.');
            }
            const token = jwt.sign(
                { purpose: EMAIL_CHANGE_TOKEN_PURPOSE, userId, newEmail: email },
                process.env.JWT_SECRET,
                { expiresIn: RESTORE_TOKEN_EXPIRY },
            );
            await sendEmailChangeVerificationEmail(email, token);
            emailChangePending = true;
        }

        // Temperature units: picking °F/°C sets it and stops automatic changes (temp_unit_auto =
        // false). Until the user has picked one, saving a new home location sets the unit from that
        // location.
        let resolvedTempUnit = tempUnit || null;
        let resolvedTempUnitAuto = null; // null = COALESCE leaves the existing value alone
        if (tempUnit) {
            resolvedTempUnitAuto = false;
        } else if (location) {
            const current = await pool.query(`SELECT temp_unit_auto AS "tempUnitAuto" FROM users WHERE id = $1`, [userId]);
            if (!current.rows[0]) throw new NotFoundError('User not found');
            if (current.rows[0].tempUnitAuto) resolvedTempUnit = getTempUnitFromLocation(location);
        }

        const hashed = password ? await bcrypt.hash(password, BCRYPT_WORK_FACTOR) : null;
        const result = await pool.query(
            `UPDATE users SET name = COALESCE($1, name), password = COALESCE($2, password),
                    temp_unit = COALESCE($3, temp_unit), location = COALESCE($4, location),
                    temp_unit_auto = COALESCE($5, temp_unit_auto),
                    passport_country = COALESCE($7, passport_country)
             WHERE id = $6 RETURNING ${USER_FIELDS}`,
            [name || null, hashed, resolvedTempUnit, location || null, resolvedTempUnitAuto, userId, passportCountry || null],
        );
        if (!result.rows[0]) throw new NotFoundError('User not found');
        const user = result.rows[0];
        if (emailChangePending) user.emailChangePending = true;
        return user;
    }

    // Runs when the email-change link is clicked: checks the new email is still free, then saves
    // it. The old email is recorded in spent_trials, so a new account using it later gets no new
    // free credits. If the new email belonged to a deleted account, this account loses its own
    // free credits (created_at backdated) and gets that account's leftover credits instead.
    static async verifyEmailChange(token) {
        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            throw new BadRequestError('This verification link is invalid or has expired.');
        }
        if (payload.purpose !== EMAIL_CHANGE_TOKEN_PURPOSE) throw new BadRequestError('This verification link is invalid or has expired.');
        const { userId, newEmail } = payload;

        if ((await pool.query(`SELECT 1 FROM users WHERE email = $1 AND id != $2`, [newEmail, userId])).rows[0]) {
            throw new BadRequestError('Email is already registered.');
        }
        const current = await pool.query(`SELECT email AS "oldEmail" FROM users WHERE id = $1`, [userId]);
        if (!current.rows[0]) throw new NotFoundError('User not found');
        const { oldEmail } = current.rows[0];
        if (oldEmail && oldEmail !== newEmail) {
            // Recorded with no purchase and no leftover credits: the account still exists (with its
            // credits) under the new email, so nothing should be restorable from the old one.
            await SpentTrial.record('email', oldEmail, pool, false, null);
        }

        const spentNewEmail = await SpentTrial.isSpent('email', newEmail);

        const result = await pool.query(
            `UPDATE users SET email = $1, created_at = CASE WHEN $3 THEN LEAST(created_at, $4) ELSE created_at END
             WHERE id = $2 RETURNING ${USER_FIELDS}`,
            [newEmail, userId, spentNewEmail, TRIAL_ALREADY_SPENT_DATE],
        );
        if (!result.rows[0]) throw new NotFoundError('User not found');
        if (!spentNewEmail) return result.rows[0];
        await User._restoreCredits(userId, newEmail);
        return User.getById(userId);
    }

    // Deletes an account for good (needs the password; guests have none, so they skip the check).
    // Trips and packing lists shared with others stay for them; ones only this user had are
    // deleted. The email and device ID are recorded in spent_trials first, with the credits left,
    // so signing up again gives those back instead of new free credits.
    static async deleteAccount(userId, currentPassword) {
        const result = await pool.query(`SELECT password, email, device_id AS "deviceId", purchase_platform AS "purchasePlatform", import_credits AS "importCredits" FROM users WHERE id = $1`, [userId]);
        if (!result.rows[0]) throw new NotFoundError('User not found');
        const { password: hash, email, deviceId, purchasePlatform } = result.rows[0];
        if (hash) {
            const matches = await bcrypt.compare(currentPassword || '', hash);
            if (!matches) throw new BadRequestError('Current password is incorrect.');
        }

        // Credits left: unused free credits plus the balance. (importQuota is required here rather
        // than at the top because it requires this file too.)
        const { getImportQuotaStatus } = require('../utils/importQuota');
        const creditsLeft = (await getImportQuotaStatus(userId)).remaining;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Record the email (with whether it bought credits, and the credits left) and the device.
            // 'promo' (credits from an old free giveaway) doesn't count as a purchase.
            const realPurchase = Boolean(purchasePlatform) && purchasePlatform !== 'promo';
            await SpentTrial.record('email', email, client, realPurchase, realPurchase ? purchasePlatform : null, creditsLeft);
            await SpentTrial.record('device', deviceId, client);
            // (The username isn't recorded: anyone can use it again right away.)
            // Delete trips and packing lists where this user is the only member.
            await client.query(
                `DELETE FROM trips WHERE id IN (
                    SELECT tm.trip_id FROM trip_members tm
                    WHERE tm.user_id = $1
                    AND (SELECT COUNT(*) FROM trip_members tm2 WHERE tm2.trip_id = tm.trip_id) = 1
                )`,
                [userId],
            );
            await client.query(
                `DELETE FROM packlists WHERE id IN (
                    SELECT pm.packlist_id FROM packlist_members pm
                    WHERE pm.user_id = $1
                    AND (SELECT COUNT(*) FROM packlist_members pm2 WHERE pm2.packlist_id = pm.packlist_id) = 1
                )`,
                [userId],
            );
            // Delete the user; the database removes their remaining memberships with it.
            await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Emails a password reset link (valid 30 minutes). Does nothing for an unknown email, so the
    // response never reveals whether an email has an account.
    static async requestPasswordReset(email) {
        const result = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (!result.rows[0]) return;
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 30 * 60 * 1000);
        await pool.query(`UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`, [token, expires, result.rows[0].id]);
        await sendResetEmail(email, token);
    }

    // Sets a new password from a valid reset link, then clears the link.
    static async resetPassword(token, password) {
        const result = await pool.query(`SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`, [token]);
        if (!result.rows[0]) throw new BadRequestError('Reset link is invalid or has expired.');
        checkPasswordLength(password);
        const hashed = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);
        await pool.query(`UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`, [hashed, result.rows[0].id]);
    }
}

module.exports = User;
