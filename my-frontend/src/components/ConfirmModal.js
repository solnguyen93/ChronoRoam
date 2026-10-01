import React from 'react';
import useBackdropDismiss from '../hooks/useBackdropDismiss';

// A yes/no popup for deleting things (heading, message, and a confirm button, "Delete" by default).
function ConfirmModal({ open, onClose, onConfirm, heading, body, confirmLabel = 'Delete' }) {
    const backdrop = useBackdropDismiss(onClose);

    if (!open) return null;

    return (
        <div className="modal-overlay open" {...backdrop}>
            <div className="modal-box">
                <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
                <h3>{heading}</h3>
                {body && <p className="modal-sub">{body}</p>}
                <div className="modal-btns">
                    <button className="cancel" onClick={onClose}>Cancel</button>
                    <button className="confirm danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
