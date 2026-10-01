import React, { useEffect } from 'react';
// Hash routing (page paths after "#", e.g. /#/trip/abc) works in the iPhone app, which loads
// the app from local files where normal URL paths don't.
import { createHashRouter, RouterProvider, useParams, useLocation, Navigate } from 'react-router-dom';
import Planner from './components/Planner';
import HomePage from './components/HomePage';
import PacklistDetailPage from './components/PacklistDetailPage';
import AuthPage from './components/AuthPage';
import DemoPage from './components/DemoPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import VerifyRestorePage from './components/VerifyRestorePage';
import VerifyEmailChangePage from './components/VerifyEmailChangePage';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import TermsPage from './components/TermsPage';
import ContactPage from './components/ContactPage';
import { AuthProvider, useAuth } from './AuthContext';
import { getLastLocation, setLastLocation } from './utils/tripList';
import './styles/Planner.css';

// Wraps pages that need a signed-in user (a guest counts). With no user, goes to the sign-in
// page and passes along the page that was asked for (`from`), so AuthPage can go there after
// signing in, e.g. a shared trip link.
//
// Right after a sign-out, `from` isn't passed, so the next person to sign in on this device
// isn't taken to the previous user's page. justLoggedOut is cleared after that one redirect.
function RequireAuth({ children }) {
    const { user, justLoggedOut, consumeJustLoggedOut } = useAuth();
    const location = useLocation();
    useEffect(() => {
        if (!user && justLoggedOut) consumeJustLoggedOut();
    }, [user, justLoggedOut, consumeJustLoggedOut]);
    if (!user) {
        const state = justLoggedOut ? undefined : { from: location.pathname + location.search };
        return <Navigate to="/login" replace state={state} />;
    }
    return children;
}

// "/" goes to the page this user was last on (a trip, or Home), as saved on this device per
// user (utils/tripList.js).
function RootRedirect() {
    const { user } = useAuth();
    const last = getLastLocation(user?.id);
    if (last && last !== 'home') return <Navigate to={`/trip/${last}`} replace />;
    return <Navigate to="/home" replace />;
}

// A trip page. Saves it as the last page visited, for "/" above.
function TripPage() {
    const { tripId } = useParams();
    const { user } = useAuth();

    useEffect(() => {
        setLastLocation(user?.id, tripId);
    }, [tripId, user?.id]);

    return <Planner tripId={tripId} />;
}

// The Home page (trip and packing list lists). Saves Home as the last page visited.
function HomeRoute() {
    const { user } = useAuth();

    useEffect(() => {
        setLastLocation(user?.id, 'home');
    }, [user?.id]);

    return <HomePage />;
}

const router = createHashRouter([
    { path: '/login', element: <AuthPage /> },
    { path: '/register', element: <AuthPage /> },
    { path: '/demo', element: <DemoPage /> },
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/reset-password', element: <ResetPasswordPage /> },
    { path: '/verify-restore', element: <VerifyRestorePage /> },
    { path: '/verify-email-change', element: <VerifyEmailChangePage /> },
    { path: '/privacy', element: <PrivacyPolicyPage /> },
    { path: '/terms', element: <TermsPage /> },
    { path: '/contact', element: <ContactPage /> },
    { path: '/', element: <RequireAuth><RootRedirect /></RequireAuth> },
    { path: '/home', element: <RequireAuth><HomeRoute /></RequireAuth> },
    { path: '/trip/:tripId', element: <RequireAuth><TripPage /></RequireAuth> },
    { path: '/packlist/:packlistId', element: <RequireAuth><PacklistDetailPage /></RequireAuth> },
    { path: '*', element: <RequireAuth><RootRedirect /></RequireAuth> },
]);

// Scrolls to the top after every page change. On phones the sign-in form can leave the page
// scrolled down (to keep the text box above the keyboard), and the next page would open
// scrolled down too. It scrolls again after 350ms because on iOS the keyboard closing can
// scroll the page after the first reset.
function resetScroll() {
    window.scrollTo(0, 0);
    setTimeout(() => window.scrollTo(0, 0), 350);
}
router.subscribe(resetScroll);

const App = () => {
    // On iPhone the app sometimes opens looking zoomed in until the layout is recalculated.
    // Changing the viewport tag and changing it back, once after the first paint, forces that.
    useEffect(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        const content = meta.getAttribute('content');
        requestAnimationFrame(() => {
            meta.setAttribute('content', content + ',');
            requestAnimationFrame(() => meta.setAttribute('content', content));
        });
    }, []);

    return (
        <AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider>
    );
};

export default App;
