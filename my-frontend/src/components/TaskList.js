import React, { useId, useRef, useState } from 'react';
import { isOnlyEmoji } from '../utils/recentEmoji';
import { TodoTags } from './TodoTags';
import TaskRow from './TaskRow';

// A list of items (the to-do list, or one day's plan) that can be reordered and swiped. The
// last row is the add box: a "+" that turns into a text box when tapped. Enter adds the item
// above it and keeps the box open for the next one.
function TaskList({ items, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, disableSwipe }) {
    const [reorderActiveId, setReorderActiveId] = useState(null);
    const [draft, setDraft] = useState('');
    const [addFocused, setAddFocused] = useState(false);
    const addInputRef = useRef(null);
    // Counts how many times the add box has been focused. See handleAddBlur.
    const focusGenerationRef = useRef(0);
    // True for 300ms after adding, so a second add of the same text right after (Enter and a
    // blur both firing, which happens with phone keyboards) is ignored.
    const submittingRef = useRef(false);
    // The add box's id. The row is a <label> for it, so tapping anywhere on the row focuses the
    // text box without JavaScript (calling .focus() from a tap was unreliable on iPhone).
    const addInputId = useId();

    // Adds the typed item. Ignores empty text and text that's only emoji. With refocus (Enter)
    // the box stays focused for the next item; on blur (tapping away) it doesn't.
    const submitAdd = (refocus = true) => {
        const text = draft.trim();
        if (!text || isOnlyEmoji(text) || submittingRef.current) return;
        submittingRef.current = true;
        onAdd(text);
        setDraft('');
        if (refocus) addInputRef.current?.focus();
        setTimeout(() => { submittingRef.current = false; }, 300);
    };

    // When the add box loses focus: after 120ms, closes it and adds the typed text. If the box
    // was focused again in the meantime (the focus count changed), does nothing, so tapping "+"
    // quickly doesn't make it open and close.
    const handleAddBlur = () => {
        const gen = focusGenerationRef.current;
        setTimeout(() => {
            if (focusGenerationRef.current !== gen) return;
            setAddFocused(false);
            submitAdd(false);
        }, 120);
    };

    // Enter on an item (TaskRow's onInsertAfter) opens a new text box right below it.
    // insertAfterId is the item it's below; nothing is saved until text is entered (like
    // PacklistTree.js's version for packing lists).
    const [insertAfterId, setInsertAfterId] = useState(null);
    const [insertDraftText, setInsertDraftText] = useState('');

    const startInsertAfter = (afterId) => {
        setInsertAfterId(afterId);
        setInsertDraftText('');
    };
    const cancelInsertAfter = () => setInsertAfterId(null);

    // Saves the text as a new item and moves it right after insertAfterId. With refocus (Enter)
    // a new box opens below the new item; on blur the box closes. Empty text closes the box.
    // Emoji-only text isn't saved: Enter keeps the box open, blur closes it.
    const submitInsertAfter = async (refocus) => {
        const text = insertDraftText.trim();
        const afterId = insertAfterId;
        if (!text || (isOnlyEmoji(text) && !refocus)) { cancelInsertAfter(); return; }
        if (isOnlyEmoji(text)) return;
        setInsertDraftText('');
        const created = await onAdd(text);
        if (!created) { setInsertAfterId(null); return; }
        const orderedIds = items.map((t) => t.id);
        const afterIdx = orderedIds.indexOf(afterId);
        orderedIds.splice(afterIdx === -1 ? orderedIds.length : afterIdx + 1, 0, created.id);
        await onReorder(orderedIds);
        if (refocus) setInsertAfterId(created.id);
        else setInsertAfterId(null);
    };

    // The text box shown below an item for "insert after".
    const renderInsertDraftRow = () => (
        <div className="task add-task-row active">
            <span className="tick" />
            <input
                autoFocus
                autoCapitalize="sentences"
                className="add-task-input"
                value={insertDraftText}
                onChange={(e) => setInsertDraftText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') submitInsertAfter(true);
                    if (e.key === 'Escape') cancelInsertAfter();
                }}
                onBlur={() => submitInsertAfter(false)}
            />
            {onUpdateTags && (
                <TodoTags text={insertDraftText} onTextChange={setInsertDraftText} />
            )}
        </div>
    );

    // Moves an item from oldIndex to newIndex and saves the new order.
    const handleMove = (newIndex, oldIndex) => {
        const ids = items.map((t) => t.id);
        const [moved] = ids.splice(oldIndex, 1);
        ids.splice(newIndex, 0, moved);
        onReorder(ids);
    };

    return (
        <div className="task-list">
            {items.map((item) => (
                <React.Fragment key={item.id}>
                    <TaskRow
                        task={item}
                        isReorderActive={reorderActiveId === item.id}
                        setReorderActiveId={setReorderActiveId}
                        onToggle={() => onToggle(item.id)}
                        onDelete={() => onDelete(item.id)}
                        onMove={handleMove}
                        onMoveDay={onMoveDay}
                        onMoveToTodo={onMoveToTodo}
                        onEdit={item.cat ? () => onEditCat(item.id) : null}
                        onRename={!item.cat ? (text) => onRename(item.id, text) : null}
                        onUpdateTags={!item.cat && onUpdateTags ? (tags) => onUpdateTags(item.id, tags) : null}
                        disableSwipe={disableSwipe}
                        onInsertAfter={startInsertAfter}
                    />
                    {insertAfterId === item.id && renderInsertDraftRow()}
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }}
                    onFocus={() => { focusGenerationRef.current += 1; setAddFocused(true); }}
                    onBlur={handleAddBlur}
                />
                {onUpdateTags && (draft || addFocused) && (
                    <TodoTags text={draft} onTextChange={setDraft} />
                )}
            </label>
            {/* While typing in the add box, a "+" below it too (tapping it also focuses the
                box). */}
            {(draft || addFocused) && (
                <label className="add-task-plus add-task-plus-trailing" htmlFor={addInputId}>+</label>
            )}
        </div>
    );
}

export default TaskList;
