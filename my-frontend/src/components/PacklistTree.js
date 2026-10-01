import React, { useId, useMemo, useRef, useState } from 'react';
import { isOnlyEmoji } from '../utils/recentEmoji';
import PacklistItemRow, { ItemTags, ItemTagBadges } from './PacklistItemRow';
import { matchesBatteryWarning } from '../utils/batteryWarning';
import PacklistBagNode from './PacklistBagNode';
import { DEFAULT_BAG_COLOR } from '../utils/bagColors';

// Groups items or bags by the bag they're in (key is 'bagId' or 'parentBagId'; 'root' for none),
// each group sorted by position.
function groupByContainer(list, key) {
    const map = {};
    for (const x of list) {
        const k = x[key] == null ? 'root' : String(x[key]);
        if (!map[k]) map[k] = [];
        map[k].push(x);
    }
    for (const k in map) map[k].sort((a, b) => a.position - b.position);
    return map;
}

// One packing list: its loose items with an add box, then its bags (each bag can hold items and
// more bags, see PacklistBagNode.js). Items and bags are reordered by holding and dragging (the
// same way as day items in TaskRow.js); only the dragged row moves while dragging, and the drop
// spot is found from what's under the finger.
function PacklistTree({
    items, bags,
    onAddItem, onToggleItem, onDeleteItem, onRenameItem, onUpdateItem, onMoveItem,
    onAddBag, onRenameBag, onColorBag, onDeleteBag, onMoveBag,
}) {
    const [rootDraft, setRootDraft] = useState('');
    const [rootAddFocused, setRootAddFocused] = useState(false);
    const [rootDraftTags, setRootDraftTags] = useState({});
    const rootAddInputRef = useRef(null);
    // The add box for loose items works like TaskList.js's: a focus counter (see
    // handleRootAddBlur) and a 300ms guard against adding the same text twice.
    const rootFocusGenerationRef = useRef(0);
    const rootSubmittingRef = useRef(false);
    // Adds the typed item to the list (not in a bag). Ignores empty or emoji-only text. With
    // refocus (Enter) the box stays focused; on blur it doesn't.
    const submitRootAdd = (refocus = true) => {
        const text = rootDraft.trim();
        if (!text || isOnlyEmoji(text) || rootSubmittingRef.current) return;
        rootSubmittingRef.current = true;
        onAddItem(null, text, rootDraftTags);
        setRootDraft('');
        setRootDraftTags({});
        if (refocus) rootAddInputRef.current?.focus();
        setTimeout(() => { rootSubmittingRef.current = false; }, 300);
    };
    // The add box's id; its row is a <label> for it, so tapping the row focuses it.
    const rootAddInputId = useId();
    // On blur: after 120ms, closes the add box and adds the typed text, unless the box was
    // focused again in the meantime.
    const handleRootAddBlur = () => {
        const gen = rootFocusGenerationRef.current;
        setTimeout(() => {
            if (rootFocusGenerationRef.current !== gen) return;
            setRootAddFocused(false);
            submitRootAdd(false);
        }, 120);
    };
    // The bag and item currently being dragged, and the bag whose name/color editor is open.
    const [reorderActiveBagId, setReorderActiveBagId] = useState(null);
    const [reorderActiveItemId, setReorderActiveItemId] = useState(null);
    const [openBagId, setOpenBagId] = useState(null);

    // Enter on an item (PacklistItemRow's onInsertAfter) opens a new text box right below it:
    // insertAfterId is that item, insertContainerBagId the bag it's in (null for loose items).
    // Nothing is saved until text is entered.
    const [insertAfterId, setInsertAfterId] = useState(null);
    const [insertContainerBagId, setInsertContainerBagId] = useState(null);
    const [insertDraftText, setInsertDraftText] = useState('');
    const [insertDraftTags, setInsertDraftTags] = useState({});

    const startInsertAfter = (afterItemId, containerBagId) => {
        setInsertAfterId(afterItemId);
        setInsertContainerBagId(containerBagId);
        setInsertDraftText('');
        setInsertDraftTags({});
    };
    const cancelInsertAfter = () => {
        setInsertAfterId(null);
        setInsertDraftText('');
        setInsertDraftTags({});
    };

    // Saves the text as a new item in the same bag, then moves it right after insertAfterId (the
    // server adds new items at the end). The new item is found in the list returned by the add
    // call, since `items` doesn't have it yet. With refocus (Enter) a new box opens below the new
    // item; on blur the box closes. Empty text closes the box; emoji-only text isn't saved (Enter
    // keeps the box open, blur closes it).
    const submitInsertAfter = async (refocus) => {
        const text = insertDraftText.trim();
        const afterItemId = insertAfterId;
        const containerBagId = insertContainerBagId;
        const tags = insertDraftTags;
        if (!text || (isOnlyEmoji(text) && !refocus)) { cancelInsertAfter(); return; }
        if (isOnlyEmoji(text)) return;
        setInsertDraftText('');
        setInsertDraftTags({});
        const result = await onAddItem(containerBagId, text, tags);
        if (!result) { setInsertAfterId(null); return; }
        const container = (result.items || [])
            .filter((it) => (it.bagId ?? null) === containerBagId)
            .sort((a, b) => a.position - b.position);
        const newItem = container[container.length - 1]; // the new item is last in its bag
        if (!newItem) { setInsertAfterId(null); return; }
        const orderedIds = container.filter((it) => it.id !== newItem.id).map((it) => it.id);
        const afterIdx = orderedIds.indexOf(afterItemId);
        orderedIds.splice(afterIdx === -1 ? orderedIds.length : afterIdx + 1, 0, newItem.id);
        await onMoveItem(newItem.id, containerBagId, orderedIds);
        if (refocus) {
            setInsertAfterId(newItem.id);
            setInsertContainerBagId(containerBagId);
        } else {
            setInsertAfterId(null);
        }
    };

    // The text box shown below an item for "insert after". Also passed to PacklistBagNode for
    // items inside bags.
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
            <ItemTagBadges item={insertDraftTags} isBatteryItem={matchesBatteryWarning(insertDraftText)} />
            <ItemTags text={insertDraftText} onTextChange={setInsertDraftText} />
        </div>
    );

    // The bag whose editor is open and every bag it's inside. These are drawn above the other
    // bags, so the editor popover isn't covered by a bag further down the list.
    const elevatedBagIds = useMemo(() => {
        if (openBagId == null) return null;
        const byId = new Map(bags.map((b) => [b.id, b]));
        const ids = new Set();
        let current = byId.get(openBagId);
        while (current) {
            ids.add(current.id);
            current = current.parentBagId != null ? byId.get(current.parentBagId) : null;
        }
        return ids;
    }, [openBagId, bags]);

    const itemsByContainer = groupByContainer(items, 'bagId');
    const bagsByContainer = groupByContainer(bags, 'parentBagId');

    const rootItems = itemsByContainer.root || [];
    const rootBags = bagsByContainer.root || [];

    // isDescendantBag: whether candidateId is somewhere inside ancestorId (a bag can't be
    // dropped into itself or its own bags).
    const findBag = (id) => bags.find((b) => b.id === id);
    const isDescendantBag = (candidateId, ancestorId) => {
        let cur = findBag(candidateId);
        while (cur && cur.parentBagId != null) {
            if (cur.parentBagId === ancestorId) return true;
            cur = findBag(cur.parentBagId);
        }
        return false;
    };
    // Drops a bag into newParentBagId (null for the top level): before beforeBagId, at the end
    // for 'end', or first when beforeBagId is null. Saves the new order.
    const handleDropBag = (bagId, newParentBagId, beforeBagId) => {
        const orderedIds = (bagsByContainer[newParentBagId === null ? 'root' : String(newParentBagId)] || [])
            .map((b) => b.id)
            .filter((id) => id !== bagId);
        let insertAt;
        if (beforeBagId === 'end') insertAt = orderedIds.length;
        else if (beforeBagId != null) insertAt = orderedIds.indexOf(beforeBagId);
        else insertAt = -1;
        orderedIds.splice(insertAt === -1 ? 0 : insertAt, 0, bagId);
        onMoveBag(bagId, newParentBagId, orderedIds);
    };

    // Same for an item: drops it into bag newBagId (null for loose items) before beforeItemId.
    const handleDropItem = (itemId, newBagId, beforeItemId) => {
        const orderedIds = (itemsByContainer[newBagId === null ? 'root' : String(newBagId)] || [])
            .map((i) => i.id)
            .filter((id) => id !== itemId);
        let insertAt;
        if (beforeItemId === 'end') insertAt = orderedIds.length;
        else if (beforeItemId != null) insertAt = orderedIds.indexOf(beforeItemId);
        else insertAt = -1;
        orderedIds.splice(insertAt === -1 ? 0 : insertAt, 0, itemId);
        onMoveItem(itemId, newBagId, orderedIds);
    };

    // One bag and everything in it.
    const renderBag = (bag) => (
        <PacklistBagNode
            key={bag.id}
            bag={bag}
            items={itemsByContainer[String(bag.id)] || []}
            childBags={bagsByContainer[String(bag.id)] || []}
            renderBagList={renderBagList}
            onToggleItem={onToggleItem}
            onDeleteItem={onDeleteItem}
            onRenameItem={onRenameItem}
            onUpdateItem={onUpdateItem}
            onAddItem={(text, tags) => onAddItem(bag.id, text, tags)}
            onInsertAfterItem={(afterItemId) => startInsertAfter(afterItemId, bag.id)}
            insertAfterId={insertAfterId}
            insertContainerBagId={insertContainerBagId}
            renderInsertDraftRow={renderInsertDraftRow}
            onDropItem={handleDropItem}
            isItemReorderActive={reorderActiveItemId}
            setReorderActiveItemId={setReorderActiveItemId}
            onRenameBag={(name) => onRenameBag(bag.id, name)}
            onColorBag={(color) => onColorBag(bag.id, color)}
            onDeleteBag={() => onDeleteBag(bag.id)}
            onAddBag={() => onAddBag(bag.id, 'Name', DEFAULT_BAG_COLOR)}
            isDescendantBag={isDescendantBag}
            onDropBag={handleDropBag}
            isReorderActive={reorderActiveBagId === bag.id}
            setReorderActiveId={setReorderActiveBagId}
            isElevated={elevatedBagIds != null && elevatedBagIds.has(bag.id)}
            onEditingChange={(open) => setOpenBagId(open ? bag.id : null)}
        />
    );

    const renderBagList = (list) => list.map((bag) => renderBag(bag));

    return (
        <div className="packlist-tree">
            <div className="packlist-root-items" data-items-container="root">
                {rootItems.map((item) => (
                    <React.Fragment key={item.id}>
                        <PacklistItemRow
                            item={item}
                            onToggle={() => onToggleItem(item.id)}
                            onDelete={() => onDeleteItem(item.id)}
                            onRename={(text) => onRenameItem(item.id, text)}
                            onUpdateTags={(changes) => onUpdateItem(item.id, changes)}
                            onInsertAfter={(afterItemId) => startInsertAfter(afterItemId, null)}
                            onDropItem={handleDropItem}
                            isReorderActive={reorderActiveItemId === item.id}
                            setReorderActiveId={setReorderActiveItemId}
                        />
                        {insertAfterId === item.id && insertContainerBagId === null && renderInsertDraftRow()}
                    </React.Fragment>
                ))}
                <label className={'task add-task-row' + (rootDraft || rootAddFocused ? ' active' : '')} htmlFor={rootAddInputId}>
                    {(rootDraft || rootAddFocused) ? <span className="tick" /> : <span className="add-task-plus">+</span>}
                    <input
                        id={rootAddInputId}
                        ref={rootAddInputRef}
                        autoCapitalize="sentences"
                        className="add-task-input"
                        value={rootDraft}
                        onChange={(e) => setRootDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitRootAdd(); }}
                        onFocus={() => { rootFocusGenerationRef.current += 1; setRootAddFocused(true); }}
                        onBlur={handleRootAddBlur}
                    />
                    {(rootDraft || rootAddFocused) && (
                        <>
                            <ItemTagBadges item={rootDraftTags} isBatteryItem={matchesBatteryWarning(rootDraft)} />
                            <ItemTags text={rootDraft} onTextChange={setRootDraft} />
                        </>
                    )}
                </label>
                {(rootDraft || rootAddFocused) && (
                    <label className="add-task-plus add-task-plus-trailing" htmlFor={rootAddInputId}>+</label>
                )}
            </div>

            <div className="packlist-root-bags" data-parent-bag-id="root">
                {renderBagList(rootBags, null)}
            </div>
        </div>
    );
}

export default PacklistTree;
