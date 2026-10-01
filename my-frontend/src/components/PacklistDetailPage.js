import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import ChronoRoamApi, { AI_FLIGHT_EXTRACTION_ENABLED } from '../api';
import PacklistTree from './PacklistTree';
import OptionsMenu from './OptionsMenu';
import PlusIcon from './PlusIcon';
import ConfirmModal from './ConfirmModal';
import ShareModal from './ShareModal';
import WelcomeModal from './WelcomeModal';
import AiPacklistImportModal from './AiPacklistImportModal';
import SearchExpandable from './SearchExpandable';
import { DEFAULT_BAG_COLOR } from '../utils/bagColors';
import { filterPacklistTree } from '../utils/packlistSearch';
import { useAuth } from '../AuthContext';
import Wordmark from './Wordmark';
import BackButton from './BackButton';
import AccountModal from './AccountModal';
import PurchaseModal from './PurchaseModal';
import LockIcon from './LockIcon';
import { useBillingStatus } from '../hooks/useBillingStatus';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import useAtTopBackdrop from '../hooks/useAtTopBackdrop';
import SharedBadge from './SharedBadge';
import CollapseChevron from './CollapseChevron';

// The packing list page (from Home's Packlists tab, or a /packlist/... link). Edits change the
// shared list everywhere it's used; Duplicate makes a separate copy.
function PacklistDetailPage() {
    const { packlistId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { isGuest, logout } = useAuth();
    const billing = useBillingStatus();
    // Shows the "You're verified" popup when that was passed in the page's navigation state, then
    // clears it so a reload doesn't show it again.
    const [showWelcome, setShowWelcome] = useState(Boolean(location.state?.showWelcome));
    const [welcomeReason] = useState(location.state?.reason);
    useEffect(() => {
        if (location.state?.showWelcome) navigate(location.pathname, { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // At 0 credits, Import packing list opens the purchase popup instead (false while loading).
    const importLocked = billing.remaining === 0;
    const [packlist, setPacklist] = useState(null);
    const [items, setItems] = useState([]);
    const [bags, setBags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [showAccount, setShowAccount] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [linkedTrips, setLinkedTrips] = useState([]);
    const [titleDraft, setTitleDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [aiImportOpen, setAiImportOpen] = useState(false);
    const [purchaseOpen, setPurchaseOpen] = useState(false);
    const [hideChecked, setHideChecked] = useState(false);
    const [search, setSearch] = useState('');
    const renameBackdrop = useBackdropDismiss(() => setRenaming(false));
    // The whole page, header included, scrolls with up/down arrows (see useScrollArrows).
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [bags.length, items.length]);
    useAtTopBackdrop();
    const { canBack: renameCanBack, canForward: renameCanForward, idle: renameIdle, scrollBack: renameScrollBack, scrollForward: renameScrollForward, ref: renameScrollRef } = useScrollArrows('y', []);

    // Opened from a share link (?join=1, see ShareModal.js): only that first load adds this
    // account as a member. Later loads never join.
    const joinFromLink = new URLSearchParams(location.search).get('join') === '1';
    const joinRef = useRef(joinFromLink);
    joinRef.current = joinFromLink;
    const load = useCallback(async () => {
        try {
            const data = await ChronoRoamApi.getPacklist(packlistId, joinRef.current);
            setPacklist(data.packlist);
            setItems(data.items);
            setBags(data.bags);
        } catch (err) {
            if (err.response?.status === 404) setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, [packlistId]);

    useEffect(() => {
        load();
    }, [packlistId, load]);

    // Once joined, drop ?join=1 from the address so it isn't left in history or a copied URL.
    useEffect(() => {
        if (joinFromLink && packlist) navigate(location.pathname, { replace: true, state: location.state });
    }, [joinFromLink, packlist, navigate, location.pathname, location.state]);

    useEffect(() => {
        if (notFound) navigate('/home', { replace: true, state: { tab: 'packlists' } });
    }, [notFound, navigate]);

    // Saves a server reply's items and bags, and returns the reply (PacklistTree.js needs the new
    // item from it right away).
    const applyTree = (data) => {
        setItems(data.items);
        setBags(data.bags);
        return data;
    };

    const handleRename = async () => {
        const title = titleDraft.trim();
        if (!title) { setRenaming(false); return; }
        const updated = await ChronoRoamApi.renamePacklist(packlistId, title);
        setPacklist(updated);
        setRenaming(false);
    };

    // Copies the packing list and opens the copy (busy stops a second tap from making two copies).
    const handleDuplicate = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const { packlist: newPacklist } = await ChronoRoamApi.duplicatePacklist(packlistId);
            navigate(`/packlist/${newPacklist.publicId}`);
        } finally {
            setBusy(false);
        }
    };

    const doLogout = () => {
        logout();
        navigate('/login');
    };

    // "Deletes" the list for this user. It's first unlinked from the user's own trips, since opening
    // a trip would otherwise make them a member of it again. Then their membership is removed (the
    // list itself goes when its last member leaves).
    const handleDelete = async () => {
        for (const trip of linkedTrips) await ChronoRoamApi.unlinkPacklist(trip.publicId, packlistId);
        await ChronoRoamApi.deletePacklist(packlistId);
        navigate('/home', { replace: true, state: { tab: 'packlists' } });
    };

    const openDeleteConfirm = async () => {
        const { trips } = await ChronoRoamApi.getTripsLinkingPacklist(packlistId);
        setLinkedTrips(trips);
        setConfirmingDelete(true);
    };

    const deleteWarning = linkedTrips.length > 0
        ? `This packlist is linked to ${linkedTrips.map((t) => `"${t.title}"`).join(', ')}. Deleting it removes it from ${linkedTrips.length > 1 ? 'those trips' : 'that trip'} for you only; anyone else on ${linkedTrips.length > 1 ? 'them' : 'it'} keeps it.`
        : null;

    if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
    if (!packlist) return null;

    const baseItems = hideChecked ? items.filter((i) => !i.done) : items;
    const { items: visibleItems, bags: visibleBags } = filterPacklistTree(baseItems, bags, search);

    return (
        <div className="detail-page">
            <div className="v-scroll-wrap detail-page-scroll-wrap">
            {canBack && (
                <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
            )}
            <div key="scroll-body" className="detail-page-scroll-body" ref={scrollRef}>
            <header>
                <div className="header-title-row">
                    <div className="header-title-with-back">
                        <BackButton tab="packlists" />
                        <h1>{packlist.title}</h1>
                        <SharedBadge memberCount={packlist.memberCount} kind="packlist" />
                    </div>
                    <div className="header-top-right">
                        <Link to="/home" className="home-link"><Wordmark /></Link>
                        <OptionsMenu
                            title="Packlist options"
                            items={[
                                ...(AI_FLIGHT_EXTRACTION_ENABLED ? [{
                                    label: importLocked ? <><LockIcon width={13} height={13} /> Import packlist</> : 'Import packlist',
                                    onClick: () => (importLocked ? setPurchaseOpen(true) : setAiImportOpen(true)),
                                }] : []),
                                { label: 'Uncheck all', onClick: () => ChronoRoamApi.uncheckAllPacklistItems(packlistId).then(applyTree) },
                                { label: hideChecked ? 'Show checked off' : 'Hide checked off', onClick: () => setHideChecked((h) => !h) },
                                { label: 'Share', onClick: () => setShowShare(true) },
                                { label: 'Rename', onClick: () => { setTitleDraft(packlist.title); setRenaming(true); } },
                                { label: 'Duplicate', onClick: handleDuplicate },
                                { label: 'Delete', onClick: openDeleteConfirm, danger: true },
                                // Guests don't get Account or Log out (they couldn't sign back in).
                                ...(isGuest ? [] : [
                                    { label: 'Account', onClick: () => setShowAccount(true) },
                                    { label: 'Log out', onClick: doLogout },
                                ]),
                            ]}
                        />
                    </div>
                </div>
            </header>
            <div className="layout">
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SearchExpandable value={search} onChange={setSearch} alwaysOpen />
                </div>
                <div className="todo-panel packlist-tree-panel">
                    <PacklistTree
                        items={visibleItems}
                        bags={visibleBags}
                        onToggleItem={(id) => {
                            const item = items.find((i) => i.id === id);
                            ChronoRoamApi.updatePacklistItem(packlistId, id, { done: !item.done }).then(applyTree);
                        }}
                        onDeleteItem={(id) => ChronoRoamApi.deletePacklistItem(packlistId, id).then(applyTree)}
                        onRenameItem={(id, text) => ChronoRoamApi.updatePacklistItem(packlistId, id, { text }).then(applyTree)}
                        onUpdateItem={(id, changes) => ChronoRoamApi.updatePacklistItem(packlistId, id, changes).then(applyTree)}
                        onAddItem={(bagId, text, tags) => ChronoRoamApi.addPacklistItem(packlistId, text, bagId, tags).then(applyTree)}
                        onMoveItem={(id, bagId, orderedIds) => ChronoRoamApi.movePacklistItem(packlistId, id, bagId, orderedIds).then(applyTree)}
                        onAddBag={(parentBagId, name, color) => ChronoRoamApi.addPacklistBag(packlistId, parentBagId, name, color).then(applyTree)}
                        onRenameBag={(id, name) => ChronoRoamApi.updatePacklistBag(packlistId, id, { name }).then(applyTree)}
                        onColorBag={(id, color) => ChronoRoamApi.updatePacklistBag(packlistId, id, { color }).then(applyTree)}
                        onDeleteBag={(id) => ChronoRoamApi.deletePacklistBag(packlistId, id).then(applyTree)}
                        onMoveBag={(id, parentBagId, orderedIds) => ChronoRoamApi.movePacklistBag(packlistId, id, parentBagId, orderedIds).then(applyTree)}
                    />
                    <button className="packlist-add-bag-btn packlist-add-bag-btn-circle" title="Add a bag" onClick={() => ChronoRoamApi.addPacklistBag(packlistId, null, 'Name', DEFAULT_BAG_COLOR).then(applyTree)}>
                        <PlusIcon />
                    </button>
                </div>
            </div>

            <footer className="app-footer">
                <Wordmark />
            </footer>
            </div>
            {canForward && (
                <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
            )}
            </div>

            {renaming && (
                <div className="modal-overlay open" {...renameBackdrop}>
                    <div className="modal-box modal-box-flex-scroll">
                        <button type="button" className="modal-close-btn" onClick={() => setRenaming(false)} aria-label="Close">×</button>
                        <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                        {renameCanBack && (
                            <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (renameIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={renameScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                        )}
                        <div key="scroll-body" className="modal-box-outer-scroll-body" ref={renameScrollRef}>
                        <h3>Rename packlist</h3>
                        <input
                            autoFocus
                            placeholder="Name *"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                        />
                        <div className="modal-btns">
                            <button className="cancel" onClick={() => setRenaming(false)}>Cancel</button>
                            <button className="confirm" onClick={handleRename}>Save</button>
                        </div>
                        </div>
                        {renameCanForward && (
                            <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (renameIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={renameScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                        )}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={confirmingDelete}
                onClose={() => setConfirmingDelete(false)}
                onConfirm={handleDelete}
                heading="Delete this packlist?"
                body={deleteWarning}
            />

            <AccountModal open={showAccount} onClose={() => setShowAccount(false)} />

            <ShareModal
                open={showShare}
                onClose={() => setShowShare(false)}
                url={window.location.href}
                heading="Share this packlist"
                kind="packlist"
                publicId={packlistId}
            />

            {AI_FLIGHT_EXTRACTION_ENABLED && (
                <AiPacklistImportModal
                    open={aiImportOpen}
                    onClose={() => setAiImportOpen(false)}
                    packlistId={packlistId}
                    bags={bags}
                    onImported={applyTree}
                />
            )}

            <PurchaseModal open={purchaseOpen} onClose={() => setPurchaseOpen(false)} reason="import" />


            <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} reason={welcomeReason} />
        </div>
    );
}

export default PacklistDetailPage;
