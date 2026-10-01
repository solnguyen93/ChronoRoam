import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import ChronoRoamApi from '../api';
import TabSwitcher from './TabSwitcher';
import Wordmark from './Wordmark';
import Footer from './Footer';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import PasswordInput from './PasswordInput';
import { searchCities } from '../utils/geocode';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// Same minimum as the server (my-backend/models/User.js), which is the real check. Checking here
// too just shows the error without waiting for the server.
const MIN_PASSWORD_LENGTH = 8;

// The Sign In tab.
function SignInForm() {
    const { login, mergeGuestLogin, isGuest } = useAuth();
    const navigate = useNavigate();
    // The page the user was trying to open before being sent here (set by RequireAuth in App.js,
    // e.g. a shared trip link). Goes there after signing in, otherwise to Home.
    const from = useLocation().state?.from;
    // In local development only (not in built apps), fills in the test account's login. Not for
    // a guest, since a guest signing in moves their trips to that account.
    const prefillDev = process.env.NODE_ENV === 'development' && !isGuest;
    const [username, setUsername] = useState(prefillDev ? 'testuser1' : '');
    const [password, setPassword] = useState(prefillDev ? 'test1234' : '');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            // A guest signing in: mergeGuestLogin moves the guest's trips and packing lists to
            // the account, then signs in to it.
            if (isGuest) await mergeGuestLogin(username, password);
            else await login(username, password);
            navigate(from || '/home');
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <form onSubmit={submit}>
                <label className="field-label">Username<span className="required-mark">*</span></label>
                <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
                <label className="field-label">Password<span className="required-mark">*</span></label>
                <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-btns">
                    <button type="submit" className="confirm" disabled={busy || !username || !password}>Sign in</button>
                </div>
            </form>

            <div className="auth-page-links">
                <Link to="/forgot-password">Forgot password?</Link>
            </div>
        </>
    );
}

