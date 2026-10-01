import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import ChronoRoamApi from '../api';

// What sharing means, shown above the QR code (kind is 'trip' or 'packlist').
const SHARE_WARNINGS = {
    trip: "Anyone who joins can edit this trip and its shared packlists. You can't remove them later.",
    packlist: "Anyone who joins can edit this packlist. You can't remove them later.",
};

// The Share popup for a trip or packing list: what sharing means, a QR code to scan, the link to
// copy, and inviting someone by username (publicId is the trip's or packing list's).
function ShareModal({ open, onClose, heading = 'Share this trip', kind = 'trip', publicId }) {
    const [copied, setCopied] = useState(false);
    const [inviteName, setInviteName] = useState('');
    const [inviteMsg, setInviteMsg] = useState(null); // { ok, text } after sending
    const [inviting, setInviting] = useState(false);
    const backdrop = useBackdropDismiss(onClose);
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', []);

    if (!open) return null;

    // The share link: the public web address (REACT_APP_PUBLIC_URL, since the iPhone app's own
    // address isn't a real web address) + this page's #/... path + ?join=1. Opening a link with
    // ?join=1 is what adds the person (see the server's GET routes).
    const url = `${process.env.REACT_APP_PUBLIC_URL || window.location.origin}/${window.location.hash.split('?')[0]}?join=1`;

    // Sends an invite; they accept or decline on their Home.
    const sendInvite = async () => {
        const name = inviteName.trim();
        if (!name || !publicId) return;
        setInviting(true);
        try {
            await ChronoRoamApi.sendInvite(kind, publicId, name);
            setInviteMsg({ ok: true, text: `Invite sent to ${name}.` });
            setInviteName('');
        } catch (err) {
            setInviteMsg({ ok: false, text: err.response?.data?.message || "Couldn't send the invite." });
        } finally {
            setInviting(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch (e) {
            setCopied(false);
        }
    };

    return (
        <div className="modal-overlay open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll">
                <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>{heading}</h3>
                <p className="modal-sub share-warning">{SHARE_WARNINGS[kind]}</p>

                <div className="modal-sub-label">Let them scan</div>
                <div className="share-qr-link">
                    <QRCodeSVG value={url} size={200} fgColor="#17293a" bgColor="#ffffff" />
                </div>

                <div className="modal-sub-label">Send the link</div>
                <button className="share-url" onClick={handleCopy}>
                    <span className="share-url-text">{url}</span>
                    <span className="share-url-copy">{copied ? 'Copied' : 'Copy'}</span>
                </button>

                {publicId && (
                    <>
                        <div className="modal-sub-label">Invite by username</div>
                        <div className="share-invite-row">
                            <input
                                value={inviteName}
                                onChange={(e) => { setInviteName(e.target.value); setInviteMsg(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }}
                                placeholder="Username"
                                autoCapitalize="none"
                                autoCorrect="off"
                            />
                            <button type="button" className="confirm" disabled={inviting || !inviteName.trim()} onClick={sendInvite}>Invite</button>
                        </div>
                        {inviteMsg && <p className={inviteMsg.ok ? 'modal-success' : 'modal-error'}>{inviteMsg.text}</p>}
                    </>
                )}

                <div className="modal-btns">
                    <button className="cancel" onClick={onClose}>Cancel</button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
    );
}

export default ShareModal;
