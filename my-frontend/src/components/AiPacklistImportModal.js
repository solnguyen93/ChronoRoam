import React, { useState } from 'react';
import ChronoRoamApi from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';
import { DEFAULT_BAG_COLOR } from '../utils/bagColors';

// The Import packing list popup: paste a list, AI splits it into headings and items (one credit,
// see the server's aiPacklistExtraction.js), and they're added straight away — each heading
// becomes a bag, a sub-heading becomes a bag inside it (an existing bag with the same name at that
// spot is reused), and items go in their bag. Mistakes are fixed afterwards like any other item.
// tripId is set when opened from a trip's linked packing list (those use the trip's routes).
function AiPacklistImportModal({ open, onClose, tripId, packlistId, bags, onImported }) {
    const [text, setText] = useState('');
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [empty, setEmpty] = useState(false);
    const backdrop = useBackdropDismiss(handleClose);
    // Up/down scroll arrows instead of a scrollbar (see useScrollArrows).
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [empty, error]);

    if (!open) return null;

    // Clears the popup and closes it.
    function handleClose() {
        setText('');
        setError('');
        setEmpty(false);
        onClose();
    }

    // This packing list's bags from a server reply (a trip's reply has every linked list).
    function extractBags(tree) {
        if (!tripId) return tree.bags;
        return tree.packlists.find((p) => p.packlist.publicId === packlistId)?.bags || [];
    }

    // Adds a bag or an item, through the trip's routes when opened from a trip.
    function addBag(parentBagId, name, color) {
        return tripId
            ? ChronoRoamApi.addTripPacklistBag(tripId, packlistId, parentBagId, name, color)
            : ChronoRoamApi.addPacklistBag(packlistId, parentBagId, name, color);
    }

    function addItem(itemText, bagId) {
        return tripId
            ? ChronoRoamApi.addTripPacklistItem(tripId, packlistId, itemText, bagId)
            : ChronoRoamApi.addPacklistItem(packlistId, itemText, bagId);
    }

    // Finds a bag by name (ignoring case) inside parentBagId, or creates it. Returns
    // { bagId, bags: the updated bag list, tree: the server's reply if one was created }.
    async function ensureBag(currentBags, name, parentBagId) {
        const trimmed = name.trim();
        const existing = currentBags.find((b) => b.name.trim().toLowerCase() === trimmed.toLowerCase() && (b.parentBagId || null) === (parentBagId || null));
        if (existing) return { bagId: existing.id, bags: currentBags, tree: null };
        const tree = await addBag(parentBagId, trimmed, DEFAULT_BAG_COLOR);
        const newBags = extractBags(tree);
        const created = newBags.find((b) => b.name === trimmed && (b.parentBagId || null) === (parentBagId || null) && !currentBags.some((old) => old.id === b.id));
        return { bagId: created ? created.id : null, bags: newBags, tree };
    }

    // Sends the text to the AI, then adds the bags and items in order.
    async function handleImport() {
        if (!text.trim()) return;
        setImporting(true);
        setError('');
        setEmpty(false);
        try {
            const { groups } = await ChronoRoamApi.extractPacklistItems(text);
            if (!groups || groups.length === 0) {
                setEmpty(true);
                return;
            }

            let currentBags = bags;
            let tree = null;
            for (const group of groups) {
                let parentBagId = null;
                if (group.groupName.trim()) {
                    const result = await ensureBag(currentBags, group.groupName, null);
                    parentBagId = result.bagId;
                    currentBags = result.bags;
                    if (result.tree) tree = result.tree;
                }
                for (const sub of group.subgroups) {
                    let bagId = parentBagId;
                    if (sub.subgroupName.trim()) {
                        const result = await ensureBag(currentBags, sub.subgroupName, parentBagId);
                        bagId = result.bagId;
                        currentBags = result.bags;
                        if (result.tree) tree = result.tree;
                    }
                    for (const itemText of sub.items) {
                        tree = await addItem(itemText, bagId);
                    }
                }
            }
            onImported(tree);
            handleClose();
        } catch (err) {
            setError(err.response?.data?.message || "Couldn't extract items from that text. Try again, or add items manually.");
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="modal-overlay modal-overlay-top open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll">
                <button type="button" className="modal-close-btn" onClick={handleClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>Import packlist</h3>
                <p className="modal-sub">Paste your packlist or checklist below — we'll add it straight to this packlist. Each header becomes a bag (a header nested inside another becomes a bag inside it); fix any mistakes afterward the same way you'd edit anything else here. Each import uses 1 credit, even if nothing is found.</p>
                <textarea
                    className="ai-import-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your packlist or checklist here…"
                    rows={12}
                />
                {empty && <p className="modal-sub">Nothing found in that text — try a different excerpt, or add items manually.</p>}
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-btns">
                    <button className="cancel" onClick={handleClose} disabled={importing}>Cancel</button>
                    <button className="confirm" onClick={handleImport} disabled={!text.trim() || importing}>
                        {importing ? 'Importing…' : 'Import'}
                    </button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
    );
}

export default AiPacklistImportModal;
