import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isOnlyEmoji } from '../utils/recentEmoji';
import PacklistItemRow, { ItemTags, ItemTagBadges } from './PacklistItemRow';
import { matchesBatteryWarning } from '../utils/batteryWarning';
import CollapseChevron from './CollapseChevron';
import PlusIcon from './PlusIcon';
import useCollapsedBag from '../hooks/useCollapsedBag';
import { NAMED_BAG_COLORS, textColorForBg } from '../utils/bagColors';
import { markReorderActive, endReorderDrag, beginRowTouchGuard, endRowTouchGuard } from '../utils/reorderGuard';
import { startDragAutoScroll } from '../utils/dragAutoScroll';
import { raiseAncestorBags } from '../utils/packlistStacking';

// Longest bag name allowed.
const BAG_NAME_MAX = 40;
// Longest name shown on the bag's name pill; longer names are cut off with "…" (the full name
// shows when editing it).
const BAG_HANDLE_DISPLAY_MAX = 18;

function truncateBagName(name) {
    return name.length > BAG_HANDLE_DISPLAY_MAX ? `${name.slice(0, BAG_HANDLE_DISPLAY_MAX)}…` : name;
}

// The bag's name pill sits on the bag's top border like a luggage handle. Tapping it opens the
// bag editor (name, color, Delete, Confirm); holding and dragging it moves the bag. The editor
// opens below the pill, or above when there isn't room below; POPOVER_EST_HEIGHT is its rough
// height for that check.
const POPOVER_EST_HEIGHT = 260;
// The editor's width (same as .bag-handle-popover in Planner.css).
const POPOVER_WIDTH = 296;

