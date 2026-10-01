import React, { useEffect, useState } from 'react';
import ChronoRoamApi from '../api';
import { useAuth } from '../AuthContext';
import geocode from '../utils/geocode';
import CollapseChevron from './CollapseChevron';
import LockIcon from './LockIcon';
import PurchaseModal from './PurchaseModal';
import useCollapsedSection from '../hooks/useCollapsedSection';
import { useBillingStatus } from '../hooks/useBillingStatus';
import { CREDIT_LOCKS_ENABLED } from '../utils/creditLocks';

// Shows text wrapped in **double asterisks** in bold (the AI marks key details this way).
function renderBold(text) {
    const parts = (text || '').split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}

// Words comparing the trip's weather to the user's home in its most similar month, e.g.
// "warmer and more humid than". Within 5°F and 10 humidity points counts as "similar to".
function weatherRelation(destAvgF, homeAvgF, destHumidity, homeHumidity) {
    const tempDiff = destAvgF - homeAvgF;
    const humidityDiff = destHumidity != null && homeHumidity != null ? destHumidity - homeHumidity : null;
    const tempClose = Math.abs(tempDiff) <= 5;
    const humidityClose = humidityDiff == null || Math.abs(humidityDiff) <= 10;
    if (tempClose && humidityClose) return 'similar to';

    const parts = [];
    if (!tempClose) parts.push(tempDiff > 0 ? 'warmer' : 'cooler');
    if (!humidityClose) parts.push(humidityDiff > 0 ? 'more humid' : 'drier');
    return `${parts.join(' and ')} than`;
}

// A date like "Sep 30, 2026".
function formatVerifiedDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Tips already loaded this session, so going back to a trip shows them without "Loading tips…".
// The server keeps its own cache (cached_trip_tips); this one is cleared when the app reloads.
const tipsCache = new Map();

