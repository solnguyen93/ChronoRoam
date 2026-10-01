import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import TabSwitcher from './TabSwitcher';
import ConfirmModal from './ConfirmModal';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import PasswordInput from './PasswordInput';
import { searchCities } from '../utils/geocode';
import { getTextScaleKey, setTextScaleKey } from '../utils/textScale';
import { useBillingStatus } from '../hooks/useBillingStatus';
import PurchaseModal from './PurchaseModal';

// Same minimum as the server (my-backend/models/User.js). Checking here just shows the error
// sooner.
const MIN_PASSWORD_LENGTH = 8;
// How long "Saved." stays on screen.
const SAVED_MSG_MS = 5000;

// The Account popup, opened from the ⋮ menu's "Account": credit balance and "Buy more", units,
// text size, name, email, home location, password change, and Delete account.
function AccountModal({ open, onClose }) {
    const { user, updateProfile, deleteAccount } = useAuth();
    const billing = useBillingStatus();
    // Whether the purchase popup ("Buy more") is open.
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const [name, setName] = useState(user.name);
    const [email, setEmail] = useState(user.email || '');
    const [location, setLocation] = useState(user.location || '');
    const [tempUnit, setTempUnit] = useState(user.tempUnit || 'F');
    // Text size is saved on this device only (utils/textScale.js), not on the account. Like the
    // other fields, it's only applied when Save is pressed.
    const [textScale, setTextScale] = useState(getTextScaleKey());
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [savedMsg, setSavedMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    // The password typed in the Delete account dialog (separate from the password change fields).
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const wasOpen = useRef(false);
    // The values the form started with, used to tell whether anything was changed (for the
    // "Discard changes?" warning and to decide whether to send tempUnit).
    const initialRef = useRef({ name: user.name, email: user.email || '', location: user.location || '', tempUnit: user.tempUnit || 'F', textScale: getTextScaleKey() });

    // Fills the form from the current user each time the popup opens (not on every update, which
    // would erase what's being typed).
    useEffect(() => {
        if (open && !wasOpen.current) {
            const seed = { name: user.name, email: user.email || '', location: user.location || '', tempUnit: user.tempUnit || 'F', textScale: getTextScaleKey() };
            setName(seed.name);
            setEmail(seed.email);
            setLocation(seed.location);
            setTempUnit(seed.tempUnit);
            setTextScale(seed.textScale);
            setCurrentPassword('');
            setPassword('');
            setConfirmPassword('');
            setError('');
            setSavedMsg('');
            initialRef.current = seed;
        }
        wasOpen.current = open;
    }, [open, user]);

    // Hides "Saved." after SAVED_MSG_MS.
    useEffect(() => {
        if (!savedMsg) return;
        const timer = setTimeout(() => setSavedMsg(''), SAVED_MSG_MS);
        return () => clearTimeout(timer);
    }, [savedMsg]);

    // True if any field differs from how the form started, or a password field has text.
    const hasUnsavedChanges = open && (
        name !== initialRef.current.name
        || email !== initialRef.current.email
        || location !== initialRef.current.location
        || tempUnit !== initialRef.current.tempUnit
        || textScale !== initialRef.current.textScale
        || !!currentPassword || !!password || !!confirmPassword
    );

    // Cancel, × and tapping outside all come here: asks "Discard changes?" if anything was
    // changed, otherwise closes.
    const requestClose = () => {
        if (hasUnsavedChanges) setDiscardConfirmOpen(true);
        else onClose();
    };

    const closeDeleteConfirm = () => {
        setDeleteConfirmOpen(false);
        setDeletePassword('');
        setDeleteError('');
    };

    const backdrop = useBackdropDismiss(requestClose);
    // Tapping outside the Delete account dialog closes it. (React hooks can't be called
    // conditionally, so this is set up even when the dialog isn't showing.)
    const deleteBackdrop = useBackdropDismiss(closeDeleteConfirm);
    // Up/down arrow buttons that scroll the form when it's taller than the window.
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', []);

    // Load the credit count again each time Account opens (it's only loaded once otherwise).
    const refreshBilling = billing.refresh;
    useEffect(() => {
        if (open) refreshBilling();
    }, [open, refreshBilling]);

    if (!open) return null;

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setSavedMsg('');
        // Name and email can't be blank.
        if (!name.trim()) {
            setError('Name is required.');
            return;
        }
        if (!email.trim()) {
            setError('Email is required.');
            return;
        }
        if (password) {
            if (password.length < MIN_PASSWORD_LENGTH) {
                setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
                return;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            // A new password needs the current one too (the server checks it).
            if (!currentPassword) {
                setError('Enter your current password to set a new one.');
                return;
            }
        }
        setBusy(true);
        try {
            const result = await updateProfile({
                name,
                email,
                location,
                // Only sent when changed. Sending it tells the server the user picked a unit,
                // which stops it from being set automatically from the home location
                // (User.updateProfile).
                tempUnit: tempUnit !== initialRef.current.tempUnit ? tempUnit : undefined,
                currentPassword: currentPassword || undefined,
                password: password || undefined,
            });
            setTextScaleKey(textScale);
            setCurrentPassword('');
            setPassword('');
            setConfirmPassword('');
            // A new email only applies after its verification link is clicked, so the field goes
            // back to the current email and the message says to check the new one.
            if (result.user.emailChangePending) {
                setSavedMsg(`Saved. Check ${email} to confirm your new email — until then, your email stays ${result.user.email}.`);
                setEmail(result.user.email);
            } else {
                setSavedMsg('Saved.');
            }
            initialRef.current = { name, email: result.user.email, location, tempUnit, textScale };
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const requestDelete = () => {
        setDeletePassword('');
        setDeleteError('');
        setDeleteConfirmOpen(true);
    };

    // Deletes the account. An account with a username must enter its password; a guest has no
    // password, so it isn't asked.
    const doDelete = async () => {
        if (user.username && !deletePassword) {
            setDeleteError('Enter your password to confirm.');
            return;
        }
        setBusy(true);
        try {
            await deleteAccount(deletePassword || undefined);
            // deleteAccount signs out (AuthContext.js), and the app then goes to the sign-in page.
        } catch (err) {
            setDeleteError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
        {/* The Account popup is hidden while the Delete account dialog is open, so only one
            shows at a time. */}
        <div className={'modal-overlay' + (deleteConfirmOpen ? '' : ' open')} {...backdrop}>
            <div className="modal-box modal-box-flex-scroll account-modal">
                <button type="button" className="modal-close-btn" onClick={requestClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>Account</h3>
                {/* Credit balance ("…" while loading) and Buy more. */}
                <p className="modal-sub account-credits">
                    <span>You have <strong>{billing?.remaining === undefined ? '…' : billing.remaining.toLocaleString('en-US')}</strong> credit{billing?.remaining === 1 ? '' : 's'}.</span>
                    <button type="button" className="auth-link-btn" onClick={() => setPurchaseOpen(true)}>Buy more</button>
                </p>

                {/* °F / mi or °C / km. Temperature and distance are set together (distance
                    follows temperature, see utils/distanceUnit.js). Applied on Save. */}
                <label className="field-label">Units</label>
                <TabSwitcher
                    tabs={[{ key: 'F', label: '°F / mi' }, { key: 'C', label: '°C / km' }]}
                    activeKey={tempUnit}
                    onSelect={setTempUnit}
                />

                {/* Text size of trip and packing list items and the add/edit item form: Small
                    14px (default) or Big 16px (utils/textScale.js). Applied on Save. */}
                <label className="field-label">Text size</label>
                <TabSwitcher
                    tabs={[
                        { key: 'small', label: 'Small' },
                        { key: 'big', label: 'Big' },
                    ]}
                    activeKey={textScale}
                    onSelect={(key) => setTextScale(key)}
                />

                <form onSubmit={submit}>
                    <label className="field-label">Name<span className="required-mark">*</span></label>
                    <input value={name} onChange={(e) => setName(e.target.value)} />

                    <label className="field-label">Username</label>
                    <input value={user.username || '(not set)'} disabled />

                    <label className="field-label">Email<span className="required-mark">*</span></label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

                    <label className="field-label">Home location</label>
                    <PlaceAutocompleteInput placeholder="City, State/Country" value={location} onChange={(e) => setLocation(e.target.value)} searchFn={searchCities} />

                    <label className="field-label">
                        Current password
                        {password && <span className="required-mark">*</span>}
                    </label>
                    <PasswordInput
                        placeholder="Required to set a new password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                    />

                    <label className="field-label">New password</label>
                    <PasswordInput
                        placeholder="Leave blank to keep current"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    <label className="field-label">Confirm new password</label>
                    <PasswordInput
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                    />

                    {error && <div className="modal-error">{error}</div>}
                    {savedMsg && <p className="modal-success">{savedMsg}</p>}
                    <div className="modal-btns">
                        <button type="button" className="cancel" onClick={requestClose}>Cancel</button>
                        <button type="submit" className="confirm" disabled={busy || !name}>Save</button>
                    </div>
                </form>

                <div className="account-danger-zone">
                    <button type="button" className="account-delete-link" onClick={requestDelete} disabled={busy}>
                        Delete account
                    </button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>

        <ConfirmModal
            open={discardConfirmOpen}
            onClose={() => setDiscardConfirmOpen(false)}
            onConfirm={onClose}
            heading="Discard changes?"
            body="Any changes made will be lost if not saved."
            confirmLabel="Discard"
        />

        {/* The Delete account dialog. Not ConfirmModal, because it has a password field and
            stays open to show an error if the password is wrong. */}
        {deleteConfirmOpen && (
            <div className="modal-overlay open" {...deleteBackdrop}>
                <div className="modal-box">
                    <h3>Delete your account?</h3>
                    <p className="modal-sub">
                        This is permanent and cannot be undone. Your account, and any trips or packlists only you can see, will be gone forever.
                    </p>
                    <p className="modal-sub">
                        {/* Leftover credits are given back once, after the email is verified
                            (User._restoreCredits). */}
                        If you sign up again with this email, any credits you have left will be restored after confirming it's you. No new free credits are added.
                        {' '}See <Link to="/privacy" onClick={() => { closeDeleteConfirm(); onClose(); }}>Privacy Policy</Link>.
                    </p>
                    {user.username && (
                        <>
                            <label className="field-label">Password<span className="required-mark">*</span></label>
                            <PasswordInput
                                autoFocus
                                placeholder="Enter your password to confirm"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') doDelete(); }}
                            />
                        </>
                    )}
                    {deleteError && <div className="modal-error">{deleteError}</div>}
                    <div className="modal-btns">
                        <button type="button" className="cancel" onClick={closeDeleteConfirm}>Cancel</button>
                        <button type="button" className="confirm danger" onClick={doDelete} disabled={busy}>Delete Account</button>
                    </div>
                </div>
            </div>
        )}
        {/* The purchase popup, shown on top of Account. */}
        <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
        </>
    );
}

export default AccountModal;
