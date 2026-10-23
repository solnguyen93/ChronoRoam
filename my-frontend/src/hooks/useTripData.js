import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChronoRoamApi from '../api';
import { isReorderDragActive } from '../utils/reorderGuard';
import { mergeNewTasksByTime, enforceTimedOrder } from '../utils/taskTimeSort';
import { noteRecentEmoji } from '../utils/recentEmoji';
import useLiveUpdates from './useLiveUpdates';

// Loads a trip (details, to-dos, day items, linked packing lists) and gives functions to change
// it. Each change updates the page from the server's reply instead of reloading everything.
// The trip is also reloaded every 20 seconds and when the app comes back into view, so other
// people's changes show up. `loading` is only true for the first load of a trip.
// `join` is true when opened from a share link (?join=1): only that first load adds this user
// to the trip.
function useTripData(tripId, join = false) {
    const [trip, setTrip] = useState(null);
    // A trip's named to-do lists, each { id, title, position, items }. Several per trip — see
    // TodoList.js. Always has at least one; deleting the last is refused server-side.
    const [todoLists, setTodoLists] = useState([]);
    const [tasks, setTasksState] = useState([]);
    // A copy of `tasks` that's updated immediately, so functions below can read the latest list
    // right after changing it (React state only updates on the next render). Saving in the
    // add/edit popup can run several updates in a row, and each needs the result of the last.
    // Always change tasks through setTasks, which updates both.
    const tasksRef = useRef([]);
    const setTasks = useCallback((updaterOrValue) => {
        const next = typeof updaterOrValue === 'function' ? updaterOrValue(tasksRef.current) : updaterOrValue;
        tasksRef.current = next;
        setTasksState(next);
    }, []);
    // The linked packing lists, each as { packlist, items, bags }.
    const [packlists, setPacklists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isNotFound, setIsNotFound] = useState(false);
    const loadedTripIdRef = useRef(null);
    const joinRef = useRef(join);
    joinRef.current = join;

    // Loads the whole trip. Asks to join only on the first load of this trip, and only if `join`.
    const load = useCallback(async () => {
        if (!tripId) return;
        if (loadedTripIdRef.current !== tripId) setLoading(true);
        setError(null);
        setIsNotFound(false);
        try {
            const data = await ChronoRoamApi.getTrip(tripId, joinRef.current && loadedTripIdRef.current !== tripId);
            setTrip(data.trip);
            setTodoLists(data.todoLists);
            setTasks(data.tasks);
            setPacklists(data.packlists);
            loadedTripIdRef.current = tripId;
        } catch (err) {
            setError(err);
            setIsNotFound(err.response?.status === 404);
        } finally {
            setLoading(false);
        }
    }, [tripId, setTasks]);

    useEffect(() => {
        load();
    }, [load]);

    // Reloads every 20 seconds, and when the window gets focus or the app comes back into view.
    useEffect(() => {
        if (!tripId) return undefined;
        // Skipped while an item is being dragged, since reloading mid-drag scrambles the rows
        // (utils/reorderGuard.js).
        const id = setInterval(() => { if (!isReorderDragActive()) load(); }, 20000);
        const onFocus = () => { if (document.visibilityState === 'visible' && !isReorderDragActive()) load(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [tripId, load]);

    // On a shared trip, reloads as soon as someone else changes it or a shared packing list
    // linked to it (hooks/useLiveUpdates.js).
    const liveKeys = [];
    if (trip?.memberCount > 1) liveKeys.push(`trip:${tripId}`);
    for (const { packlist } of packlists) {
        if (packlist.memberCount > 1) liveKeys.push(`packlist:${packlist.publicId}`);
    }
    useLiveUpdates(liveKeys, load);

    const updateTrip = useCallback(async (data) => {
        const updated = await ChronoRoamApi.updateTrip(tripId, data);
        setTrip(updated);
        return updated;
    }, [tripId]);

    const setDayTitle = useCallback(async (dateISO, title) => {
        const updated = await ChronoRoamApi.setDayTitle(tripId, dateISO, title);
        setTrip(updated);
        return updated;
    }, [tripId]);

    const createTodoList = useCallback(async (title) => {
        const created = await ChronoRoamApi.createTodoList(tripId, title);
        setTodoLists((prev) => [...prev, { ...created, items: [] }]);
        return created;
    }, [tripId]);

    const renameTodoList = useCallback(async (listId, title) => {
        const updated = await ChronoRoamApi.renameTodoList(tripId, listId, title);
        setTodoLists((prev) => prev.map((l) => (l.id === listId ? { ...l, title: updated.title } : l)));
        return updated;
    }, [tripId]);

    // Throws (and leaves state untouched) if this is the trip's last remaining list — the server
    // refuses that; see TodoList.remove.
    const deleteTodoList = useCallback(async (listId) => {
        await ChronoRoamApi.deleteTodoList(tripId, listId);
        setTodoLists((prev) => prev.filter((l) => l.id !== listId));
    }, [tripId]);

    const addTodoToList = useCallback(async (listId, text) => {
        noteRecentEmoji(text);
        const created = await ChronoRoamApi.addTodoToList(tripId, listId, text);
        setTodoLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: [...l.items, created] } : l)));
        return created;
    }, [tripId]);

    const updateTodo = useCallback(async (todoId, data) => {
        if (data.text) noteRecentEmoji(data.text);
        const updated = await ChronoRoamApi.updateTodo(tripId, todoId, data);
        setTodoLists((prev) => prev.map((l) => ({ ...l, items: l.items.map((t) => (t.id === todoId ? updated : t)) })));
        return updated;
    }, [tripId]);

    const deleteTodo = useCallback(async (todoId) => {
        await ChronoRoamApi.deleteTodo(tripId, todoId);
        setTodoLists((prev) => prev.map((l) => ({ ...l, items: l.items.filter((t) => t.id !== todoId) })));
    }, [tripId]);

    const reorderTodosInList = useCallback(async (listId, orderedIds) => {
        const reordered = await ChronoRoamApi.reorderTodosInList(tripId, listId, orderedIds);
        setTodoLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: reordered } : l)));
        return reordered;
    }, [tripId]);

    const uncheckAllInList = useCallback(async (listId) => {
        const updated = await ChronoRoamApi.uncheckAllTodosInList(tripId, listId);
        setTodoLists((prev) => prev.map((l) => (l.id === listId ? { ...l, items: updated } : l)));
        return updated;
    }, [tripId]);

    const addTask = useCallback(async (task) => {
        if (!task.cat && task.text) noteRecentEmoji(task.text);
        const created = await ChronoRoamApi.addTask(tripId, task);
        setTasks((prev) => [...prev, created]);
        return created;
    }, [tripId, setTasks]);

    // Adds several day items at once (e.g. a flight's departure and arrival).
    const addTasks = useCallback(async (taskList) => {
        const created = await Promise.all(taskList.map((t) => ChronoRoamApi.addTask(tripId, t)));
        setTasks((prev) => [...prev, ...created]);
        return created;
    }, [tripId, setTasks]);

    const deleteTask = useCallback(async (taskId) => {
        await ChronoRoamApi.deleteTask(tripId, taskId);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }, [tripId, setTasks]);

    // The latest day items (see tasksRef above).
    const getFreshTasks = useCallback(() => tasksRef.current, []);

    // Saves a day's new item order. Before saving, items with a time are put back in time order
    // among the day's other timed items (enforceTimedOrder); items without a time stay where they
    // were dropped. The server returns all the trip's items.
    const reorderTasks = useCallback(async (dayDate, orderedIds) => {
        const byId = new Map(getFreshTasks().map((t) => [t.id, t]));
        const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        const corrected = enforceTimedOrder(ordered).map((t) => t.id);
        const reordered = await ChronoRoamApi.reorderTasks(tripId, dayDate, corrected);
        setTasks(reordered);
        return reordered;
    }, [tripId, getFreshTasks, setTasks]);

    // A to-do dragged onto a day: deletes the to-do, adds a day item with the same text and tags
    // on that day (added at the end), then moves it to targetIndex, where it was dropped.
    const convertTodoToTask = useCallback(async (todoId, dayDate, targetIndex) => {
        const todo = todoLists.flatMap((l) => l.items).find((t) => t.id === todoId);
        if (!todo) return;
        await ChronoRoamApi.deleteTodo(tripId, todoId);
        setTodoLists((prev) => prev.map((l) => ({ ...l, items: l.items.filter((t) => t.id !== todoId) })));
        const created = await ChronoRoamApi.addTask(tripId, { dayDate, text: todo.text, tags: todo.tags || {}, fixed: false, flight: false });
        setTasks((prev) => [...prev, created]);
        if (targetIndex == null) return created;
        const dayKey = created.dayDate.slice(0, 10);
        const dayTasks = getFreshTasks().filter((t) => t.dayDate.slice(0, 10) === dayKey && t.id !== created.id);
        dayTasks.splice(targetIndex, 0, created);
        await reorderTasks(dayKey, dayTasks.map((t) => t.id));
        return created;
    }, [tripId, todoLists, setTasks, getFreshTasks, reorderTasks]);

    // A day item dragged onto one to-do list panel: deletes it, adds a to-do with the same text
    // and tags to that list, and moves it to targetIndex. Only items without a category can be
    // dragged there (TaskRow.js). listId comes from which panel it was dropped on (see
    // TodoPanel.js's data-todo-target) — falls back to the trip's first list if that's somehow
    // missing, so a drop never silently does nothing.
    const convertTaskToTodo = useCallback(async (taskId, targetIndex, listId) => {
        const task = tasksRef.current.find((t) => t.id === taskId);
        if (!task) return;
        const targetListId = listId ? parseInt(listId, 10) : todoLists[0]?.id;
        const targetList = todoLists.find((l) => l.id === targetListId) || todoLists[0];
        if (!targetList) return;
        await ChronoRoamApi.deleteTask(tripId, taskId);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        const created = await ChronoRoamApi.addTodoToList(tripId, targetList.id, task.text, task.tags || {});
        setTodoLists((prev) => prev.map((l) => (l.id === targetList.id ? { ...l, items: [...l.items, created] } : l)));
        if (targetIndex == null) return created;
        const ordered = [...targetList.items];
        ordered.splice(targetIndex, 0, created);
        await reorderTodosInList(targetList.id, ordered.map((t) => t.id));
        return created;
    }, [tripId, setTasks, todoLists, reorderTodosInList]);

    // Saves changes to a day item. If that puts the day's timed items out of time order, the
    // order is fixed the same way as reorderTasks.
    const updateTask = useCallback(async (taskId, data) => {
        if (!data.cat && data.text) noteRecentEmoji(data.text);
        const updated = await ChronoRoamApi.updateTask(tripId, taskId, data);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));

        const dayKey = updated.dayDate.slice(0, 10);
        const dayTasks = getFreshTasks()
            .map((t) => (t.id === taskId ? updated : t))
            .filter((t) => t.dayDate.slice(0, 10) === dayKey)
            .sort((a, b) => a.position - b.position);
        const corrected = enforceTimedOrder(dayTasks);
        if (corrected.some((t, i) => t.id !== dayTasks[i].id)) {
            await reorderTasks(dayKey, corrected.map((t) => t.id));
        }
        return updated;
    }, [tripId, getFreshTasks, reorderTasks, setTasks]);

    // Moves an item to another day (the server also moves its linked other half). The server puts
    // moved items at the end of their new day, so each day that got an item is then reordered:
    // the moved items go in by time among the items already there (mergeNewTasksByTime).
    const moveTaskDay = useCallback(async (taskId, dayDate) => {
        const before = getFreshTasks();
        const moved = await ChronoRoamApi.moveTaskDay(tripId, taskId, dayDate);

        const beforeById = new Map(before.map((t) => [t.id, t]));
        const changedTasks = moved.filter((t) => {
            const prev = beforeById.get(t.id);
            return prev && prev.dayDate.slice(0, 10) !== t.dayDate.slice(0, 10);
        });
        const affectedDays = [...new Set(changedTasks.map((t) => t.dayDate.slice(0, 10)))];

        let result = moved;
        for (const affectedDay of affectedDays) {
            const dayTasks = result.filter((t) => t.dayDate.slice(0, 10) === affectedDay);
            const changedIds = new Set(changedTasks.filter((t) => t.dayDate.slice(0, 10) === affectedDay).map((t) => t.id));
            const existingTasks = dayTasks.filter((t) => !changedIds.has(t.id));
            const newTasksForDay = dayTasks.filter((t) => changedIds.has(t.id));
            const mergedIds = mergeNewTasksByTime(existingTasks, newTasksForDay).map((t) => t.id);
            result = await ChronoRoamApi.reorderTasks(tripId, affectedDay, mergedIds);
        }
        setTasks(result);
        return result;
    }, [tripId, getFreshTasks, setTasks]);

    // Every packing list change on a trip returns { trip, packlists } with all its linked
    // lists, which replaces what's shown.
    const applyPacklistResponse = (data) => {
        setTrip(data.trip);
        setPacklists(data.packlists);
    };

    // Links a packing list, for this user or (forEveryone) everyone on the trip. Throws a 409 if it's
    // already linked for this user, so LinkPacklistModal can offer to link a copy instead.
    const linkPacklist = useCallback(async (packlistId, forEveryone = false) => {
        const data = await ChronoRoamApi.linkPacklist(tripId, packlistId, forEveryone);
        applyPacklistResponse(data);
    }, [tripId]);

    // Links a copy of a packing list. With replace, the copy takes the original's place on the
    // trip for this user (Duplicate on a linked list's card); otherwise forEveryone links it for
    // everyone on the trip.
    const duplicateAndLinkPacklist = useCallback(async (packlistId, replace = false, forEveryone = false) => {
        const data = await ChronoRoamApi.duplicateAndLinkPacklist(tripId, packlistId, replace, forEveryone);
        applyPacklistResponse(data);
    }, [tripId]);

    const unlinkPacklist = useCallback(async (packlistId) => {
        const data = await ChronoRoamApi.unlinkPacklist(tripId, packlistId);
        applyPacklistResponse(data);
    }, [tripId]);

    const renamePacklist = useCallback(async (packlistId, title) => {
        const data = await ChronoRoamApi.renameTripPacklist(tripId, packlistId, title);
        applyPacklistResponse(data);
    }, [tripId]);

    // Adds an item and returns that list's { items, bags } (the same shape as on the packing
    // list page), so PacklistTree can find the new item right away.
    const addPacklistItem = useCallback(async (packlistId, bagId, text, tags) => {
        const data = await ChronoRoamApi.addTripPacklistItem(tripId, packlistId, text, bagId, tags);
        applyPacklistResponse(data);
        const entry = data.packlists.find((p) => p.packlist.publicId === packlistId);
        return entry ? { items: entry.items, bags: entry.bags } : null;
    }, [tripId]);

    const updatePacklistItem = useCallback(async (packlistId, itemId, changes) => {
        const data = await ChronoRoamApi.updateTripPacklistItem(tripId, packlistId, itemId, changes);
        applyPacklistResponse(data);
    }, [tripId]);

    const movePacklistItem = useCallback(async (packlistId, itemId, bagId, orderedIds) => {
        const data = await ChronoRoamApi.moveTripPacklistItem(tripId, packlistId, itemId, bagId, orderedIds);
        applyPacklistResponse(data);
    }, [tripId]);

    const deletePacklistItem = useCallback(async (packlistId, itemId) => {
        const data = await ChronoRoamApi.deleteTripPacklistItem(tripId, packlistId, itemId);
        applyPacklistResponse(data);
    }, [tripId]);

    const reorderPacklistItems = useCallback(async (packlistId, orderedIds) => {
        const data = await ChronoRoamApi.reorderTripPacklistItems(tripId, packlistId, orderedIds);
        applyPacklistResponse(data);
    }, [tripId]);

    const uncheckAllPacklistItems = useCallback(async (packlistId) => {
        const data = await ChronoRoamApi.uncheckAllTripPacklistItems(tripId, packlistId);
        applyPacklistResponse(data);
    }, [tripId]);

    const addPacklistBag = useCallback(async (packlistId, parentBagId, name, color) => {
        const data = await ChronoRoamApi.addTripPacklistBag(tripId, packlistId, parentBagId, name, color);
        applyPacklistResponse(data);
    }, [tripId]);

    const updatePacklistBag = useCallback(async (packlistId, bagId, changes) => {
        const data = await ChronoRoamApi.updateTripPacklistBag(tripId, packlistId, bagId, changes);
        applyPacklistResponse(data);
    }, [tripId]);

    const deletePacklistBag = useCallback(async (packlistId, bagId) => {
        const data = await ChronoRoamApi.deleteTripPacklistBag(tripId, packlistId, bagId);
        applyPacklistResponse(data);
    }, [tripId]);

    const movePacklistBag = useCallback(async (packlistId, bagId, parentBagId, orderedIds) => {
        const data = await ChronoRoamApi.moveTripPacklistBag(tripId, packlistId, bagId, parentBagId, orderedIds);
        applyPacklistResponse(data);
    }, [tripId]);

    // Day items grouped by date ('YYYY-MM-DD'), each day in its saved order.
    const tasksByDay = useMemo(() => {
        const grouped = {};
        for (const t of tasks) {
            const key = t.dayDate.slice(0, 10);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(t);
        }
        for (const key in grouped) {
            grouped[key].sort((a, b) => a.position - b.position);
        }
        return grouped;
    }, [tasks]);

    return {
        trip, todoLists, tasks, tasksByDay, packlists, loading, error, isNotFound, refresh: load,
        updateTrip, setDayTitle,
        createTodoList, renameTodoList, deleteTodoList, addTodoToList, updateTodo, deleteTodo,
        reorderTodosInList, uncheckAllInList, convertTodoToTask, convertTaskToTodo,
        addTask, addTasks, updateTask, deleteTask, reorderTasks, moveTaskDay,
        linkPacklist, duplicateAndLinkPacklist, unlinkPacklist, renamePacklist,
        addPacklistItem, updatePacklistItem, movePacklistItem, deletePacklistItem, reorderPacklistItems, uncheckAllPacklistItems,
        addPacklistBag, updatePacklistBag, deletePacklistBag, movePacklistBag,
    };
}

export default useTripData;
