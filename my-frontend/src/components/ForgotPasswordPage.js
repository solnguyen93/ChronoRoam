import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ChronoRoamApi from '../api';
import Wordmark from './Wordmark';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [sent]);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await ChronoRoamApi.forgotPassword(email);
        } finally {
            // Same message whether or not the email has an account, so it can't be used to check emails.
            setSent(true);
            setBusy(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="v-scroll-wrap auth-page-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="auth-page-scroll-body" ref={scrollRef}>
                    <div className="modal-box">
                        <div className="auth-page-logo"><Wordmark /></div>
                        <h3>Reset your password</h3>

                        {sent ? (
                            <p className="modal-sub">If that email exists, a reset link has been sent. Check your inbox.</p>
                        ) : (
                            <form onSubmit={submit}>
                                <p className="modal-sub">Enter the email on your account and we'll send you a reset link.</p>
                                <input
                                    autoFocus
                                    type="email"
                                    placeholder="Email *"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <div className="modal-btns">
                                    <button type="submit" className="confirm" disabled={busy || !email}>Send reset link</button>
                                </div>
                            </form>
                        )}

                        <div className="auth-page-links">
                            <Link to="/login">Back to sign in</Link>
                        </div>
                    </div>
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default ForgotPasswordPage;
