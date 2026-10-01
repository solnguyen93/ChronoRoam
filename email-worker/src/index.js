// Cloudflare email worker: receives every email sent to <username>@chronoroam.app and sends its
// text to the server (POST /webhooks/email-intake), which reads the booking with AI.
import PostalMime from 'postal-mime';

// A simple HTML -> text conversion for emails that have no plain-text version. Not a full HTML
// parser; the AI only needs readable text.
function htmlToText(html) {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // HTML comments (often large blocks only for Outlook).
        .replace(/<!--[\s\S]*?-->/g, '')
        // Hidden preview text (a div or span with display:none).
        .replace(/<(div|span)[^>]*display:\s*none[^>]*>.*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();
}

export default {
    async email(message, env, ctx) {
        // Every address at the domain comes here (see README.md). The part before the @ is the
        // username; the server looks up the account.
        const toAddress = message.to || '';
        const username = toAddress.split('@')[0];

        if (!username) {
            message.setReject('No recipient address to resolve a username from.');
            return;
        }

        // Read the raw email with postal-mime. Use its plain text, or the HTML turned into text.
        const rawBuffer = await new Response(message.raw).arrayBuffer();
        const parsed = await PostalMime.parse(rawBuffer);
        const emailText = (parsed.text && parsed.text.trim())
            || (parsed.html && htmlToText(parsed.html))
            || '';

        if (!emailText) {
            // No text (an empty forward, or a format that couldn't be read): accept it and do nothing.
            return;
        }

        let response;
        try {
            response = await fetch(`${env.BACKEND_WEBHOOK_URL}/webhooks/email-intake`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Secret': env.WEBHOOK_SHARED_SECRET,
                },
                body: JSON.stringify({
                    username,
                    emailText,
                    fromAddress: message.from,
                }),
            });
        } catch (err) {
            // The server couldn't be reached: log it (see `wrangler tail`) and accept the email, rather
            // than bouncing it back to the sender.
            console.error('email-intake: fetch to backend failed', err);
            return;
        }

        if (response.status === 404) {
            // No account with this username (probably a typo): bounce the email with the reason.
            const body = await response.json().catch(() => ({}));
            message.setReject(body.message || `No ChronoRoam user found for "${username}".`);
            return;
        }

        if (response.status === 400) {
            // The server couldn't use the email (usually too long, see aiTextLimits.js): bounce it
            // with the server's reason, so the sender can trim it or paste it in the app instead.
            const body = await response.json().catch(() => ({}));
            message.setReject(body.message || 'ChronoRoam could not process this email.');
            return;
        }

        if (!response.ok) {
            // Any other server error: log it and accept the email (it just won't show up for review).
            console.error('email-intake: backend rejected', response.status, await response.text().catch(() => ''));
        }
    },
};
