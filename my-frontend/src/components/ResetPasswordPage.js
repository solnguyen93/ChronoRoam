import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ChronoRoamApi from '../api';
import Wordmark from './Wordmark';
import PasswordInput from './PasswordInput';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// Minimum password length, checked here first; the server checks it too (my-backend/models/User.js).
const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [done]);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            await ChronoRoamApi.resetPassword(token, password);
            setDone(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
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
                        <h3>Set a new password</h3>

                        {done ? (
                            <>
                                <p className="modal-sub">Your password has been updated.</p>
                                <div className="modal-btns">
                                    <button className="confirm" onClick={() => navigate('/login')}>Sign in</button>
                                </div>
                            </>
                        ) : (
                            <form onSubmit={submit}>
                                <PasswordInput
                                    autoFocus
                                    placeholder="New password *"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <PasswordInput
                                    placeholder="Confirm new password *"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                                {error && <div className="modal-error">{error}</div>}
                                <div className="modal-btns">
                                    <button type="submit" className="confirm" disabled={busy || !password || !confirmPassword || !token}>Set password</button>
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

export default ResetPasswordPage;
