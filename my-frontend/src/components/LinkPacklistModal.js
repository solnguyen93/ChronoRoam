import React, { useEffect, useState } from 'react';
import ChronoRoamApi from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import ConfirmModal from './ConfirmModal';
import TabSwitcher from './TabSwitcher';

// Popup for linking a packing list to the trip: pick one of the user's lists, or create a new one.
// It asks who sees it: Everyone on the trip (the default: every member now, and anyone who joins
// later) or Only me. Either way each person can unlink it for themselves later. Edits change the
// list itself, so they show everywhere it's used. A list already linked to this trip is marked
// "Linked", and picking it offers to link a copy instead.
function LinkPacklistModal({ open, onClose, onLink, onDuplicateAndLink, alreadyLinkedIds = [] }) {
    const [packlists, setPacklists] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmingDuplicate, setConfirmingDuplicate] = useState(null); // publicId, or null
    const [audience, setAudience] = useState('everyone'); // 'everyone' or 'me'
    const forEveryone = audience === 'everyone';

    useEffect(() => {
        if (!open) return;
        setNewTitle('');
        setConfirmingDuplicate(null);
        setAudience('everyone');
        ChronoRoamApi.getMyPacklists().then(({ packlists: fetched }) => setPacklists(fetched));
    }, [open]);

    const backdrop = useBackdropDismiss(onClose);

    if (!open) return null;

    const pick = async (p) => {
        if (alreadyLinkedIds.includes(p.id)) {
            setConfirmingDuplicate(p.publicId);
            return;
        }
        setBusy(true);
        try {
            await onLink(p.publicId, forEveryone);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const confirmDuplicate = async () => {
        setBusy(true);
        try {
            await onDuplicateAndLink(confirmingDuplicate, false, forEveryone);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    const createAndLink = async () => {
        const title = newTitle.trim();
        if (!title) return;
        setBusy(true);
        try {
            const { packlist } = await ChronoRoamApi.createPacklist(title);
            await onLink(packlist.publicId, forEveryone);
            onClose();
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
        <div className="modal-overlay open" {...backdrop}>
            <div className="modal-box">
                <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
                <h3>Link a packlist</h3>
                <p className="modal-sub">Changes to a linked list show everywhere it's used. For a separate copy, use Duplicate in the list's ⋮ menu.</p>
                <div className="modal-sub-label">Who sees this list?</div>
                <TabSwitcher
                    tabs={[{ key: 'everyone', label: 'Everyone on the trip' }, { key: 'me', label: 'Only me' }]}
                    activeKey={audience}
                    onSelect={setAudience}
                />

                {packlists === null && <div className="home-empty">Loading…</div>}

                {packlists && packlists.length === 0 && (
                    <div className="home-empty">No packlists yet — create one below.</div>
                )}

                {packlists && packlists.length > 0 && (
                    <div className="packlist-pick-list">
                        {packlists.map((p) => (
                            <button key={p.publicId} className="packlist-pick-row" disabled={busy} onClick={() => pick(p)}>
                                <span>{p.title}</span>
                                {alreadyLinkedIds.includes(p.id) && <span className="packlist-pick-linked-badge">Linked</span>}
                            </button>
                        ))}
                    </div>
                )}

                <div className="modal-sub-label">Create a new packlist</div>
                <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Name *"
                    onKeyDown={(e) => { if (e.key === 'Enter') createAndLink(); }}
                />

                <div className="modal-btns">
                    <button className="cancel" onClick={onClose}>Cancel</button>
                    <button className="confirm" disabled={busy || !newTitle.trim()} onClick={createAndLink}>Create & Link</button>
                </div>
            </div>
        </div>
        <ConfirmModal
            open={!!confirmingDuplicate}
            onClose={() => setConfirmingDuplicate(null)}
            onConfirm={confirmDuplicate}
            heading="This list is already linked to this trip"
            body="Duplicate it as a new list instead?"
            confirmLabel="Duplicate"
        />
        </>
    );
}

export default LinkPacklistModal;