// The name pill and its editor. onHandlePointerDown starts the hold-and-drag (in
// PacklistBagNode below). dragSuppressRef is set after a drag so the tap that ends it doesn't
// open the editor.
function BagHandle({ bag, isEmpty, onRename, onColor, onDelete, onHandlePointerDown, dragSuppressRef, onOpenChange }) {
    const [open, setOpenRaw] = useState(false);
    // Opens or closes the editor and tells the parent (onOpenChange), which then draws this bag
    // above the bags below it so they don't cover the editor.
    const setOpen = useCallback((val) => { setOpenRaw(val); onOpenChange(val); }, [onOpenChange]);
    const [openDownward, setOpenDownward] = useState(true);
    // The editor's left position relative to the pill, set so it's centered on the page (a
    // deeply nested bag would otherwise push it off the right side).
    const [popoverLeft, setPopoverLeft] = useState(0);
    const [nameDraft, setNameDraft] = useState(bag.name);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const wrapRef = useRef(null);

    // Closes the editor on a click outside it.
    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [open, setOpen]);

    // Opens the editor (unless this tap ended a drag), choosing up or down and centering it.
    const openPopover = () => {
        if (dragSuppressRef.current) { dragSuppressRef.current = false; return; }
        setNameDraft(bag.name);
        setConfirmingDelete(false);
        if (wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setOpenDownward(spaceBelow >= POPOVER_EST_HEIGHT || spaceBelow >= spaceAbove);
            const page = wrapRef.current.closest('.detail-page-scroll-body');
            const pageRect = page ? page.getBoundingClientRect() : { left: 0, width: window.innerWidth };
            const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24);
            setPopoverLeft(pageRect.left + (pageRect.width - width) / 2 - rect.left);
        }
        setOpen(true);
    };
    const close = () => setOpen(false);

    // Delete removes the bag and everything in it for everyone, so a bag with anything in it
    // needs a second tap ("Sure?"). An empty bag deletes on the first tap. Tapping a color or
    // Confirm cancels the "Sure?".
    const handleDeleteClick = () => {
        if (!confirmingDelete && !isEmpty) { setConfirmingDelete(true); return; }
        close();
        onDelete();
    };

    // Saves the name if it changed and isn't blank.
    const commitName = () => {
        const val = nameDraft.trim();
        if (val && val !== bag.name) onRename(val);
    };

    const confirm = () => { commitName(); close(); };

    return (
        <div className="bag-handle-wrap" ref={wrapRef}>
            <button
                className="bag-handle"
                style={{ background: bag.color, color: textColorForBg(bag.color) }}
                onPointerDown={onHandlePointerDown}
                onClick={openPopover}
            >
                {truncateBagName(bag.name)}
            </button>
            {open && (
                <div
                    className={'bag-handle-popover' + (openDownward ? '' : ' bag-handle-popover-up')}
                    style={{ left: popoverLeft }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <input
                        autoFocus
                        maxLength={BAG_NAME_MAX}
                        placeholder="Name *"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
                    />
                    {nameDraft.length >= BAG_NAME_MAX && (
                        <div className="bag-name-warning">Max {BAG_NAME_MAX} characters</div>
                    )}
                    <div className="bag-color-swatches">
                        {NAMED_BAG_COLORS.map((c) => (
                            <button
                                key={c.name}
                                title={c.name}
                                className={'bag-color-swatch' + (c.hex === bag.color ? ' active' : '')}
                                style={{ background: c.hex }}
                                onClick={() => { setConfirmingDelete(false); onColor(c.hex); }}
                            />
                        ))}
                    </div>
                    <div className="bag-handle-choices">
                        <button
                            className={'bag-handle-delete' + (confirmingDelete ? ' bag-handle-delete-confirming' : '')}
                            onClick={handleDeleteClick}
                        >
                            {confirmingDelete ? 'Sure?' : 'Delete'}
                        </button>
                        <button className="bag-handle-confirm" onClick={() => { setConfirmingDelete(false); confirm(); }}>Confirm</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const LONG_PRESS_MS = 480;  // holding the name pill this long starts dragging the bag
const MOVE_CANCEL = 8;      // moving more than 8px before that scrolls the page instead

// One bag: its name pill, + (add a bag inside) and collapse buttons, its items with an add box,
// and the bags inside it (drawn with renderBagList, so bags can be nested). Collapsing hides
// everything inside.
//
// Holding the name pill and dragging moves the bag: only the bag moves while dragging, and where
// it lands is worked out on release (computeDropTarget below). isDescendantBag (from
// PacklistTree) stops a bag from being dropped into itself or a bag inside it.
function PacklistBagNode({
    bag, items, childBags, renderBagList,
    onToggleItem, onDeleteItem, onRenameItem, onUpdateItem, onAddItem,
    onInsertAfterItem, insertAfterId, insertContainerBagId, renderInsertDraftRow,
    onDropItem, isItemReorderActive, setReorderActiveItemId,
    onRenameBag, onColorBag, onDeleteBag, onAddBag,
    isDescendantBag, onDropBag, isReorderActive, setReorderActiveId,
    isElevated, onEditingChange,
}) {
    const [collapsed, setCollapsed] = useCollapsedBag(bag.id);
    const [draft, setDraft] = useState('');
    const [addFocused, setAddFocused] = useState(false);
    const [draftTags, setDraftTags] = useState({});
    const addInputRef = useRef(null);
    const wrapRef = useRef(null);
    const dragSuppressRef = useRef(false);
    // For the add box: a focus counter (see handleAddBlur) and a 300ms guard against adding the
    // same text twice, as in TaskList.js.
    const focusGenerationRef = useRef(0);
    const submittingRef = useRef(false);

    // Adds the typed item to this bag. Ignores empty or emoji-only text. With refocus (Enter)
    // the box stays focused; on blur it doesn't.
    const submitAdd = (refocus = true) => {
        const text = draft.trim();
        if (!text || isOnlyEmoji(text) || submittingRef.current) return;
        submittingRef.current = true;
        onAddItem(text, draftTags);
        setDraft('');
        setDraftTags({});
        if (refocus) addInputRef.current?.focus();
        setTimeout(() => { submittingRef.current = false; }, 300);
    };
    // The add box's id; its row is a <label> for it, so tapping the row focuses it.
    const addInputId = useId();
    // On blur: after 120ms, closes the add box and adds the typed text, unless the box was
    // focused again in the meantime.
    const handleAddBlur = () => {
        const gen = focusGenerationRef.current;
        setTimeout(() => {
            if (focusGenerationRef.current !== gen) return;
            setAddFocused(false);
            submitAdd(false);
        }, 120);
    };

    // Hold-and-drag on the name pill.
    const handleDragPointerDown = (e) => {
        const wrap = wrapRef.current;
        if (!wrap) return;
        beginRowTouchGuard();
        const startX = e.clientX, startY = e.clientY;
        const g = { mode: null };
        wrap.style.transition = 'none';

        // Stops the page from scrolling once dragging has started, but not before.
        const onTouchMoveNative = (ev) => { if (g.mode === 'drag') ev.preventDefault(); };
        wrap.addEventListener('touchmove', onTouchMoveNative, { passive: false });

        let rafId = null;
        let latestEvent = null;
        // Undoes raiseAncestorBags (below) when the drag ends.
        let lowerAncestorBags = null;
        // Scrolls the page while the dragged bag is held near the top or bottom edge
        // (dragAutoScroll.js). getScrollDelta keeps the bag under the finger as the page scrolls.
        let autoScroll = null;

        // Moves the dragged bag with the pointer (at most once per screen frame).
        const applyMove = () => {
            rafId = null;
            const ev = latestEvent;
            if (!ev || g.mode !== 'drag') return;
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            wrap.style.transform = 'translate(' + dx + 'px, ' + (dy + (autoScroll?.getScrollDelta() ?? 0)) + 'px)';
        };

        // How close (in px) to another bag's top or bottom border counts as "next to it" rather
        // than "into it" (see computeDropTarget).
        const EDGE_PX = 20;

        // A drop into one list of bags (childrenEl, belonging to newParentBagId, null for the top
        // level): above the list goes first, below it goes last, otherwise next to the nearest
        // bag (before it if above its middle). Returns null if that list is the dragged bag's own
        // or inside it.
        const resolveWithinContainer = (childrenEl, newParentBagId, y) => {
            if (!childrenEl) return null;
            if (newParentBagId != null && (newParentBagId === bag.id || isDescendantBag(newParentBagId, bag.id))) return null;

            const rect = childrenEl.getBoundingClientRect();
            if (y < rect.top) return { newParentBagId, beforeBagId: null };
            if (y >= rect.bottom) return { newParentBagId, beforeBagId: 'end' };

            const siblingEls = Array.from(childrenEl.children).filter((el) => {
                const id = el.dataset.bagId;
                return id != null && Number(id) !== bag.id && !isDescendantBag(Number(id), bag.id);
            });
            if (!siblingEls.length) return { newParentBagId, beforeBagId: null };

            let nearestEl = siblingEls[0], nearestDist = Infinity, nearestMid = 0;
            for (const el of siblingEls) {
                const r = el.getBoundingClientRect();
                const mid = r.top + r.height / 2;
                const dist = Math.abs(y - mid);
                if (dist < nearestDist) { nearestDist = dist; nearestEl = el; nearestMid = mid; }
            }
            if (y < nearestMid) return { newParentBagId, beforeBagId: Number(nearestEl.dataset.bagId) };
            const nextEl = siblingEls[siblingEls.indexOf(nearestEl) + 1];
            return { newParentBagId, beforeBagId: nextEl ? Number(nextEl.dataset.bagId) : 'end' };
        };

        // Where the bag lands when released at (x, y): { newParentBagId, beforeBagId }, where
        // beforeBagId is a bag id, 'end', or null (first). Over another bag:
        //   - within its items or inner bags area: into that area's bag list
        //   - within EDGE_PX of its top or bottom border: before or after it
        //   - anywhere else on it (e.g. its name pill): into it, first
        // Over empty space: into the list of bags there. Over nothing in the list: the top level.
        // Returns null over the dragged bag itself or a bag inside it.
        const computeDropTarget = (x, y) => {
            // The dragged bag ignores pointer events while dragging, so this finds what's under it.
            const hoveredEl = document.elementFromPoint(x, y);
            if (!hoveredEl) return null;

            const bagCardEl = hoveredEl.closest('[data-bag-id]');
            if (bagCardEl) {
                const hoveredBagId = Number(bagCardEl.dataset.bagId);
                const ineligible = hoveredBagId === bag.id || isDescendantBag(hoveredBagId, bag.id);
                if (ineligible) return null;

                // A collapsed bag has no items area, so every point on it uses the rules below.
                const ownBodyEl = bagCardEl.querySelector(':scope > .packlist-bag-body');
                if (ownBodyEl && ownBodyEl.contains(hoveredEl)) {
                    return resolveWithinContainer(ownBodyEl.querySelector(':scope > [data-parent-bag-id]'), hoveredBagId, y);
                }

                const rect = bagCardEl.getBoundingClientRect();
                const nearTop = y - rect.top < EDGE_PX;
                const nearBottom = rect.bottom - y < EDGE_PX;
                if (!nearTop && !nearBottom) {
                    return { newParentBagId: hoveredBagId, beforeBagId: null };
                }

                // Near the border: goes before or after this bag in the list it's in.
                const parentContainerEl = bagCardEl.parentElement;
                const newParentBagId = parentContainerEl.dataset.parentBagId === 'root' ? null : Number(parentContainerEl.dataset.parentBagId);
                if (nearTop) {
                    return { newParentBagId, beforeBagId: hoveredBagId };
                }
                let nextEl = bagCardEl.nextElementSibling;
                if (nextEl && Number(nextEl.dataset.bagId) === bag.id) nextEl = nextEl.nextElementSibling;
                const nextId = nextEl?.dataset.bagId;
                return { newParentBagId, beforeBagId: nextId != null ? Number(nextId) : 'end' };
            }

            // Not over a bag: the list of bags under the pointer, if any.
            const containerEl = hoveredEl.closest('[data-parent-bag-id]');
            if (containerEl) {
                const newParentBagId = containerEl.dataset.parentBagId === 'root' ? null : Number(containerEl.dataset.parentBagId);
                return resolveWithinContainer(containerEl, newParentBagId, y);
            }

            // Otherwise, the top-level bags of the list this bag is in.
            const treeEl = wrap.closest('.packlist-tree');
            const rootChildrenEl = treeEl?.querySelector(':scope > [data-parent-bag-id]');
            return resolveWithinContainer(rootChildrenEl, null, y);
        };

        // After holding for LONG_PRESS_MS without moving, starts dragging.
        const longPressTimer = setTimeout(() => {
            g.mode = 'drag';
            wrap.style.transition = 'none';
            wrap.style.position = 'relative';
            // Drawn above everything else while dragged, including raising any bags it's inside
            // (each bag has its own stacking layer).
            wrap.style.zIndex = 9999;
            lowerAncestorBags = raiseAncestorBags(wrap);
            wrap.style.willChange = 'transform';
            wrap.style.pointerEvents = 'none';
            setReorderActiveId(bag.id);
            markReorderActive();
            autoScroll = startDragAutoScroll(wrap, () => latestEvent?.clientY ?? null);
        }, LONG_PRESS_MS);

        // Moving before the long press cancels the drag, leaving the page to scroll.
        const onMoveHandler = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (g.mode === null && (Math.abs(dx) > MOVE_CANCEL || Math.abs(dy) > MOVE_CANCEL)) {
                clearTimeout(longPressTimer);
                g.mode = 'scroll';
            }
            if (g.mode === 'drag') markReorderActive();
            latestEvent = ev;
            if (rafId === null) rafId = requestAnimationFrame(applyMove);
        };

        // On release: drops the bag where computeDropTarget says and removes the listeners.
        const onUpHandler = (ev) => {
            endRowTouchGuard();
            clearTimeout(longPressTimer);
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
            autoScroll?.stop();
            autoScroll = null;
            lowerAncestorBags?.();
            lowerAncestorBags = null;
            if (g.mode === 'drag') {
                const dropTarget = computeDropTarget(ev.clientX, ev.clientY);
                wrap.style.transition = 'transform .18s ease';
                setReorderActiveId(null);
                wrap.style.zIndex = '';
                wrap.style.transform = '';
                wrap.style.willChange = '';
                wrap.style.pointerEvents = '';
                if (dropTarget) onDropBag(bag.id, dropTarget.newParentBagId, dropTarget.beforeBagId);
                endReorderDrag();
            }
            dragSuppressRef.current = g.mode !== null;
            g.mode = null;
            window.removeEventListener('pointermove', onMoveHandler);
            window.removeEventListener('pointerup', onUpHandler);
            window.removeEventListener('pointercancel', onUpHandler);
            wrap.removeEventListener('touchmove', onTouchMoveNative);
        };
        window.addEventListener('pointermove', onMoveHandler);
        window.addEventListener('pointerup', onUpHandler);
        // The browser cancels the press instead of releasing it when it takes over to scroll the
        // page; cleaning up then too keeps the bag from getting stuck.
        window.addEventListener('pointercancel', onUpHandler);
    };

    return (
        <div
            ref={wrapRef}
            data-bag-id={bag.id}
            style={{ borderColor: bag.color }}
            className={'packlist-bag' + (isElevated ? ' packlist-bag-editing' : '') + (isReorderActive ? ' reorder-active' : '')}
        >
            <div className="packlist-bag-top">
                <BagHandle
                    bag={bag}
                    isEmpty={items.length === 0 && childBags.length === 0}
                    onRename={onRenameBag}
                    onColor={onColorBag}
                    onDelete={onDeleteBag}
                    onHandlePointerDown={handleDragPointerDown}
                    dragSuppressRef={dragSuppressRef}
                    onOpenChange={onEditingChange}
                />
                <div className="packlist-bag-top-actions" style={{ background: bag.color, color: textColorForBg(bag.color) }}>
                    <button onClick={onAddBag}>
                        <PlusIcon />
                    </button>
                    <button onClick={() => setCollapsed(!collapsed)}>
                        <CollapseChevron collapsed={collapsed} />
                    </button>
                </div>
            </div>

            {!collapsed && (
                <div className="packlist-bag-body">
                    <div className="packlist-bag-items" data-items-container={bag.id}>
                        {items.map((item) => (
                            <React.Fragment key={item.id}>
                                <PacklistItemRow
                                    item={item}
                                    onToggle={() => onToggleItem(item.id)}
                                    onDelete={() => onDeleteItem(item.id)}
                                    onRename={(text) => onRenameItem(item.id, text)}
                                    onUpdateTags={(changes) => onUpdateItem(item.id, changes)}
                                    onInsertAfter={onInsertAfterItem}
                                    onDropItem={onDropItem}
                                    isReorderActive={isItemReorderActive === item.id}
                                    setReorderActiveId={setReorderActiveItemId}
                                />
                                {insertAfterId === item.id && insertContainerBagId === bag.id && renderInsertDraftRow()}
                            </React.Fragment>
                        ))}
                        <label className={'task add-task-row' + (draft || addFocused ? ' active' : '')} htmlFor={addInputId}>
                            {(draft || addFocused) ? <span className="tick" /> : <span className="add-task-plus">+</span>}
                            <input
                                id={addInputId}
                                ref={addInputRef}
                                autoCapitalize="sentences"
                                className="add-task-input"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
                                onFocus={() => { focusGenerationRef.current += 1; setAddFocused(true); }}
                                onBlur={handleAddBlur}
                            />
                            {(draft || addFocused) && (
                                <>
                                    <ItemTagBadges item={draftTags} isBatteryItem={matchesBatteryWarning(draft)} />
                                    <ItemTags text={draft} onTextChange={setDraft} />
                                </>
                            )}
                        </label>
                        {(draft || addFocused) && (
                            <label className="add-task-plus add-task-plus-trailing" htmlFor={addInputId}>+</label>
                        )}
                    </div>

                    <div className="packlist-bag-children" data-parent-bag-id={bag.id}>
                        {renderBagList(childBags)}
                    </div>
                </div>
            )}
        </div>
    );
}

export default PacklistBagNode;
