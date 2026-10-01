// Sends the app's emails through a Gmail account (GMAIL_USER / GMAIL_APP_PASSWORD).
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// Password reset link.
async function sendResetEmail(email, token) {
    // The web app uses hash routing (App.js), so the page path goes after "#/".
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/reset-password?token=${token}`;
    // Logs Gmail's response. "Accepted" means Gmail took the message, not that it reached the inbox.
    const info = await transporter.sendMail({
        from: `"ChronoRoam" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Reset your Chronoroam password',
        text: `Reset your password: ${url}`,
    });
    console.log('sendResetEmail: accepted=%j rejected=%j response=%s messageId=%s', info.accepted, info.rejected, info.response, info.messageId);
}

// Verification link for signing up with a deleted account's email (see User.register). Nothing is
// saved until the link is clicked; clicking it creates the account and restores the leftover credits.
async function sendRestoreVerificationEmail(email, token) {
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/verify-restore?token=${token}`;
    const info = await transporter.sendMail({
        from: `"ChronoRoam" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Verify your ChronoRoam account',
        text: `ChronoRoam: Click this link to verify it's you and create your account; any credits you had will be restored: ${url}\n\nIf you didn't request this, you can safely ignore this email — nothing has been created yet.`,
    });
    console.log('sendRestoreVerificationEmail: accepted=%j rejected=%j response=%s messageId=%s', info.accepted, info.rejected, info.response, info.messageId);
}

// Verification link for changing an account's email (see User.updateProfile). The new email is
// only applied once this link is clicked.
async function sendEmailChangeVerificationEmail(email, token) {
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/verify-email-change?token=${token}`;
    const info = await transporter.sendMail({
        from: `"ChronoRoam" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Verify your new ChronoRoam email',
        text: `Confirm this is your new ChronoRoam email address: ${url}\n\nIf you didn't request this, you can safely ignore this email — your account's email hasn't changed yet.`,
    });
    console.log('sendEmailChangeVerificationEmail: accepted=%j rejected=%j response=%s messageId=%s', info.accepted, info.rejected, info.response, info.messageId);
}

// Contact form message, sent to our own Gmail inbox. Reply-To is the sender's address, so
// replying in Gmail goes straight to them.
async function sendContactEmail({ name, email, category, message }) {
    const info = await transporter.sendMail({
        from: `"ChronoRoam Contact Form" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        replyTo: email,
        subject: `[${category}] ${name}`,
        text: `From: ${name} <${email}>\nCategory: ${category}\n\n${message}`,
    });
    console.log('sendContactEmail: accepted=%j rejected=%j response=%s messageId=%s', info.accepted, info.rejected, info.response, info.messageId);
}

// Tells someone they were invited to a trip or packing list; they accept or decline on Home.
async function sendInviteEmail(email, fromName, title, kind) {
    const what = kind === 'trip' ? 'trip' : 'packlist';
    const info = await transporter.sendMail({
        from: `"ChronoRoam" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: `${fromName} invited you to a ${what} on ChronoRoam`,
        text: `${fromName} invited you to the ${what} "${title}" on ChronoRoam. Open the app to accept or decline: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/#/home`,
    });
    console.log('sendInviteEmail: accepted=%j rejected=%j response=%s messageId=%s', info.accepted, info.rejected, info.response, info.messageId);
}

module.exports = { sendResetEmail, sendRestoreVerificationEmail, sendEmailChangeVerificationEmail, sendContactEmail, sendInviteEmail };
