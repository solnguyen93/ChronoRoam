import React, { useRef, useState } from 'react';
import RecentEmojiButton from './RecentEmojiButton';
import { PACKLIST_SHORTCUT_EMOJI, startsWithEmoji, toggleLeadingEmoji } from '../utils/recentEmoji';
import BatteryWarningBadge from './BatteryWarningBadge';
import { matchesBatteryWarning } from '../utils/batteryWarning';
import { markReorderActive, endReorderDrag, beginRowTouchGuard, endRowTouchGuard } from '../utils/reorderGuard';
import { startDragAutoScroll } from '../utils/dragAutoScroll';
import { createDropLine } from '../utils/dropLine';
import { raiseAncestorBags } from '../utils/packlistStacking';

const LONG_PRESS_MS = 480;      // holding this long starts dragging
const MOVE_CANCEL = 8;          // moving more than 8px before the long press starts a swipe or scroll
const REVEAL_THRESHOLD = -128;  // swiped left more than 128px when let go: deletes
const AUTO_DELETE_PX = -300;    // swiped left more than 300px: deletes right away

// The check mark in the tick circle.
function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" />
        </svg>
    );
}

// The emoji for items that still have the old hot/cold/last-minute tags (see ItemTagBadges).
const HotIcon = () => <span className="tag-emoji" aria-hidden="true">☀️</span>;
const ColdIcon = () => <span className="tag-emoji" aria-hidden="true">❄️</span>;
const LastMinIcon = () => <span className="tag-emoji" aria-hidden="true">⏰</span>;

// The emoji shortcut buttons shown while typing an item (new or existing): ☀️ hot weather,
// ❄️ cold weather, ⏰ pack last-minute, then the recent-emoji button. Tapping one adds that emoji
// to the start of the text, like typing it; tapping it again takes it off. Several can be added.
// `text`/`onTextChange` are the text being typed.
const [HOT, COLD, LAST_MIN] = PACKLIST_SHORTCUT_EMOJI;
const SHORTCUTS = [
    { emoji: HOT, title: 'Hot-weather item', className: 'item-tag-hot' },
    { emoji: COLD, title: 'Cold-weather item', className: 'item-tag-cold' },
    { emoji: LAST_MIN, title: 'Pack last-minute', className: 'item-tag-lastmin' },
];
export function ItemTags({ text, onTextChange }) {
    return (
        <div className="item-tags" onClick={(e) => e.stopPropagation()}>
            {SHORTCUTS.map(({ emoji, title, className }) => (
                <button
                    key={emoji}
                    type="button"
                    className={`item-tag ${className}${startsWithEmoji(text, emoji) ? ' active' : ''}`}
                    title={title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onTextChange(toggleLeadingEmoji(text || '', emoji))}
                >
                    <span className="tag-emoji" aria-hidden="true">{emoji}</span>
                </button>
            ))}
            <RecentEmojiButton scope="packlist" text={text} onTextChange={onTextChange} exclude={PACKLIST_SHORTCUT_EMOJI} />
        </div>
    );
}

// Badges before an item's text: ☀️ ❄️ ⏰ for items saved back when these were separate tags
// (isHot, isCold, isLastMin), and the power bank ⚠️ when isBatteryItem is passed. Shows nothing
// if none apply.
export function ItemTagBadges({ item, isBatteryItem }) {
    if (!item.isHot && !item.isCold && !item.isLastMin && !isBatteryItem) return null;
    return (
        <div className="item-tags item-tags-badges">
            {item.isHot && <span className="item-tag item-tag-hot active" title="Hot-weather item"><HotIcon /></span>}
            {item.isCold && <span className="item-tag item-tag-cold active" title="Cold-weather item"><ColdIcon /></span>}
            {item.isLastMin && <span className="item-tag item-tag-lastmin active" title="Pack last-minute"><LastMinIcon /></span>}
            {isBatteryItem && <BatteryWarningBadge />}
        </div>
    );
}

