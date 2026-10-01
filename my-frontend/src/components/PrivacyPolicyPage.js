import React from 'react';
import { Link } from 'react-router-dom';
import Wordmark from './Wordmark';
import PageBackButton from './PageBackButton';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// The Privacy Policy page (no login needed; the App Store listing links to it).
function PrivacyPolicyPage() {
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
                <h1>Privacy Policy</h1>
                <p className="static-page-updated">Last updated: August 2026</p>

                <p>This policy describes what information ChronoRoam collects, why, and how it's used. ChronoRoam is a trip-planning app — an itinerary, packlists, and a shared to-do list for a trip, with optional AI-assisted features to speed up entering your travel details.</p>

                <h2>Information you provide</h2>
                <p>When you create an account: your name, a username, an email address, and a password (stored as a one-way hash — ChronoRoam never stores or can recover your actual password). A home location is optional and only used to personalize weather comparisons and travel tips.</p>
                <p>You can also use the app as a guest without an email or password — a guest account works the same as a real one, just without sign-in credentials until you choose to claim it.</p>
                <p>Everything you enter into a trip — itinerary items, packlists, to-dos, dates, notes, and any confirmation emails or packlists you paste or forward for AI extraction — is stored so the app can show it back to you and anyone you share that trip or packlist with.</p>

                <h2>AI-assisted features</h2>
                <p>If you paste or forward a booking confirmation email, or paste a packlist for import, that text is sent to a third-party AI provider (OpenAI and/or Anthropic) to identify and extract the relevant details (flight/hotel/booking details, or individual packing items). The extracted result is shown to you for review before anything is saved — nothing is saved automatically. Trip Tips (visa/entry information, local advice) sends your trip's title and dates, and optionally your home location, to Anthropic's Claude, which may perform a live web search to find current visa/entry requirements.</p>
                <p>These providers process this text to generate a response; ChronoRoam does not use it to train any AI model.</p>

                <h2>Other third-party services</h2>
                <ul>
                    <li><strong>Open-Meteo</strong> — weather forecasts and historical averages, and place-name lookups, based on a trip's or your home's location.</li>
                    <li><strong>AviationStack / AeroDataBox</strong> (via RapidAPI) — flight schedule lookups when you enter a flight number.</li>
                    <li><strong>Cloudflare</strong> — routes a confirmation email you forward to your personal ChronoRoam address to our server for processing.</li>
                    <li><strong>Stripe</strong> (web) and <strong>Apple</strong> (iOS In-App Purchase) — process any payment for credits. ChronoRoam never sees or stores your card details; each provider confirms only that a payment succeeded.</li>
                </ul>

                <h2>Cookies and local storage</h2>
                <p>ChronoRoam stores a sign-in token on your device (browser local storage, or the equivalent on iOS) to keep you signed in between visits. This isn't used for advertising or cross-site tracking, and no third-party analytics or ad-tracking cookies are used.</p>

                <h2>Data retention and deletion</h2>
                <p>Your account and its data are kept for as long as your account exists. You can delete your account at any time from Settings, which removes your account, trips, and packlists you own, along with your name, password, and other profile details — except your email, which is retained as described below. Content you shared with others (e.g. a trip another person is also a member of) remains visible to them, same as if you'd left a shared document.</p>
                <p>When you delete your account, we keep a scrambled one-way code made from your email and, on iOS, your device identifier. It can't be turned back into your email address or device identifier, and it's kept only to stop the free credits from being claimed again with a new account. We also keep how many credits you had left, so they can be restored if you create a new account with the same email. We'll send that address a verification link, which you have to click before anything is restored, so simply knowing or guessing someone's email isn't enough on its own. Nothing else about your account or trips is retained.</p>

                <h2>Children</h2>
                <p>ChronoRoam is not directed at children under 13, and we do not knowingly collect information from them.</p>

                <h2>Changes to this policy</h2>
                <p>If this policy changes in a meaningful way, the "Last updated" date above will change accordingly.</p>

                <h2>Contact</h2>
                <p>Questions about this policy or your data can be sent to <a href="mailto:support@chronoroam.app">support@chronoroam.app</a>.</p>
            </div>
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default PrivacyPolicyPage;
