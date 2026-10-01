import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChronoRoamApi from '../api';
import { formatTripDateRange, parseISO } from '../utils/dateHelpers';

// Invite cards at the top of a Home tab: "<name> invited you to <trip>" with Decline and Accept.
// Accept joins and opens it; either button removes the card (onChanged reloads the invites).
function InviteCards({ invites, onChanged }) {
    const navigate = useNavigate();
    const [busyId, setBusyId] = useState(null);

    const accept = async (invite) => {
        setBusyId(invite.id);
        try {
            const { kind, publicId } = await ChronoRoamApi.acceptInvite(invite.id);
            navigate(kind === 'trip' ? `/trip/${publicId}` : `/packlist/${publicId}`);
        } catch {
            setBusyId(null);
            onChanged();
        }
    };

    const decline = async (invite) => {
        setBusyId(invite.id);
        try {
            await ChronoRoamApi.declineInvite(invite.id);
        } finally {
            setBusyId(null);
            onChanged();
        }
    };

    if (!invites.length) return null;
    return (
        <div className="invite-cards">
            {invites.map((inv) => (
                <div key={inv.id} className="invite-card">
                    <div className="invite-card-text">
                        ✉️ <strong>{inv.fromName}</strong> invited you to <strong>{inv.title}</strong>
                        {inv.startDate && (
                            <div className="home-trip-dates">
                                {formatTripDateRange(inv.startDate, inv.endDate, parseISO(inv.startDate).getFullYear() !== parseISO(inv.endDate).getFullYear())}
                            </div>
                        )}
                    </div>
                    <div className="invite-card-btns">
                        <button type="button" className="cancel" disabled={busyId === inv.id} onClick={() => decline(inv)}>Decline</button>
                        <button type="button" className="confirm" disabled={busyId === inv.id} onClick={() => accept(inv)}>Accept</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default InviteCards;
