import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.solnguyen.chronoroam',
    appName: 'ChronoRoam',
    webDir: 'build',

    // Without this, iOS's own default ('automatic') sets the WKWebView's
    // contentInsetAdjustmentBehavior to automatically pull its content away from the safe area
    // (notch/status bar/home indicator) — which fights with, not complements, this app's own
    // env(safe-area-inset-*) CSS padding (see Planner.css's body rule and index.js's
    // @capacitor/status-bar setup). The two were fighting: the WebView itself never actually
    // extended to the true screen edges regardless of what setOverlaysWebView(true) or our CSS
    // padding did, since the system was already reserving that space before either got a say —
    // showing as a plain, un-styled native bar top and bottom, no matter what color the page
    // itself used. 'never' hands that decision over entirely to this app's own CSS instead.
    ios: {
        contentInset: 'never',
        // Without this, CAPBridgeViewController sets the native WKWebView's own backgroundColor
        // (and its scrollView's, separately) to UIColor.systemBackground — a native, Swift-level
        // property, not something any CSS in this app can reach. contentInset:'never' + the
        // StatusBar overlay above get the WEBVIEW itself to extend under the notch/status bar/
        // home indicator, and body's own env(safe-area-inset-*) padding (Planner.css) paints that
        // area in --washi via normal CSS — but only once the DOM has actually painted. Until then
        // (first frame, before CSS/DOM paint), and during elastic/rubber-band overscroll bounce at
        // the very top/bottom, it's this native backgroundColor showing through instead — visible
        // as an off-white bar/curve that doesn't match the app's cream --washi background, exactly
        // where the two meet. Matching it here at the native level (same hex as Planner.css's
        // --washi: #f4ecdb) means there's no color to mismatch in the first place, in either case.
        backgroundColor: '#f4ecdb',
    },

    // Live-reload config for iOS builds on the Mac. This makes the iOS app load the frontend
    // straight from this PC's dev server (`npm start` in my-frontend, port 3000) over the LAN,
    // instead of the static bundle in build/ — edit here, see it update on the phone/simulator
    // without rebuilding the iOS app each time. API calls from this live-reloaded app currently
    // hit the REAL production backend (Render) instead of localhost — see
    // .env.development.local, a temporary override for this final pre-App-Store testing stretch
    // (delete that file to go back to hitting your local backend during normal dev).
    //
    // >>> FILL IN BEFORE EACH MAC SESSION <<<
    // Replace the IP below with this PC's current LAN IP if it's changed (run `ip addr` or
    // `hostname -I` here to find it — it changes across networks/reboots on most home routers
    // unless this machine has a DHCP reservation). The Mac and this PC must be on the same LAN
    // for this to reach the dev server at all.
    //
    // Only the real standalone/production build (when actually building for the App Store) skips
    // this entirely — delete or comment out this whole `server` block for that, so Capacitor
    // loads the bundled build/ folder (built with .env.production's Render URL baked in) from
    // the device itself instead.
    // Live-reload disabled — switched to always building the real static bundle (build/, built
    // with .env.production's Render URL baked in) instead of loading from a dev server. Live-
    // reload's win (skip the Xcode rebuild for JS/CSS-only changes) wasn't paying for its cost
    // (LAN-IP config, .env.development.local juggling, confusion about which backend/DB a given
    // build was actually hitting) given how this project's actually being iterated on. To turn
    // it back on: uncomment the block below, filling in the current LAN IP of whichever machine
    // is running `npm start` (`ip addr`/`hostname -I` there), and see the comment that used to
    // live here for the .env.development.local caveat.
    //
    // server: {
    //     url: 'http://192.168.1.55:3000',
    //     cleartext: true, // required for plain http:// (not https://) on a local network
    // },
};

export default config;
