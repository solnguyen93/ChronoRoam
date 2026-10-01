import React, { useState } from 'react';
import PacklistTree from './PacklistTree';
import LinkPacklistModal from './LinkPacklistModal';
import AiPacklistImportModal from './AiPacklistImportModal';
import CollapseChevron from './CollapseChevron';
import OptionsMenu from './OptionsMenu';
import PlusIcon from './PlusIcon';
import SearchExpandable from './SearchExpandable';
import { DEFAULT_BAG_COLOR } from '../utils/bagColors';
import { filterPacklistTree } from '../utils/packlistSearch';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import SharedBadge from './SharedBadge';
import useCollapsedPacklist from '../hooks/useCollapsedPacklist';

// One linked packing list on the trip page: its header, search, ⋮ menu and bags. Each card keeps
// its own collapsed / search / rename state.
function LinkedPacklistSection({
    tripId, packlist, items, bags, onUnlink, onRenamePacklist, onUncheckAll, onDuplicateAndLink, onOpenLink,
    onUpdateItem, onDeleteItem, onAddItem, onMoveItem,
    onAddBag, onUpdateBag, onDeleteBag, onMoveBag, onImported,
}) {
    const [collapsed, setCollapsed] = useCollapsedPacklist(packlist.id);
    const [search, setSearch] = useState('');
    const [renaming, setRenaming] = useState(false);
    const [renameDraft, setRenameDraft] = useState('');
    const [aiImportOpen, setAiImportOpen] = useState(false);
    const [hideChecked, setHideChecked] = useState(false);
    const renameBackdrop = useBackdropDismiss(() => setRenaming(false));

    const baseItems = hideChecked ? items.filter((i) => !i.done) : items;
    const { items: visibleItems, bags: visibleBags } = filterPacklistTree(baseItems, bags, search);

    const submitRename = () => {
        const title = renameDraft.trim();
        setRenaming(false);
        if (title && title !== packlist.title) onRenamePacklist(packlist.publicId, title);
    };

    return (
        <div className={'todo-panel' + (collapsed ? ' todo-collapsed' : '')}>
            <div className="panel-head packlist-panel-head">
                <h2>Packlist: {packlist.title}</h2>
                <SharedBadge memberCount={packlist.memberCount} kind="packlist" />
                {!collapsed && (
                    <div style={{ marginLeft: 'auto' }}>
                        <SearchExpandable value={search} onChange={setSearch} />
                    </div>
                )}
                <div className="packlist-head-actions" style={{ marginLeft: collapsed ? 'auto' : 0 }}>
                    <OptionsMenu
                        title="Packlist options"
                        light
                        items={[
                            { label: 'Import packlist', onClick: () => setAiImportOpen(true) },
                            { label: 'Rename', onClick: () => { setRenameDraft(packlist.title); setRenaming(true); } },
                            { label: 'Uncheck all', onClick: () => onUncheckAll(packlist.publicId) },
                            // Swaps this list for the user's own copy on this trip; others on the trip keep the original.
                            { label: 'Duplicate', onClick: () => onDuplicateAndLink(packlist.publicId, true).catch((err) => window.alert(err.response?.data?.message || "Couldn't duplicate this packlist.")) },
                            { label: 'Unlink packlist', onClick: () => onUnlink(packlist.publicId) },
                            { label: 'Link additional packlist', onClick: onOpenLink },
                            { label: hideChecked ? 'Show checked off' : 'Hide checked off', onClick: () => setHideChecked((h) => !h) },
                        ]}
                    />
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                        <CollapseChevron collapsed={collapsed} size={13} />
                    </button>
                </div>
            </div>
            {!collapsed && (
                <div className="packlist-tree-panel">
                    <PacklistTree
                        items={visibleItems}
                        bags={visibleBags}
                        onToggleItem={(id) => { const item = items.find((i) => i.id === id); onUpdateItem(packlist.publicId, id, { done: !item.done }); }}
                        onDeleteItem={(id) => onDeleteItem(packlist.publicId, id)}
                        onRenameItem={(id, text) => onUpdateItem(packlist.publicId, id, { text })}
                        onUpdateItem={(id, changes) => onUpdateItem(packlist.publicId, id, changes)}
                        onAddItem={(bagId, text, tags) => onAddItem(packlist.publicId, bagId, text, tags)}
                        onMoveItem={(id, bagId, orderedIds) => onMoveItem(packlist.publicId, id, bagId, orderedIds)}
                        onAddBag={(parentBagId, name, color) => onAddBag(packlist.publicId, parentBagId, name, color)}
                        onRenameBag={(id, name) => onUpdateBag(packlist.publicId, id, { name })}
                        onColorBag={(id, color) => onUpdateBag(packlist.publicId, id, { color })}
                        onDeleteBag={(id) => onDeleteBag(packlist.publicId, id)}
                        onMoveBag={(id, parentBagId, orderedIds) => onMoveBag(packlist.publicId, id, parentBagId, orderedIds)}
                    />
                    <button className="packlist-add-bag-btn packlist-add-bag-btn-circle" onClick={() => onAddBag(packlist.publicId, null, 'Name', DEFAULT_BAG_COLOR)}><PlusIcon /></button>
                </div>
            )}

            {renaming && (
                <div className="modal-overlay open" {...renameBackdrop}>
                    <div className="modal-box">
                        <button type="button" className="modal-close-btn" onClick={() => setRenaming(false)} aria-label="Close">×</button>
                        <h3>Rename packlist</h3>
                        <input
                            autoFocus
                            autoCapitalize="sentences"
                            placeholder="Name *"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); }}
                        />
                        <div className="modal-btns">
                            <button className="cancel" onClick={() => setRenaming(false)}>Cancel</button>
                            <button className="confirm" onClick={submitRename}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            <AiPacklistImportModal
                open={aiImportOpen}
                onClose={() => setAiImportOpen(false)}
                tripId={tripId}
                packlistId={packlist.publicId}
                bags={bags}
                onImported={onImported}
            />
        </div>
    );
}

