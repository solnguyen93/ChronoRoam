import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChronoRoamApi from '../api';
import EditDetailsModal from './EditDetailsModal';
import LockIcon from './LockIcon';
import PurchaseModal from './PurchaseModal';
import { useBillingStatus } from '../hooks/useBillingStatus';
import SharedBadge from './SharedBadge';
import { formatTripDateRange, parseISO, todayISO } from '../utils/dateHelpers';

const BLANK_TRIP = { title: '', startDate: todayISO(), endDate: todayISO() };

// Home's Trips tab: every trip the user is a member of, and the New Trip button.
function TripsList() {
    const navigate = useNavigate();
    const [trips, setTrips] = useState(null); // null = still loading
    const [creating, setCreating] = useState(false);
    const [newTripOpen, setNewTripOpen] = useState(false);
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const billing = useBillingStatus();
    // At the guest trip limit (false while still loading, so no lock icon flashes on load).
    const atTripCap = billing.trips && billing.trips.remaining === 0;

    const load = useCallback(() => {
        ChronoRoamApi.getMyTrips().then(({ trips: fetched }) => setTrips(fetched));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Reload the list every so often and when the app comes back into view, so changes to shared
    // trips show up.
    useEffect(() => {
        const id = setInterval(load, 20000);
        const onFocus = () => { if (document.visibilityState === 'visible') load(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [load]);

    const openTrip = (publicId) => {
        navigate(`/trip/${publicId}`);
    };

    const createTrip = async ({ title, startDate, endDate, destinations }) => {
        setCreating(true);
        try {
            const { trip } = await ChronoRoamApi.createTrip(title, startDate, endDate, destinations);
            billing.refresh();
            navigate(`/trip/${trip.publicId}`);
        } finally {
            setCreating(false);
            setNewTripOpen(false);
        }
    };

    return (
        <>
            {/* New Trip sits at the top, where a new trip appears. At the guest limit it opens the
                sign-up prompt instead. */}
            {atTripCap ? (
                <button className="home-new-trip-btn" onClick={() => setPurchaseOpen(true)}>
                    <LockIcon /> New Trip
                </button>
            ) : (
                <button className="home-new-trip-btn" disabled={creating} onClick={() => setNewTripOpen(true)}>
                    {creating ? 'Creating…' : '+ New Trip'}
                </button>
            )}

            {trips === null && <div className="home-empty">Loading your trips…</div>}

            {trips && trips.length === 0 && (
                <div className="home-empty">No trips yet — start your first one above.</div>
            )}

            {trips && trips.length > 0 && (
                <div className="home-trip-list">
                    {trips.map((t) => {
                        const sameYear = parseISO(t.startDate).getFullYear() === parseISO(t.endDate).getFullYear();
                        return (
                            <button key={t.publicId} className="home-trip-card" onClick={() => openTrip(t.publicId)}>
                                <div className="home-trip-title">{t.title}<SharedBadge memberCount={t.memberCount} kind="trip" /></div>
                                <div className="home-trip-dates">
                                    {formatTripDateRange(t.startDate, t.endDate, !sameYear)}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <EditDetailsModal
                open={newTripOpen}
                onClose={() => setNewTripOpen(false)}
                trip={BLANK_TRIP}
                heading="Trip details"
                titlePlaceholder="Name"
                confirmLabel={creating ? 'Creating…' : 'Create'}
                onSave={createTrip}
            />

            <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} reason="trip" />
        </>
    );
}

export default TripsList;
