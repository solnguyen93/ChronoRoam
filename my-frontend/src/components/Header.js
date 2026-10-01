import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatTripDateRange, parseISO } from '../utils/dateHelpers';
import useCountdown from '../hooks/useCountdown';
import ChronoRoamApi from '../api';
import OptionsMenu from './OptionsMenu';
import ShareModal from './ShareModal';
import EditDetailsModal from './EditDetailsModal';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '../AuthContext';
import Wordmark from './Wordmark';
import BackButton from './BackButton';
import SharedBadge from './SharedBadge';
import AccountModal from './AccountModal';

// The city part of a destination ("Seattle, Washington, United States" -> "Seattle").
function cityOnly(destination) {
    return destination.split(',')[0].trim();
}

// Whether the trip title already names every destination (then the destinations aren't shown
// under it). If any destination isn't in the title, they're all shown.
function destinationsRedundantWithTitle(title, destinations) {
    const normalizedTitle = (title || '').toLowerCase();
    return destinations.every((d) => normalizedTitle.includes(cityOnly(d).toLowerCase()));
}

function Header({ trip, updateTrip }) {
    const navigate = useNavigate();
    const { isGuest, logout } = useAuth();
    const [modal, setModal] = useState(null); // which popup is open: 'share', 'edit', 'delete', 'account', or null
    const [busy, setBusy] = useState(false);

    const countdown = useCountdown(trip.startDate, trip.endDate);
    const sameYear = parseISO(trip.startDate).getFullYear() === parseISO(trip.endDate).getFullYear();

    const closeModal = () => setModal(null);

    // Copies the trip and opens the copy (busy stops a second tap from making two copies).
    const handleDuplicate = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const { trip: newTrip } = await ChronoRoamApi.duplicateTrip(trip.publicId);
            navigate(`/trip/${newTrip.publicId}`);
        } finally {
            setBusy(false);
        }
    };

    // "Deletes" the trip for this user (removes their membership; the trip itself goes when its
    // last member leaves), then opens Home.
    const handleDelete = async () => {
        await ChronoRoamApi.deleteTrip(trip.publicId);
        navigate('/home', { replace: true });
    };

    const doLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <header>
            <div className="header-title-row">
                <div className="header-title-with-back">
                    <BackButton />
                    <h1>{trip.title}</h1>
                    <SharedBadge memberCount={trip.memberCount} kind="trip" />
                </div>
                <div className="header-top-right">
                    <Link to="/home" className="home-link"><Wordmark /></Link>
                    <OptionsMenu
                        title="Trip options"
                        items={[
                            { label: 'Share', onClick: () => setModal('share') },
                            { label: 'Edit details', onClick: () => setModal('edit') },
                            { label: 'Duplicate', onClick: handleDuplicate },
                            { label: 'Delete', onClick: () => setModal('delete'), danger: true },
                            // Guests don't get Account or Log out (they couldn't sign back in).
                            ...(isGuest ? [] : [
                                { label: 'Account', onClick: () => setModal('account') },
                                { label: 'Log out', onClick: doLogout },
                            ]),
                        ]}
                    />
                </div>
            </div>

            {/* The destinations' city names, unless the title already names them all. */}
            {trip.destinations?.length > 0 && !destinationsRedundantWithTitle(trip.title, trip.destinations) && (
                <div className="trip-destinations">{trip.destinations.map(cityOnly).join(' · ')}</div>
            )}

            <div className="trip-range">
                {formatTripDateRange(trip.startDate, trip.endDate, !sameYear)}
            </div>

            {countdown && (
                <div className="countdown">
                    <span className="num">{countdown.num}</span>
                    <span className="label">{countdown.label}</span>
                </div>
            )}

            <ShareModal open={modal === 'share'} onClose={closeModal} kind="trip" publicId={trip.publicId} />

            <EditDetailsModal
                open={modal === 'edit'}
                onClose={closeModal}
                trip={trip}
                onSave={(changes) => { updateTrip(changes); closeModal(); }}
            />

            <ConfirmModal
                open={modal === 'delete'}
                onClose={closeModal}
                onConfirm={handleDelete}
                heading="Delete this trip?"
            />

            <AccountModal open={modal === 'account'} onClose={closeModal} />

        </header>
    );
}

export default Header;
