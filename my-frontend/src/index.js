import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { App as CapacitorApp } from '@capacitor/app';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { initTextScale } from './utils/textScale';

// Apply the saved text size before anything is drawn, so the size doesn't jump.
initTextScale();

// iPhone app only:
if (Capacitor.isNativePlatform()) {
    // Let the page draw under the status bar, all the way to the screen's edges.
    StatusBar.setOverlaysWebView({ overlay: true });
    // Hide the status bar (time, signal, battery) so the app fills the screen. The page's own
    // safe-area padding still keeps content clear of the notch and home indicator.
    StatusBar.hide();

    // Share links (https://chronoroam.app/#/...) tapped on a phone with the app open the app
    // instead of Safari. This opens the link's #/... page, both when the app is already running
    // and when the link launched it.
    const openSharedLink = (url) => {
        const hash = url ? new URL(url).hash : '';
        if (hash.startsWith('#/')) window.location.hash = hash;
    };
    CapacitorApp.addListener('appUrlOpen', ({ url }) => openSharedLink(url));
    CapacitorApp.getLaunchUrl().then((launch) => openSharedLink(launch?.url));
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Create React App's performance reporting (does nothing unless given a function).
reportWebVitals();
