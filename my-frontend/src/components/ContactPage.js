import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Wordmark from './Wordmark';
import PageBackButton from './PageBackButton';
import { useAuth } from '../AuthContext';
import ChronoRoamApi from '../api';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// Contact form categories. Must match CATEGORIES in my-backend/routes/contactRoutes.js, which
// rejects anything else.
const CATEGORIES = ['Technical Issue', 'Account & Login', 'Billing & Purchases', 'Feedback & Suggestions', 'Other'];

// The Contact page: a form that emails us (no login needed). Fills in the name and email when signed in.
function ContactPage() {
    const { user } = useAuth();
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [message, setMessage] = useState('');
    // A hidden field people never see; bots that fill it in are ignored (see contactRoutes.js).
    const [website, setWebsite] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [sent]);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await ChronoRoamApi.sendContactMessage({ name, email, category, message, website });
            setSent(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong — try again, or email support@chronoroam.app directly.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="static-page">
            <div className="v-scroll-wrap static-page-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="static-page-scroll-body" ref={scrollRef}>
            <div className="static-page-inner">
                <PageBackButton />
                <Link to="/" className="static-page-logo"><Wordmark /></Link>
                <h1>Contact</h1>

                {sent ? (
                    <p>Thanks — your message has been sent. We'll get back to you at {email}.</p>
                ) : (
                    <form onSubmit={submit} className="contact-form">
                        <label className="field-label">Name<span className="required-mark">*</span></label>
                        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />

                        <label className="field-label">Email<span className="required-mark">*</span></label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

                        <label className="field-label">Subject</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)}>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <label className="field-label">Message<span className="required-mark">*</span></label>
                        <textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />

                        <input
                            type="text"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            autoComplete="off"
                            tabIndex={-1}
                            aria-hidden="true"
                            className="contact-form-honeypot"
                        />

                        {error && <div className="modal-error">{error}</div>}
                        <div className="modal-btns">
                            <button type="submit" className="confirm" disabled={busy || !name || !email || !message}>
                                {busy ? 'Sending…' : 'Send'}
                            </button>
                        </div>
                    </form>
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

export default ContactPage;
