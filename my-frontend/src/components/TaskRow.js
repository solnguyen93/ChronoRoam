import React, { useRef, useState } from 'react';
import { TodoTags, TodoTagBadges } from './TodoTags';
import TaskCatIcon from './TaskCatIcon';
import { markReorderActive, endReorderDrag, beginRowTouchGuard, endRowTouchGuard } from '../utils/reorderGuard';
import { withTimeBadges } from '../utils/taskHelpers';
import { startDragAutoScroll } from '../utils/dragAutoScroll';
import { createDropLine } from '../utils/dropLine';

const REVEAL_THRESHOLD = -128;  // swiped left more than 128px when let go: deletes
const AUTO_DELETE_PX = -300;    // swiped left more than 300px: deletes right away
const MOVE_CANCEL = 8;          // moving more than 8px before the long press starts a swipe or scroll
const LONG_PRESS_MS = 480;      // holding this long starts dragging to reorder
// Marks a drop on the to-do list (instead of a day's date).
const TODO_TARGET = '__todo__';

// One day item or to-do. Swipe left to delete; hold and drag to reorder, or to move it to
// another day or to/from the to-do list. Tapping an item with a category opens its edit form;
// tapping a plain item edits its text in place.
function TaskRow({ task, onToggle, onDelete, onEdit, onMove, onMoveDay, onMoveToTodo, onRename, onUpdateTags, isReorderActive, setReorderActiveId, onInsertAfter, disableSwipe }) {
    const wrapRef = useRef(null);
    const rowRef = useRef(null);
    const gesture = useRef({});
    const suppressClickRef = useRef(false);
    const [renaming, setRenaming] = useState(false);
    const [draftText, setDraftText] = useState(task.text);

    const handleClick = (e) => {
        // Ignores the click the browser sends at the end of a drag or swipe.
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (isReorderActive) return;
        // Ignores taps on the row's empty space (not on its text). On iPhone, opening the text
        // box from such a tap made it close again right away.
        if (e.target === rowRef.current) return;
        if (onEdit) {
            onEdit();
            return;
        }
        if (onRename) {
            setDraftText(task.text);
            setRenaming(true);
        }
    };

    // Saves the edited text. Empty text deletes the item.
    const commitRename = () => {
        setRenaming(false);
        const val = draftText.trim();
        if (!val) {
            onDelete();
            return;
        }
        if (val !== task.text) onRename(val);
    };

    // Handles swipe, drag and scroll from a finger or mouse press on the row (not on the tick
    // circle or link, or while editing the text).
    const handlePointerDown = (e) => {
        if (e.target.closest('.tick') || e.target.closest('.task-link') || renaming) return;
        beginRowTouchGuard();
        const row = rowRef.current;
        const wrap = wrapRef.current;
        const startX = e.clientX;
        const startY = e.clientY;
        const g = { mode: null, autoDeleted: false };
        gesture.current = g;
        row.style.transition = 'none';

        // Stops the page from scrolling while dragging to reorder, but not before, so a quick
        // swipe up or down on a row still scrolls the page. (It has to be a non-passive listener
        // on the touched element to be able to stop scrolling.)
        const onTouchMoveNative = (ev) => { if (g.mode === 'reorder') ev.preventDefault(); };
        wrap.addEventListener('touchmove', onTouchMoveNative, { passive: false });

        let list = null, siblings = [], dragStartIndex = -1, currentTargetIndex = -1, rowHeight = 0;
        // While dragging, only the dragged row moves and a line shows where it will land. Moves
        // are applied at most once per screen frame (rafId, latestEvent).
        let rafId = null;
        let latestEvent = null;
        // The other day under the finger ('YYYY-MM-DD'), or TODO_TARGET over the to-do list, or
        // null over this item's own list.
        let crossDayTargetDate = null;
        // Where in that other list it would be dropped.
        let crossTargetIndex = 0;
        const ownDayDate = task.dayDate?.slice(0, 10);
        // Scrolls the page while the dragged row is held near the top or bottom edge
        // (dragAutoScroll.js). getScrollDelta keeps the row under the finger as the page scrolls.
        let autoScroll = null;
        // The line showing where the row will land (utils/dropLine.js).
        let dropLine = null;

        // Shows the line for a move within the same list: at the top of the row that will come
        // after the dropped row, or below the last row when dropping at the end. isOriginal (the
        // row's own spot, so nothing changes) shows the line in a different color.
        const updateDropLine = () => {
            if (!dropLine) return;
            if (crossDayTargetDate) { dropLine.hide(); return; }
            const isOriginal = currentTargetIndex === dragStartIndex;
            const withoutWrap = siblings.filter((s) => s !== wrap);
            const targetEl = withoutWrap[currentTargetIndex];
            if (targetEl) dropLine.showAt(targetEl, 'top', isOriginal);
            else if (withoutWrap.length) dropLine.showAt(withoutWrap[withoutWrap.length - 1], 'bottom', isOriginal);
            else dropLine.hide();
        };

        // For a drop onto another day or the to-do list: finds the first row whose middle is
        // below the finger (y), sets crossTargetIndex to it and shows the line above it (or
        // below the last row).
        const updateCrossDropLine = (containerRootEl, y) => {
            const listEl = containerRootEl.querySelector('.task-list');
            if (!listEl) { crossTargetIndex = 0; dropLine?.hide(); return; }
            const rows = Array.from(listEl.children).filter((el) => el.classList.contains('task-wrap'));
            if (!rows.length) { crossTargetIndex = 0; dropLine?.showAt(listEl, 'top'); return; }
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i].getBoundingClientRect();
                if (y < r.top + r.height / 2) {
                    crossTargetIndex = i;
                    dropLine?.showAt(rows[i], 'top');
                    return;
                }
            }
            crossTargetIndex = rows.length;
            dropLine?.showAt(rows[rows.length - 1], 'bottom');
        };

        // Shrinks the deleted row's space to 0 while it slides away, so the rows below move up
        // smoothly instead of jumping.
        const collapseHeight = () => {
            wrap.style.height = wrap.offsetHeight + 'px';
            // Reading offsetHeight makes the browser apply the height above first, so the change
            // to 0 animates.
            void wrap.offsetHeight;
            wrap.style.transition = 'height .15s ease';
            wrap.style.height = '0px';
        };

        // Applies the latest pointer position: slides the row for a swipe, or moves the dragged
        // row and works out where it would land.
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
            } else if (g.mode === 'reorder') {
                wrap.style.transform = 'translate(' + dx + 'px, ' + (dy + (autoScroll?.getScrollDelta() ?? 0)) + 'px)';
                // What's under the finger (the dragged row ignores pointer events while dragging,
                // so it isn't found itself).
                const hoveredEl = (onMoveDay || onMoveToTodo) ? document.elementFromPoint(ev.clientX, ev.clientY) : null;

                // Only a day item without a category can be dropped on the to-do list.
                const hoveredTodoEl = (onMoveToTodo && !task.cat)
                    ? hoveredEl?.closest('[data-todo-target]')
                    : null;
                if (hoveredTodoEl) {
                    crossDayTargetDate = TODO_TARGET;
                    updateCrossDropLine(hoveredTodoEl, ev.clientY);
                    return;
                }

                const hoveredDayEl = onMoveDay ? hoveredEl?.closest('[data-day-date]') : null;
                const hoveredDate = hoveredDayEl?.dataset.dayDate || null;

                if (hoveredDate && hoveredDate !== ownDayDate) {
                    crossDayTargetDate = hoveredDate;
                    updateCrossDropLine(hoveredDayEl, ev.clientY);
                    return;
                }
                crossDayTargetDate = null;

                const shift = Math.round(dy / rowHeight);
                currentTargetIndex = Math.max(0, Math.min(siblings.length - 1, dragStartIndex + shift));
                updateDropLine();
            }
        };

        // After holding for LONG_PRESS_MS without moving, starts dragging to reorder.
        const longPressTimer = setTimeout(() => {
            g.mode = 'reorder';
            row.style.transition = 'none';
            list = wrap.parentNode;
            // The list's item rows (not the add box at the end).
            siblings = Array.from(list.children).filter((el) => el.classList.contains('task-wrap'));
            dragStartIndex = siblings.indexOf(wrap);
            currentTargetIndex = dragStartIndex;
            rowHeight = wrap.offsetHeight;
            wrap.style.position = 'relative';
            // Drawn above everything else while dragged.
            wrap.style.zIndex = 9999;
            // Tells the browser the row will move, for smoother dragging (cleared on release).
            wrap.style.willChange = 'transform';
            // So finding what's under the finger doesn't find this row.
            wrap.style.pointerEvents = 'none';
            setReorderActiveId(task.id);
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
                    // With disableSwipe (the side-scrolling day cards, DayCardStrip.js), a
                    // sideways move scrolls the cards instead of swiping.
                    g.mode = disableSwipe ? 'scroll' : 'swipe';
                } else if (Math.abs(dy) > MOVE_CANCEL) {
                    clearTimeout(longPressTimer);
                    g.mode = 'scroll';
                }
            }
            if (g.mode === 'reorder') markReorderActive();
            latestEvent = ev;
            if (rafId === null) rafId = requestAnimationFrame(applyMove);
        };

        // On release: finishes the swipe (delete, or slide back) or the drag (move to the new
        // spot, day or to-do list), and removes the listeners.
        const onUpHandler = (ev) => {
            endRowTouchGuard();
            clearTimeout(longPressTimer);
            if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
            autoScroll?.stop();
            autoScroll = null;
            dropLine?.remove();
            dropLine = null;
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
            } else if (g.mode === 'reorder') {
                setReorderActiveId(null);
                wrap.style.zIndex = '';
                wrap.style.transform = '';
                wrap.style.willChange = '';
                wrap.style.pointerEvents = '';
                if (crossDayTargetDate === TODO_TARGET) {
                    onMoveToTodo?.(task.id, crossTargetIndex);
                } else if (crossDayTargetDate) {
                    onMoveDay?.(task.id, crossDayTargetDate, crossTargetIndex);
                } else if (currentTargetIndex !== dragStartIndex && onMove) {
                    onMove(currentTargetIndex, dragStartIndex);
                }
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
        // page. Cleaning up then too keeps the row from getting stuck mid-drag or mid-swipe.
        window.addEventListener('pointercancel', onUpHandler);
    };

    return (
        <div className="task-wrap" ref={wrapRef}>
            <div className="task-delete-bg">← Delete</div>
            <div
                className={'task' + (task.done ? ' done' : '') + (task.fixed ? ' fixed' : '') + (isReorderActive ? ' reorder-active' : '')}
                ref={rowRef}
                style={{ cursor: 'pointer' }}
                onPointerDown={handlePointerDown}
                onClick={renaming ? undefined : handleClick}
            >
                <div className="tick" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><path d="M4 12l5 5L20 6" /></svg>
                </div>
                {renaming ? (
                    <>
                        {onUpdateTags && <TodoTagBadges tags={task.tags || {}} />}
                        <input
                            className="inline-edit-input"
                            autoFocus
                            autoCapitalize="sentences"
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                // Enter saves and opens a new item box below this one
                                // (TaskList.js). Tapping away just saves.
                                if (e.key === 'Enter') { e.preventDefault(); commitRename(); onInsertAfter?.(task.id); }
                                if (e.key === 'Escape') { setRenaming(false); }
                            }}
                        />
                        {onUpdateTags && <TodoTags text={draftText} onTextChange={setDraftText} />}
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
                    {!task.cat && <TodoTagBadges tags={task.tags || {}} />}
                    <span className="txt">
                        <TaskCatIcon cat={task.cat} fields={task.fields} />
                        {['flight-depart', 'flight-arrive', 'transportation-depart', 'transportation-arrive'].includes(task.cat)
                            ? withTimeBadges(task.text).map((part, i) => (
                                typeof part === 'string' ? part : <span key={i} className="task-time-24h-badge">({part.badge})</span>
                            ))
                            : task.text}
                    </span>
                    </>
                )}
                {task.link && (
                    <a href={task.link} target="_blank" rel="noopener noreferrer" className="task-link" onClick={(e) => e.stopPropagation()}>🔗</a>
                )}
            </div>
        </div>
    );
}

export default TaskRow;