// The trip's linked packing lists, shown as stacked cards above the to-do list. With none linked it
// shows a "+ Link a packlist" button; after that, linking another is in each card's ⋮ menu. Each
// trip member has their own set of linked lists: linking, unlinking or Duplicate only changes this
// user's view. Edits change the packing list itself, so everyone using it sees them.
function LinkedPacklistPanel({
    tripId, packlists, onLink, onDuplicateAndLink, onUnlink, onRenamePacklist, onUncheckAll,
    onUpdateItem, onDeleteItem, onAddItem, onMoveItem,
    onAddBag, onUpdateBag, onDeleteBag, onMoveBag, onImported,
}) {
    const [linking, setLinking] = useState(false);

    return (
        <>
            {packlists.map(({ packlist, items, bags }) => (
                <LinkedPacklistSection
                    key={packlist.publicId}
                    tripId={tripId}
                    packlist={packlist}
                    items={items}
                    bags={bags}
                    onUnlink={onUnlink}
                    onRenamePacklist={onRenamePacklist}
                    onUncheckAll={onUncheckAll}
                    onDuplicateAndLink={onDuplicateAndLink}
                    onUpdateItem={onUpdateItem}
                    onDeleteItem={onDeleteItem}
                    onAddItem={onAddItem}
                    onMoveItem={onMoveItem}
                    onAddBag={onAddBag}
                    onUpdateBag={onUpdateBag}
                    onDeleteBag={onDeleteBag}
                    onMoveBag={onMoveBag}
                    onImported={onImported}
                    onOpenLink={() => setLinking(true)}
                />
            ))}
            {packlists.length === 0 && (
                <button className="link-packlist-btn" onClick={() => setLinking(true)}>+ Link a packlist</button>
            )}
            <LinkPacklistModal
                open={linking}
                onClose={() => setLinking(false)}
                onLink={onLink}
                onDuplicateAndLink={onDuplicateAndLink}
                alreadyLinkedIds={packlists.map((p) => p.packlist.id)}
                everyoneLinkedIds={packlists.filter((p) => p.packlist.forEveryone).map((p) => p.packlist.id)}
            />
        </>
    );
}

export default LinkedPacklistPanel;