// The Create Account tab, including "Continue as guest".
function RegisterForm() {
    const { register, claimAccount, continueAsGuest, isGuest } = useAuth();
    const navigate = useNavigate();
    // Where to go when done (see SignInForm above).
    const from = useLocation().state?.from;
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [location, setLocation] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    // True after signing up with an email that was used before: no account is made yet, and the
    // form is replaced by a "check your email" message.
    const [verificationSent, setVerificationSent] = useState(false);
    // What the server says about the typed email: { taken } or { taken, restoreEligible }, or
    // null. Checked when the field loses focus, and cleared as soon as it's edited.
    const [emailStatus, setEmailStatus] = useState(null);
    const [emailChecking, setEmailChecking] = useState(false);
    // Same for the username: { taken }, or null.
    const [usernameStatus, setUsernameStatus] = useState(null);
    const [usernameChecking, setUsernameChecking] = useState(false);

    const checkEmail = async () => {
        if (!email.trim()) return;
        setEmailChecking(true);
        try {
            setEmailStatus(await ChronoRoamApi.checkEmail(email.trim()));
        } catch {
            // If the check fails, show nothing. The server checks again on submit.
            setEmailStatus(null);
        } finally {
            setEmailChecking(false);
        }
    };

    const checkUsername = async () => {
        if (!username.trim()) return;
        setUsernameChecking(true);
        try {
            setUsernameStatus(await ChronoRoamApi.checkUsername(username.trim()));
        } catch {
            setUsernameStatus(null);
        } finally {
            setUsernameChecking(false);
        }
    };

    // "Continue as guest": starts a guest session. Someone who's already a guest just goes back
    // (to where they came from, or Home).
    const asGuest = async () => {
        if (isGuest) {
            navigate(from || '/home');
            return;
        }
        setError('');
        setBusy(true);
        try {
            await continueAsGuest();
            navigate(from || '/home');
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

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
            // A guest creating an account: claimAccount turns the guest into the new account,
            // so their trips and packing lists stay.
            let result;
            if (isGuest) {
                try {
                    result = await claimAccount({ name, username, email, password, location });
                } catch (err) {
                    // If the guest no longer exists on the server (401), sign up as a new
                    // account instead.
                    if (err.response?.status !== 401) throw err;
                    result = await register(name, username, email, password, location);
                }
            } else {
                result = await register(name, username, email, password, location);
            }
            // The email was used before: nothing was created yet, and a verification link was
            // emailed (see VerifyRestorePage.js).
            if (result.pendingVerification) {
                setVerificationSent(true);
                return;
            }
            navigate(from || '/home');
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    if (verificationSent) {
        return (
            <>
                <p className="modal-sub">
                    We've sent a link to <strong>{email}</strong> to verify it's you. Click it to create your account; any credits you had will be restored.
                </p>
                <p className="modal-sub">Your account isn't created until you click the link.</p>
                <div className="modal-btns">
                    <button type="button" className="cancel" onClick={() => setVerificationSent(false)}>Back</button>
                </div>
            </>
        );
    }

    return (
        <>
            <form onSubmit={submit}>
                <label className="field-label">Name<span className="required-mark">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
                <label className="field-label">Username<span className="required-mark">*</span></label>
                <input
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setUsernameStatus(null); }}
                    onBlur={checkUsername}
                />
                {usernameChecking && <p className="auth-email-status">Checking…</p>}
                {!usernameChecking && usernameStatus?.taken && (
                    <p className="auth-email-status auth-email-status-warn">This username is already taken — try a different one.</p>
                )}
                <label className="field-label">Email<span className="required-mark">*</span></label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailStatus(null); }}
                    onBlur={checkEmail}
                />
                {emailChecking && <p className="auth-email-status">Checking…</p>}
                {!emailChecking && emailStatus?.taken && (
                    <p className="auth-email-status auth-email-status-warn">This email is already registered — sign in instead, or use a different one.</p>
                )}
                {!emailChecking && emailStatus?.restoreEligible && (
                    <p className="auth-email-status">This email was used before. After you click Create, we'll email you a link to verify it's you. Any credits you had will be restored; no new free credits are added.</p>
                )}
                <label className="field-label">Home location</label>
                <PlaceAutocompleteInput placeholder="City, State/Country" value={location} onChange={(e) => setLocation(e.target.value)} searchFn={searchCities} />
                <label className="field-label">Password<span className="required-mark">*</span></label>
                <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <label className="field-label">Confirm password<span className="required-mark">*</span></label>
                <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />
                {error && <div className="modal-error">{error}</div>}
                <p className="auth-terms-note">
                    By creating an account, you agree to our <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms of Service</Link>.
                </p>
                <div className="modal-btns">
                    <button
                        type="submit"
                        className="confirm"
                        disabled={busy || !name || !username || !email || !password || !confirmPassword}
                    >
                        Create
                    </button>
                </div>
            </form>

            <p className="auth-guest-note">Don't have an account?</p>
            <button type="button" className="auth-guest-btn" onClick={asGuest} disabled={busy}>Continue as guest</button>
            <p className="auth-guest-note">
                Trips created as a guest are only accessible on this device, unless you create an account later.
            </p>
        </>
    );
}

// The sign-in / create-account page. /login and /register both open it (App.js), on the
// matching tab. Switching tabs doesn't change the URL.
function AuthPage() {
    const location = useLocation();
    const [mode, setMode] = useState(location.pathname === '/register' ? 'register' : 'signin');
    // Up/down arrow buttons that scroll the page when it's taller than the window.
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [mode]);

    return (
        <div className="auth-page">
            <div className="v-scroll-wrap auth-page-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="auth-page-scroll-body" ref={scrollRef}>
                    <div className="modal-box">
                        <div className="auth-page-logo"><Wordmark /></div>
                        <TabSwitcher
                            tabs={[{ key: 'signin', label: 'Sign In' }, { key: 'register', label: 'Create Account' }]}
                            activeKey={mode}
                            onSelect={setMode}
                        />
                        <div className="auth-tab-content">
                            {mode === 'signin' ? <SignInForm /> : <RegisterForm />}
                        </div>
                    </div>
                    <Footer />
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default AuthPage;
