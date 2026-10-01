import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Wordmark from './Wordmark';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// The page the email-change link opens. It sends the link's token to the server right away, which
// saves the new email (see the server's User.verifyEmailChange).
function VerifyEmailChangePage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const { verifyEmailChange } = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [error, setError] = useState('');
    const ran = useRef(false);
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [status]);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        if (!token) {
            setStatus('error');
            setError('This verification link is missing its token.');
            return;
        }
        verifyEmailChange(token)
            .then(() => setStatus('success'))
            .catch((err) => {
                setStatus('error');
                setError(err.response?.data?.message || 'Something went wrong.');
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return (
        <div className="auth-page">
            <div className="v-scroll-wrap auth-page-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="auth-page-scroll-body" ref={scrollRef}>
                    <div className="modal-box">
                        <div className="auth-page-logo"><Wordmark /></div>

                        {status === 'loading' && <p className="modal-sub">Verifying…</p>}

                        {status === 'success' && (
                            <>
                                <h3>Email updated</h3>
                                <p className="modal-sub">Your new email address is confirmed and active.</p>
                                <div className="modal-btns">
                                    <button className="confirm" onClick={() => navigate('/home')}>Continue</button>
                                </div>
                            </>
                        )}

                        {status === 'error' && (
                            <>
                                <h3>Couldn't verify</h3>
                                <p className="modal-sub">{error}</p>
                                <div className="auth-page-links">
                                    <Link to="/home">Back to ChronoRoam</Link>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default VerifyEmailChangePage;
