import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Wordmark from './Wordmark';

// The /demo page, used by the portfolio's live demo. If nobody is signed in on this device, signs
// in to the demo account (see the server's User.demoLogin); if someone already is, leaves them
// signed in. Then opens Home.
function DemoPage() {
    const { user, demoLogin } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        if (user) {
            navigate('/', { replace: true });
            return;
        }
        demoLogin()
            .then(() => navigate('/', { replace: true }))
            .catch((err) => setError(err.response?.data?.message || 'Something went wrong.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="auth-page">
            <div className="modal-box">
                <div className="auth-page-logo"><Wordmark /></div>
                {error ? (
                    <>
                        <h3>Couldn't load demo</h3>
                        <p className="modal-sub">{error}</p>
                        <div className="auth-page-links">
                            <Link to="/login">Back to sign in</Link>
                        </div>
                    </>
                ) : (
                    <p className="modal-sub">Loading demo…</p>
                )}
            </div>
        </div>
    );
}

export default DemoPage;
