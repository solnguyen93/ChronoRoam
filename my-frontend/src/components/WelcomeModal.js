import React from 'react';
import useBackdropDismiss from '../hooks/useBackdropDismiss';

// The "You're verified" popup, shown once after a restore link creates the account and gives back
// its leftover credits (see VerifyRestorePage.js).
function WelcomeModal({ open, onClose }) {
    const backdrop = useBackdropDismiss(onClose);

    if (!open) return null;

    return (
        <div className="modal-overlay open" {...backdrop}>
            <div className="modal-box">
                <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
                <h3>You're verified</h3>
                <p className="modal-sub">
                    Your account is created and any credits you had are restored.
                </p>
                <div className="modal-btns">
                    <button type="button" className="confirm" onClick={onClose}>Got it</button>
                </div>
            </div>
        </div>
    );
}

export default WelcomeModal;