// The Travel Tips panel: visa and entry, outlets, weather, and other tips for the trip's
// destinations. The server works out the places from the trip title, destinations and day items
// (routes/aiRoutes.js). Shows nothing when it finds no destination.
function TripTipsPanel({ tripId, tripTitle, tripStart, tripEnd, itineraryPlaces, destinations }) {
    const { user } = useAuth();
    const [collapsed, setCollapsed] = useCollapsedSection('chronoroam_collapsed_tips', tripId);
    const [tips, setTips] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const billing = useBillingStatus();
    // Trip Tips don't use credits. This optional lock hides the outlets-per-place and weather
    // rows when the user has 0 credits; it's switched off (utils/creditLocks.js). Stays false
    // while the credit count is loading.
    const locked = CREDIT_LOCKS_ENABLED && billing.remaining === 0;

    // Leaves out any destination or day-item place that's the user's home city (for example the
    // flight back home), so it isn't treated as somewhere they're traveling to.
    const homeCity = (user?.location || '').split(',')[0].trim().toLowerCase();
    const filteredDestinations = (destinations || []).filter((d) => d.split(',')[0].trim().toLowerCase() !== homeCity);
    const filteredItineraryPlaces = (itineraryPlaces || []).filter((p) => (p.city || '').trim().toLowerCase() !== homeCity);

    // The places joined into strings, so the effect below only reloads when the places actually
    // change (the arrays themselves are new on every render).
    const itineraryKey = filteredItineraryPlaces.map((p) => p.city).join('|');
    const destinationsKey = filteredDestinations.join('|');

    useEffect(() => {
        if (!tripTitle || !tripStart || !tripEnd) { setTips(null); return; }
        const cacheKey = `${tripTitle}|${tripStart}|${tripEnd}|${user?.location || ''}|${itineraryKey}|${destinationsKey}`;
        const cached = tipsCache.get(cacheKey);
        if (cached) { setTips(cached); setError(''); return; }

        let cancelled = false;
        setLoading(true);
        setError('');
        (async () => {
            // The user's home location, used only for the weather comparison. Without one,
            // that row is just left out.
            const home = user?.location ? await geocode(user.location) : null;
            if (cancelled) return;
            try {
                const result = await ChronoRoamApi.getTripTips({
                    title: tripTitle, startDate: tripStart, endDate: tripEnd,
                    homeLat: home?.lat, homeLon: home?.lon, homeCountry: home?.country,
                    itineraryPlaces: filteredItineraryPlaces, destinations: filteredDestinations,
                });
                if (!cancelled) {
                    tipsCache.set(cacheKey, result);
                    setTips(result);
                }
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.message || "Couldn't load travel tips right now.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // itineraryPlaces and destinations are left out on purpose; the keys above stand in
        // for them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tripTitle, tripStart, tripEnd, user?.location, itineraryKey, destinationsKey]);

    if (!tripTitle || (tips && !tips.hasDestination && !loading && !error)) return null;

    return (
        <div className={'todo-panel' + (collapsed ? ' todo-collapsed' : '')}>
            <div className="panel-head">
                <h2>Travel Tips{tips?.visa?.resolvedCity ? `: ${tips.visa.resolvedCity}` : ''}</h2>
                <button
                    className="collapse-btn"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => (locked ? setPurchaseOpen(true) : setCollapsed(!collapsed))}
                    title={locked ? 'Buy credits to see more' : undefined}
                >
                    {locked ? <LockIcon /> : <CollapseChevron collapsed={collapsed} size={13} />}
                </button>
            </div>
            {!collapsed && (
                <div className="trip-tips-body">
                    {loading && <p className="modal-sub" style={{ margin: 0 }}>Loading tips…</p>}
                    {!loading && error && <div className="modal-error" style={{ margin: 0 }}>{error}</div>}
                    {!loading && !error && tips?.hasDestination && (
                        <>
                            {tips.visa && (
                                <div className="trip-tips-row">
                                    <div className="trip-tips-label">Visa / Entry (US passport) — last verified {formatVerifiedDate(tips.visa.lastVerified)}</div>
                                    <div className="trip-tips-value">
                                        {renderBold(tips.visa.tipText)}
                                        {tips.visa.sourceUrl && (
                                            <> <a href={tips.visa.sourceUrl} target="_blank" rel="noreferrer">User to verify: {tips.visa.sourceLabel || 'official source'}</a></>
                                        )}
                                    </div>
                                </div>
                            )}
                            {tips.outlets && (
                                <div className="trip-tips-row">
                                    <div className="trip-tips-label">Outlets</div>
                                    <div className="trip-tips-value">{tips.outlets}</div>
                                </div>
                            )}
                            {/* Trips with several countries get one outlets row per place
                                instead of the single row above (buildMultiOutlets in
                                routes/aiRoutes.js). */}
                            {tips.multiOutlets && !locked && tips.multiOutlets.map((o) => (
                                <div className="trip-tips-row" key={o.place}>
                                    <div className="trip-tips-label">Outlets — {o.place}</div>
                                    <div className="trip-tips-value">{o.text}</div>
                                </div>
                            ))}
                            {/* When locked, these rows are hidden; the lock icon in the header
                                opens the purchase popup. */}
                            {tips.weatherComparison && !locked && (
                                <div className="trip-tips-row">
                                    <div className="trip-tips-label">{tips.weatherComparison.homeMonthName ? `Weather vs. ${user?.location || 'home'}` : 'Weather'}</div>
                                    <div className="trip-tips-value">
                                        {/* Shows a range when the trip's days differ a lot
                                            (weatherComparison.js), otherwise the average. */}
                                        {tips.weatherComparison.destMinF != null
                                            ? <>Your trip ranges ~{tips.weatherComparison.destMinF}-{tips.weatherComparison.destMaxF}°F</>
                                            : <>Your trip averages ~{tips.weatherComparison.destAvgF}°F</>}
                                        {tips.weatherComparison.destHumidity != null && `, ~${tips.weatherComparison.destHumidity}% humidity`}
                                        {tips.weatherComparison.homeMonthName && (
                                            <> — {weatherRelation(tips.weatherComparison.destAvgF, tips.weatherComparison.homeAvgF, tips.weatherComparison.destHumidity, tips.weatherComparison.homeHumidity)} {user?.location || 'home'} in {tips.weatherComparison.homeMonthName} (~{tips.weatherComparison.homeAvgF}°F{tips.weatherComparison.homeHumidity != null && `, ~${tips.weatherComparison.homeHumidity}% humidity`})</>
                                        )}
                                        .
                                    </div>
                                </div>
                            )}
                            {/* Trips with several places get a short weather summary instead
                                of the comparison above (routes/aiRoutes.js). */}
                            {tips.multiWeatherSummary && !locked && (
                                <div className="trip-tips-row">
                                    <div className="trip-tips-label">Weather</div>
                                    <div className="trip-tips-value">{tips.multiWeatherSummary}</div>
                                </div>
                            )}
                            {tips.experientialTips.map((t, i) => (
                                <div className="trip-tips-row" key={i}>
                                    <div className="trip-tips-label">{t.topic}</div>
                                    <div className="trip-tips-value">{renderBold(t.text)}</div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}

            <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} reason="import" />
        </div>
    );
}

export default TripTipsPanel;
