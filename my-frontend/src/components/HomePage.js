import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import TripsList from './TripsList';
import PacklistsList from './PacklistsList';
import OptionsMenu from './OptionsMenu';
import { useAuth } from '../AuthContext';
import Wordmark from './Wordmark';
import AccountModal from './AccountModal';
import WelcomeModal from './WelcomeModal';
import Footer from './Footer';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import InviteCards from './InviteCards';
import ChronoRoamApi from '../api';
import { openTour } from '../utils/tour';

// Home (/home): the Trips and Packlists tabs. (Opening the app at "/" goes back to the last trip
// instead, see App.js's RootRedirect.)
function HomePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { isGuest, logout } = useAuth();
    const [tab, setTab] = useState(location.state?.tab || 'trips');
    const [showAccount, setShowAccount] = useState(false);
    // The "You're verified" popup after a restore link (VerifyRestorePage.js passes showWelcome and
    // reason 'restored' when it opens Home).
    const [showWelcome, setShowWelcome] = useState(Boolean(location.state?.showWelcome));
    const [welcomeReason] = useState(location.state?.reason);

    // Clear that from the page's history right away, so reloading doesn't show the popup again.
    useEffect(() => {
        if (location.state?.showWelcome) navigate(location.pathname, { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Invites to trips and packing lists (InviteCards). Loaded when Home opens and whenever the app
    // comes back into view.
    const [invites, setInvites] = useState([]);
    const loadInvites = () => ChronoRoamApi.getInvites().then((d) => setInvites(d.invites)).catch(() => {});
    useEffect(() => {
        loadInvites();
        const onFocus = () => { if (document.visibilityState === 'visible') loadInvites(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, []);
    const tripInvites = invites.filter((i) => i.kind === 'trip');
    const packlistInvites = invites.filter((i) => i.kind === 'packlist');

    const doLogout = () => {
        logout();
        navigate('/login');
    };

    // The header stays put; the list scrolls, with up/down arrows (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [tab]);

    return (
        <div className="home-page">
            <div className="v-scroll-wrap home-page-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="home-page-scroll-body" ref={scrollRef}>
                    <div className="home-header">
                        <div className="header-title-row">
                            <div className="home-tabs">
                                <button className={tab === 'trips' ? 'active' : ''} onClick={() => setTab('trips')}>Trips{tab !== 'trips' && tripInvites.length > 0 && <span className="tab-dot" />}</button>
                                <button className={tab === 'packlists' ? 'active' : ''} onClick={() => setTab('packlists')}>Packlists{tab !== 'packlists' && packlistInvites.length > 0 && <span className="tab-dot" />}</button>
                            </div>
                            <div className="header-top-right">
                                <span className="home-link"><Wordmark /></span>
                                {/* The ⋮ menu (How to use, Account, Log out) is hidden for guests: they can't
                                    sign back in after logging out, and the sign-up link is shown below instead. */}
                                {!isGuest && (
                                    <OptionsMenu
                                        title="Account options"
                                        items={[
                                            { label: 'How to use', onClick: openTour },
                                            { label: 'Account', onClick: () => setShowAccount(true) },
                                            { label: 'Log out', onClick: doLogout },
                                        ]}
                                    />
                                )}
                            </div>
                        </div>

                        {isGuest && (
                            <div className="guest-note-header">
                                Your trips stay on this device only, and some features are limited.{' '}
                                <Link to="/register">Create an account</Link> or <Link to="/login">Sign in</Link>
                            </div>
                        )}
                    </div>

                    <div className="home-body">
                        <InviteCards invites={tab === 'trips' ? tripInvites : packlistInvites} onChanged={loadInvites} />
                        {tab === 'trips' ? <TripsList /> : <PacklistsList />}
                    </div>

                    <Footer />
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>

            <AccountModal open={showAccount} onClose={() => setShowAccount(false)} />


            <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} reason={welcomeReason} />
        </div>
    );
}

export default HomePage;
