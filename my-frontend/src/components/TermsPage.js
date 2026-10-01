import React from 'react';
import { Link } from 'react-router-dom';
import Wordmark from './Wordmark';
import PageBackButton from './PageBackButton';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// The Terms of Service page (no login needed).
function TermsPage() {
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', []);

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
                <h1>Terms of Service</h1>
                <p className="static-page-updated">Last updated: August 2026</p>

                <p>These terms govern your use of ChronoRoam. By creating an account or continuing as a guest, you agree to them.</p>

                <h2>The service</h2>
                <p>ChronoRoam is a trip-planning app: a day-by-day itinerary, packlists, and a shared to-do list, with optional AI-assisted features to speed up entering travel details. Manual trip planning is free. AI imports (pasting or forwarding booking emails, and importing packlists) use credits: each account gets a limited number of free credits, and a one-time purchase adds more — see the app for current details.</p>

                <h2>Your account</h2>
                <p>You're responsible for keeping your password confidential and for anything that happens under your account. Guest accounts are tied to a single device and aren't recoverable if lost — claim your account (add a username, email, and password) if you want it accessible elsewhere or recoverable later.</p>

                <h2>Your content</h2>
                <p>You keep ownership of whatever you enter into ChronoRoam — itinerary items, notes, packlists, and anything else. You're responsible for making sure you have the right to enter any content you add (for example, text from a confirmation email you forward or paste). Sharing a trip or packlist with someone else gives them the same ability to view and edit it that you have.</p>

                <h2>AI-assisted features</h2>
                <p>AI extraction (email/paste import, packing-list import) and Trip Tips use third-party AI providers and, for Trip Tips, live web search results. These are provided as a convenience — always double-check anything AI-extracted or AI-suggested (dates, flight details, visa/entry information, etc.) against your actual confirmation or an official source before relying on it. Extraction isn't guaranteed to succeed on every attempt (a confirmation may be misformatted, or not recognized as a booking at all) — a credit is used for the attempt itself, not only for a successful one.</p>

                <h2>Purchases</h2>
                <p>Each purchase of 100 Credits is a one-time payment that adds credits to your account, as described in the app at the time of purchase. You can purchase again at any time, and purchased credits never expire. All sales are final — purchases are not refundable, except where required by law or by the platform (Apple/Stripe) you purchased through.</p>
                <p>Deleting your account also removes your credits. If you create a new account with the same email, any credits you had left are restored once, after we email that address a link to verify it's you. No new free credits are added. See the Privacy Policy for what's kept.</p>

                <h2>Acceptable use</h2>
                <p>Don't use ChronoRoam to store or share unlawful content, attempt to abuse or circumvent usage limits, or interfere with the service's normal operation.</p>

                <h2>Termination</h2>
                <p>You can delete your account at any time from Settings. We may suspend or terminate an account that violates these terms.</p>

                <h2>Disclaimer</h2>
                <p>ChronoRoam is provided "as is," without warranties of any kind. It's a planning tool, not a source of legal, medical, visa/immigration, or travel advisory guidance — always verify trip-critical details (visa requirements, flight times, reservations) against an official or original source.</p>
                <p>Pricing and what's free may change in the future. If they do, any trips and packlists you've already created stay stored and accessible — only your ability to create new ones or use imports beyond your credits could be affected.</p>

                <h2>Changes to these terms</h2>
                <p>If these terms change in a meaningful way, the "Last updated" date above will change accordingly.</p>

                <h2>Contact</h2>
                <p>Questions about these terms can be sent to <a href="mailto:support@chronoroam.app">support@chronoroam.app</a>.</p>
            </div>
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default TermsPage;
