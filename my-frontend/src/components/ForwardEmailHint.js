import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { EMAIL_IMPORT_ENABLED } from '../api';
import CopyIcon from './CopyIcon';
import LockIcon from './LockIcon';

// On the booking email paste screen: the user's forwarding address (<username>@chronoroam.app)
// with a copy button. Any kind of booking can be forwarded.
function ForwardEmailHint() {
    const { user, isGuest } = useAuth();
    const [copied, setCopied] = useState(false);

    if (!EMAIL_IMPORT_ENABLED) return null;

    // Guests have no username, so no forwarding address: show it locked, with a link to sign up.
    // (Pasting still works for guests.)
    if (isGuest) {
        return (
            <p className="modal-sub forward-email-hint">
                <LockIcon width={13} height={13} /> Forwarding needs an account — <Link to="/register">create an account</Link> to get your own address
            </p>
        );
    }

    if (!user?.username) return null;
    const address = `${user.username}@chronoroam.app`;

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Copying isn't allowed here; the address can still be selected by hand.
        }
    }

    return (
        <p className="modal-sub forward-email-hint">
            Or forward it to
            <span className="forward-email-bubble">
                {address}
                <button
                    type="button"
                    className="copy-email-btn"
                    onClick={handleCopy}
                    aria-label="Copy forwarding address"
                    title={copied ? 'Copied!' : 'Copy email address'}
                >
                    <CopyIcon copied={copied} />
                </button>
            </span>
            {' '}(also 1 credit per email)
        </p>
    );
}

export default ForwardEmailHint;