// One packing list item. Tap to edit its text, swipe left to delete, hold and drag to move it
// within its list or into another bag (the same way day items move in TaskRow.js).
function PacklistItemRow({ item, onToggle, onDelete, onRename, onUpdateTags, onInsertAfter, onDropItem, isReorderActive, setReorderActiveId }) {
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(item.text);
    const wrapRef = useRef(null);
    const rowRef = useRef(null);
    const suppressClickRef = useRef(false);

    // Saves the edited text. Empty text deletes the item.
    const commit = () => {
        setRenaming(false);
        const val = draft.trim();
        if (!val) { onDelete(); return; }
        if (val !== item.text) onRename(val);
    };

    // Whether to show the power bank ⚠️, worked out from the text (utils/batteryWarning.js).
    const isBatteryItem = matchesBatteryWarning(renaming ? draft : item.text);

    const handleClick = (e) => {
        // Ignores the click the browser sends at the end of a drag or swipe.
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (renaming) return;
        // Ignores taps on the row's empty space (not on its text). On iPhone, opening the text
        // box from such a tap made it close again right away.
        if (e.target === rowRef.current) return;
        setDraft(item.text);
        setRenaming(true);
    };

    // Handles swipe, drag and scroll from a press on the row (not on the tick circle, emoji
    // buttons or ×, or while editing).
    const handlePointerDown = (e) => {
        if (e.target.closest('.tick') || e.target.closest('.item-tags') || e.target.closest('.inline-delete-btn') || renaming) return;
        beginRowTouchGuard();
        const row = rowRef.current;
        const wrap = wrapRef.current;
        const startX = e.clientX, startY = e.clientY;
        const g = { mode: null, autoDeleted: false };
        row.style.transition = 'none';

        // Stops the page from scrolling once dragging has started, but not before, so a quick
        // swipe up or down on a row still scrolls the page.
        const onTouchMoveNative = (ev) => { if (g.mode === 'drag') ev.preventDefault(); };
        wrap.addEventListener('touchmove', onTouchMoveNative, { passive: false });

        let rafId = null;
        let latestEvent = null;
        // Undoes raiseAncestorBags (below) when the drag ends.
        let lowerAncestorBags = null;
        // Scrolls the page while the dragged row is held near the top or bottom edge
        // (dragAutoScroll.js). getScrollDelta keeps the row under the finger as the page scrolls.
        let autoScroll = null;
        // The line showing where the item will land. It uses computeDropTarget, the same as the
        // actual drop.
        let dropLine = null;
        // Where the item is now (its bag, null for none, and the item after it, or 'end'), so
        // the line can show in a different color when hovering over its own spot.
        const originalContainerBagId = item.bagId ?? null;
        let originalBeforeItemId = 'end';
        {
            const originalContainerEl = wrap.closest('[data-items-container]');
            const otherItemEls = originalContainerEl
                ? Array.from(originalContainerEl.querySelectorAll(':scope > [data-item-id]')).filter((el) => el !== wrap)
                : [];
            if (!otherItemEls.length) {
                originalBeforeItemId = null;
            } else {
                let nextEl = wrap.nextElementSibling;
                while (nextEl && !nextEl.dataset.itemId) nextEl = nextEl.nextElementSibling;
                originalBeforeItemId = nextEl ? Number(nextEl.dataset.itemId) : 'end';
            }
        }

        // Shrinks the deleted row's space to 0 while it slides away, so the rows below move up
        // smoothly instead of jumping.
        const collapseHeight = () => {
            wrap.style.height = wrap.offsetHeight + 'px';
            void wrap.offsetHeight;
            wrap.style.transition = 'height .15s ease';
            wrap.style.height = '0px';
        };

        // Applies the latest pointer position (at most once per screen frame): slides the row
        // for a swipe, or moves the dragged row and its drop line.
        const applyMove = () => {
            rafId = null;
            const ev = latestEvent;
            if (!ev) return;
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (g.mode === 'swipe' && !g.autoDeleted) {
                const clamped = Math.max(-320, Math.min(0, dx));
                row.style.transform = 'translateX(' + clamped + 'px)';
                if (clamped < AUTO_DELETE_PX) {
                    g.autoDeleted = true;
                    row.style.transition = 'transform .15s ease, opacity .15s ease';
                    row.style.transform = 'translateX(-100%)';
                    row.style.opacity = '0';
                    collapseHeight();
                    setTimeout(() => onDelete(), 150);
                }
            } else if (g.mode === 'drag') {
                wrap.style.transform = 'translate(' + dx + 'px, ' + (dy + (autoScroll?.getScrollDelta() ?? 0)) + 'px)';
                updateDropLine(ev.clientX, ev.clientY);
            }
        };

        // Shows the drop line where the item would land: above the item it would go before, or
        // below the last item of the list when dropping at the end, or at the top of an empty list.
        const updateDropLine = (x, y) => {
            if (!dropLine) return;
            const target = computeDropTarget(x, y);
            if (!target) { dropLine.hide(); return; }
            const isOriginal = target.newBagId === originalContainerBagId && target.beforeItemId === originalBeforeItemId;
            if (target.beforeItemId != null && target.beforeItemId !== 'end') {
                const beforeEl = document.querySelector(`[data-item-id="${target.beforeItemId}"]`);
                if (beforeEl) { dropLine.showAt(beforeEl, 'top', isOriginal); return; }
            }
            const containerSelector = target.newBagId == null ? '[data-items-container="root"]' : `[data-items-container="${target.newBagId}"]`;
            const containerEl = document.querySelector(containerSelector);
            if (!containerEl) { dropLine.hide(); return; }
            const siblingEls = containerEl.querySelectorAll(':scope > [data-item-id]');
            const lastEl = siblingEls[siblingEls.length - 1];
            if (lastEl && lastEl !== wrap) dropLine.showAt(lastEl, 'bottom', isOriginal);
            else if (!lastEl) dropLine.showAt(containerEl, 'top', isOriginal);
            else dropLine.hide();
        };

        // Where the item would land for a pointer at (x, y): { newBagId, beforeItemId }, where
        // newBagId is null for loose items and beforeItemId is an item id, 'end', or null (empty
        // list).
        //   - Over another item: before it if over its top half, after it if over its bottom half.
        //   - Over a list's empty space: next to the nearest item in that list.
        //   - Over nothing: the item's own list.
        // Returns null over the item itself.
        const computeDropTarget = (x, y) => {
            const hoveredEl = document.elementFromPoint(x, y);
            if (!hoveredEl) return null;

            const itemEl = hoveredEl.closest('[data-item-id]');
            if (itemEl) {
                const hoveredItemId = Number(itemEl.dataset.itemId);
                if (hoveredItemId === item.id) return null;
                const containerEl = itemEl.closest('[data-items-container]');
                if (!containerEl) return null;
                const newBagId = containerEl.dataset.itemsContainer === 'root' ? null : Number(containerEl.dataset.itemsContainer);
                const rect = itemEl.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) return { newBagId, beforeItemId: hoveredItemId };
                let nextEl = itemEl.nextElementSibling;
                if (nextEl && Number(nextEl.dataset.itemId) === item.id) nextEl = nextEl.nextElementSibling;
                const nextId = nextEl?.dataset.itemId;
                return { newBagId, beforeItemId: nextId != null ? Number(nextId) : 'end' };
            }

            const containerEl = hoveredEl.closest('[data-items-container]');
            const resolvedContainerEl = containerEl || wrap.closest('[data-items-container]');
            if (!resolvedContainerEl) return null;
            const newBagId = resolvedContainerEl.dataset.itemsContainer === 'root' ? null : Number(resolvedContainerEl.dataset.itemsContainer);

            const siblingEls = Array.from(resolvedContainerEl.querySelectorAll(':scope > [data-item-id]')).filter(
                (el) => Number(el.dataset.itemId) !== item.id,
            );
            if (!siblingEls.length) return { newBagId, beforeItemId: null };

            let nearestEl = siblingEls[0], nearestDist = Infinity, nearestMid = 0;
            for (const el of siblingEls) {
                const r = el.getBoundingClientRect();
                const mid = r.top + r.height / 2;
                const dist = Math.abs(y - mid);
                if (dist < nearestDist) { nearestDist = dist; nearestEl = el; nearestMid = mid; }
            }
            if (y < nearestMid) return { newBagId, beforeItemId: Number(nearestEl.dataset.itemId) };
            const nextEl = siblingEls[siblingEls.indexOf(nearestEl) + 1];
            return { newBagId, beforeItemId: nextEl ? Number(nextEl.dataset.itemId) : 'end' };
        };

        // After holding for LONG_PRESS_MS without moving, starts dragging.
        const longPressTimer = setTimeout(() => {
            g.mode = 'drag';
            row.style.transition = 'none';
            wrap.style.position = 'relative';
            // Drawn above everything else while dragged. An item in a bag also needs every bag
            // it's inside raised (raiseAncestorBags), because each bag has its own stacking
            // layer.
            wrap.style.zIndex = 9999;
            lowerAncestorBags = raiseAncestorBags(wrap);
            wrap.style.willChange = 'transform';
            // So finding what's under the finger doesn't find this row.
            wrap.style.pointerEvents = 'none';
            setReorderActiveId(item.id);
            markReorderActive();
            autoScroll = startDragAutoScroll(wrap, () => latestEvent?.clientY ?? null);
            dropLine = createDropLine();
        }, LONG_PRESS_MS);

        // Before the long press, a sideways move starts a swipe and an up/down move is left to
        // the page to scroll.
        const onMoveHandler = (ev) => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            if (g.mode === null) {
                if (Math.abs(dx) > MOVE_CANCEL && Math.abs(dx) > Math.abs(dy)) {
                    clearTimeout(longPressTimer);
                    g.mode = 'swipe';
                } else if (Math.abs(dy) > MOVE_CANCEL) {
                    clearTimeout(longPressTimer);
                    g.mode = 'scroll';
                }
            }
            if (g.mode === 'drag') markReorderActive();
            latestEvent = ev;
            if (rafId === null) rafId = requestAnimationFrame(applyMove);
        };

        // On release: finishes the swipe (delete, or slide back) or the drag (drops the item where
        // computeDropTarget says), and removes the listeners.
        const onUpHandler = (ev) => {
            endRowTouchGuard();
            clearTimeout(longPressTimer);
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
            autoScroll?.stop();
            autoScroll = null;
            dropLine?.remove();
            dropLine = null;
            lowerAncestorBags?.();
            lowerAncestorBags = null;
            row.style.transition = 'transform .18s ease';
            if (g.mode === 'swipe' && !g.autoDeleted) {
                const dx = ev.clientX - startX;
                if (dx < REVEAL_THRESHOLD) {
                    row.style.transform = 'translateX(-100%)';
                    row.style.opacity = '0';
                    collapseHeight();
                    setTimeout(() => onDelete(), 160);
                } else {
                    row.style.transform = 'translateX(0)';
                }
            } else if (g.mode === 'drag') {
                const dropTarget = computeDropTarget(ev.clientX, ev.clientY);
                setReorderActiveId(null);
                wrap.style.zIndex = '';
                wrap.style.transform = '';
                wrap.style.willChange = '';
                wrap.style.pointerEvents = '';
                if (dropTarget) onDropItem(item.id, dropTarget.newBagId, dropTarget.beforeItemId);
                endReorderDrag();
            }
            suppressClickRef.current = g.mode !== null;
            g.mode = null;
            window.removeEventListener('pointermove', onMoveHandler);
            window.removeEventListener('pointerup', onUpHandler);
            window.removeEventListener('pointercancel', onUpHandler);
            wrap.removeEventListener('touchmove', onTouchMoveNative);
        };
        window.addEventListener('pointermove', onMoveHandler);
        window.addEventListener('pointerup', onUpHandler);
        // The browser cancels the press instead of releasing it when it takes over to scroll the
        // page; cleaning up then too keeps the row from getting stuck.
        window.addEventListener('pointercancel', onUpHandler);
    };

    return (
        <div className="task-wrap" ref={wrapRef} data-item-id={item.id}>
            <div className="task-delete-bg">← Delete</div>
            <div
                ref={rowRef}
                className={'task' + (item.done ? ' done' : '') + (isReorderActive ? ' reorder-active' : '')}
                onPointerDown={handlePointerDown}
                onClick={renaming ? undefined : handleClick}
            >
                <div className="tick" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                    <CheckIcon />
                </div>
                {renaming ? (
                    <>
                        <ItemTagBadges item={item} />
                        <input
                            className="inline-edit-input"
                            autoFocus
                            autoCapitalize="sentences"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                                // Enter saves and opens a new item box right below this one
                                // (PacklistTree.js). Tapping away just saves.
                                if (e.key === 'Enter') { e.preventDefault(); commit(); onInsertAfter?.(item.id); }
                                if (e.key === 'Escape') setRenaming(false);
                            }}
                        />
                        {isBatteryItem && <BatteryWarningBadge />}
                        <ItemTags text={draft} onTextChange={setDraft} />
                        <button
                            className="inline-delete-btn"
                            title="Delete"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); setRenaming(false); onDelete(); }}
                        >
                            ×
                        </button>
                    </>
                ) : (
                    <>
                        <ItemTagBadges item={item} />
                        {/* ⚠️ goes right after the text, not before it with the other badges. */}
                        <span className="txt">{item.text}{isBatteryItem && <BatteryWarningBadge />}</span>
                    </>
                )}
            </div>
        </div>
    );
}

export default PacklistItemRow;
