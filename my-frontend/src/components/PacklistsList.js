import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChronoRoamApi from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import LockIcon from './LockIcon';
import PurchaseModal from './PurchaseModal';
import SharedBadge from './SharedBadge';
import { useBillingStatus } from '../hooks/useBillingStatus';

// Home's Packlists tab: every packing list the user is a member of, and the New Packlist button.
function PacklistsList() {
    const navigate = useNavigate();
    const [packlists, setPacklists] = useState(null);
    const [creating, setCreating] = useState(false);
    const [newOpen, setNewOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const newBackdrop = useBackdropDismiss(() => setNewOpen(false));
    const billing = useBillingStatus();
    // At the guest packing list limit (false while still loading).
    const atPacklistCap = billing.packlists && billing.packlists.remaining === 0;

    const load = useCallback(() => {
        ChronoRoamApi.getMyPacklists().then(({ packlists: fetched }) => setPacklists(fetched));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openPacklist = (publicId) => {
        navigate(`/packlist/${publicId}`);
    };

    const createPacklist = async () => {
        const title = newTitle.trim();
        if (!title) return;
        setCreating(true);
        try {
            const { packlist } = await ChronoRoamApi.createPacklist(title);
            billing.refresh();
            navigate(`/packlist/${packlist.publicId}`);
        } finally {
            setCreating(false);
            setNewOpen(false);
        }
    };

    return (
        <>
            {/* New Packlist sits at the top, where a new list appears. At the guest limit it opens the
                sign-up prompt instead. */}
            {atPacklistCap ? (
                <button className="home-new-trip-btn" onClick={() => setPurchaseOpen(true)}>
                    <LockIcon /> New Packlist
                </button>
            ) : (
                <button className="home-new-trip-btn" onClick={() => { setNewTitle(''); setNewOpen(true); }}>
                    + New Packlist
                </button>
            )}

            {packlists === null && <div className="home-empty">Loading your packlists…</div>}

            {packlists && packlists.length === 0 && (
                <div className="home-empty">No packlists yet — start one above.</div>
            )}

            {packlists && packlists.length > 0 && (
                <div className="home-trip-list">
                    {packlists.map((p) => (
                        <button key={p.publicId} className="home-trip-card" onClick={() => openPacklist(p.publicId)}>
                            <div className="home-trip-title">{p.title}<SharedBadge memberCount={p.memberCount} kind="packlist" /></div>
                        </button>
                    ))}
                </div>
            )}

            {newOpen && (
                <div className="modal-overlay open" {...newBackdrop}>
                    <div className="modal-box">
                        <button type="button" className="modal-close-btn" onClick={() => setNewOpen(false)} aria-label="Close">×</button>
                        <h3>Packlist details</h3>
                        <input
                            autoFocus
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Name *"
                            onKeyDown={(e) => { if (e.key === 'Enter') createPacklist(); }}
                        />
                        <div className="modal-btns">
                            <button className="cancel" onClick={() => setNewOpen(false)}>Cancel</button>
                            <button className="confirm" disabled={creating || !newTitle.trim()} onClick={createPacklist}>
                                {creating ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} reason="packlist" />
        </>
    );
}

export default PacklistsList;
