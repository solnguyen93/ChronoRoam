import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useTripData from '../hooks/useTripData';
import useDayLocations from '../hooks/useDayLocations';
import Header from './Header';
import TodoPanel from './TodoPanel';
import TripTipsPanel from './TripTipsPanel';
import LinkedPacklistPanel from './LinkedPacklistPanel';
import ViewSwitcher from './ViewSwitcher';
import TripToolbar from './TripToolbar';
import DayRail from './DayRail';
import DayRowList from './DayRowList';
import DayCalendarView from './DayCalendarView';
import AddItemModal from './AddItemModal';
import ConfirmationImportModal from './ConfirmationImportModal';
import WelcomeModal from './WelcomeModal';
import PlusIcon from './PlusIcon';
import { dateRange, isDateInRange, todayISO } from '../utils/dateHelpers';
import Wordmark from './Wordmark';
import { usePendingEmailImports } from '../hooks/usePendingEmailImports';
import { useBillingStatus } from '../hooks/useBillingStatus';
import { CREDIT_LOCKS_ENABLED } from '../utils/creditLocks';
import useScrollArrows from '../hooks/useScrollArrows';
import useAtTopBackdrop from '../hooks/useAtTopBackdrop';
import CollapseChevron from './CollapseChevron';

// Where this device remembers the last day view used (row, column or calendar).
const VIEW_STORAGE_KEY = 'chronoroam_trip_view';
// The old key, where 'column' and 'row' meant the opposite views. Read once and converted, so a
// device keeps the view it last used.
const OLD_VIEW_STORAGE_KEY = 'chronoroam_day_view';
const OLD_VIEW_NAMES = { column: 'row', row: 'column', calendar: 'calendar' };

// The view last used on this device; ☰ (row) only when there's never been one.
function lastUsedView() {
    try {
        const saved = localStorage.getItem(VIEW_STORAGE_KEY);
        if (saved) return saved;
        const old = OLD_VIEW_NAMES[localStorage.getItem(OLD_VIEW_STORAGE_KEY)];
        if (old) localStorage.setItem(VIEW_STORAGE_KEY, old);
        return old || 'row';
    } catch {
        return 'row';
    }
}

// The trip page: header, Trip Tips, packing lists, to-dos, and the day-by-day plan.
function Planner({ tripId }) {
    const navigate = useNavigate();
    const location = useLocation();
    // True when opened from a share link (?join=1, see ShareModal.js). useTripData then adds
    // the user to the trip.
    const joinFromLink = new URLSearchParams(location.search).get('join') === '1';
    const {
        trip, todos, tasks, tasksByDay, packlists, loading, error, isNotFound, refresh,
        updateTrip, setDayTitle, setTodoTitle,
        addTodo, updateTodo, deleteTodo, reorderTodos, convertTodoToTask, convertTaskToTodo,
        addTask, updateTask, deleteTask, reorderTasks, moveTaskDay,
        linkPacklist, duplicateAndLinkPacklist, unlinkPacklist, renamePacklist,
        addPacklistItem, updatePacklistItem, movePacklistItem, deletePacklistItem, uncheckAllPacklistItems,
        addPacklistBag, updatePacklistBag, deletePacklistBag, movePacklistBag,
    } = useTripData(tripId, joinFromLink);

    // Once joined, drop ?join=1 from the address so it isn't left in history or a copied URL.
    useEffect(() => {
        if (joinFromLink && trip) navigate(location.pathname, { replace: true, state: location.state });
    }, [joinFromLink, trip, navigate, location.pathname, location.state]);

    // Shows the "You're verified" popup when that was passed in the page's navigation state, then
    // clears it so a reload doesn't show it again.
    const [showWelcome, setShowWelcome] = useState(Boolean(location.state?.showWelcome));
    const [welcomeReason] = useState(location.state?.reason);
    useEffect(() => {
        if (location.state?.showWelcome) navigate(location.pathname, { replace: true, state: {} });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const billing = useBillingStatus();
    // Hides every day's weather when the user has 0 credits. Switched off (utils/creditLocks.js).
    // Worked out once here and passed down to each day, so the days don't each ask the server.
    // Stays false while the credit count is loading (remaining is undefined).
    const weatherLocked = CREDIT_LOCKS_ENABLED && billing.remaining === 0;

    // If the trip doesn't exist (deleted, or a bad link), go to the Home page.
    useEffect(() => {
        if (!isNotFound) return;
        navigate('/home', { replace: true });
    }, [isNotFound, navigate]);

    const [modalState, setModalState] = useState({ open: false, mode: 'add', targetDayDate: null, task: null });
    const [dayView, setDayView] = useState(lastUsedView);

    // Switches the day view and remembers it on this device.
    const changeView = (view) => {
        setDayView(view);
        try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch { /* storage blocked — view still switches */ }
    };

    const { byDay: locationsByDay, fallback: fallbackLocation, itineraryPlaces } = useDayLocations(
        trip?.startDate.slice(0, 10), trip?.endDate.slice(0, 10), tasksByDay, trip?.title, trip?.destinations,
    );

    // If the trip has no destinations, fills them in once from the places found in its day
    // items. Runs at most once per page load, and never when the trip already has destinations,
    // so it doesn't undo a user clearing them.
    const autoFilledDestinations = useRef(false);
    useEffect(() => {
        if (!trip || autoFilledDestinations.current) return;
        if (trip.destinations?.length) { autoFilledDestinations.current = true; return; }
        if (!itineraryPlaces?.length) return;
        autoFilledDestinations.current = true;
        updateTrip({ destinations: itineraryPlaces.map((p) => p.city) });
    }, [trip, itineraryPlaces, updateTrip]);

    // The other half of a linked pair (e.g. a flight's arrival for its departure), or null.
    const findSibling = (task) => {
        if (!task || !task.linkId) return null;
        return tasks.find((t) => t.id !== task.id && t.linkId === task.linkId) || null;
    };

    // Opens the add-item popup on today if the trip includes today, otherwise on its first day.
    const openAddModal = () => {
        const inRange = trip && todayISO() >= trip.startDate.slice(0, 10) && todayISO() <= trip.endDate.slice(0, 10);
        const targetDayDate = inRange ? todayISO() : trip.startDate.slice(0, 10);
        setModalState({ open: true, mode: 'add', targetDayDate, task: null });
    };

    // Opens the edit form for a day item with a category (flight, lodging, ...).
    const openEditModal = (taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;
        setModalState({ open: true, mode: 'edit', targetDayDate: null, task });
    };

    const closeModal = () => setModalState((s) => ({ ...s, open: false }));

    const emailImports = usePendingEmailImports();
    // After an emailed booking is imported or dismissed: moves on to the next email and reloads
    // the trip right away, since ConfirmationImportModal saves items through the API directly and
    // this page wouldn't otherwise see them until its next background refresh.
    const handleImportResolved = () => {
        emailImports.resolveCurrent();
        refresh();
    };
    // The "N Emails to Review" button in the add-item popup: closes that popup and opens the
    // email review popup.
    const startEmailReview = () => {
        closeModal();
        emailImports.startReview();
    };

    // Saves the add/edit popup's result: a list of items to create or update (a flight, for
    // example, is two items).
    const handleSubmit = async (ops) => {
        for (const opItem of ops) {
            if (opItem.op === 'create') {
                const { op, ...data } = opItem;
                await addTask(data);
            } else if (opItem.op === 'update') {
                const { op, id, ...data } = opItem;
                await updateTask(id, data);
            }
        }
    };

    // Up/down arrow buttons that scroll the whole page (header included). Rechecked when the
    // view or the number of days changes, since that changes the page height.
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [dayView, tasksByDay ? Object.keys(tasksByDay).length : 0]);
    useAtTopBackdrop();

    if (isNotFound) return <div style={{ padding: 24 }}>That trip link is no longer valid — starting a new trip…</div>;
    if (loading) return <div style={{ padding: 24 }}>Loading your trip…</div>;
    if (error || !trip) return <div style={{ padding: 24 }}>Couldn't load this trip. Try reloading.</div>;

    const siblingTask = modalState.task ? findSibling(modalState.task) : null;

    const startISO = trip.startDate.slice(0, 10);
    const endISO = trip.endDate.slice(0, 10);
    const dates = dateRange(startISO, endISO);
    const todayVisible = isDateInRange(todayISO(), startISO, endISO);

    // Scrolls to a day's card, in whichever view is showing.
    const scrollToDay = (dateISO) => {
        document.getElementById('day-' + dateISO)?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
    };

    // The same props go to whichever day view is showing.
    const dayRailProps = {
        trip, tasksByDay, locationsByDay, fallbackLocation, weatherLocked,
        onToggle: (id) => { const t = tasks.find((x) => x.id === id); updateTask(id, { done: !t.done }); },
        onDelete: (id) => deleteTask(id),
        onRename: (id, text) => updateTask(id, { text }),
        onUpdateTags: (id, tags) => updateTask(id, { tags }),
        onEditCat: (id) => openEditModal(id),
        onReorder: (dayDate, orderedIds) => reorderTasks(dayDate, orderedIds),
        onMoveDay: (taskId, dayDate) => moveTaskDay(taskId, dayDate),
        onMoveToTodo: (taskId, targetIndex) => convertTaskToTodo(taskId, targetIndex),
        onAdd: (dayDate, text) => addTask({ dayDate, text, fixed: false, flight: false }),
        onSetDayTitle: (dayDate, title) => setDayTitle(dayDate, title),
    };

    return (
        <div className="detail-page">
            <div className="v-scroll-wrap detail-page-scroll-wrap">
            {canBack && (
                <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
            )}
            <div key="scroll-body" className="detail-page-scroll-body" ref={scrollRef}>
            <Header trip={trip} updateTrip={updateTrip} />
            <div className="layout">
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '14px' }}>
                    <TripTipsPanel tripId={tripId} tripTitle={trip.title} tripStart={startISO} tripEnd={endISO} itineraryPlaces={itineraryPlaces} destinations={trip.destinations} />
                    <LinkedPacklistPanel
                        tripId={tripId}
                        onImported={refresh}
                        packlists={packlists}
                        onLink={linkPacklist}
                        onDuplicateAndLink={duplicateAndLinkPacklist}
                        onUnlink={unlinkPacklist}
                        onRenamePacklist={renamePacklist}
                        onUncheckAll={uncheckAllPacklistItems}
                        onUpdateItem={updatePacklistItem}
                        onDeleteItem={deletePacklistItem}
                        onAddItem={addPacklistItem}
                        onMoveItem={movePacklistItem}
                        onAddBag={addPacklistBag}
                        onUpdateBag={updatePacklistBag}
                        onDeleteBag={deletePacklistBag}
                        onMoveBag={movePacklistBag}
                    />
                    <TodoPanel
                        tripId={tripId}
                        title={trip.todoTitle}
                        onRename={setTodoTitle}
                        todos={todos}
                        addTodo={addTodo}
                        updateTodo={updateTodo}
                        deleteTodo={deleteTodo}
                        reorderTodos={reorderTodos}
                        convertTodoToTask={convertTodoToTask}
                    />
                </div>

                <div className="day-section-head">
                    <TripToolbar
                        todayVisible={todayVisible}
                        onToday={() => scrollToDay(todayISO())}
                        dates={dates}
                        tasksByDay={tasksByDay}
                        dayTitles={trip.dayTitles || {}}
                        onJumpToDay={scrollToDay}
                    />
                    <ViewSwitcher view={dayView} onChange={changeView} />
                </div>

                {dayView === 'row' && <DayRail {...dayRailProps} />}
                {dayView === 'column' && <DayRowList {...dayRailProps} />}
                {dayView === 'calendar' && <DayCalendarView {...dayRailProps} />}
            </div>

            <footer className="app-footer">
                <Wordmark />
            </footer>
            </div>
            {canForward && (
                <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
            )}
            </div>

            <button className="fab-add" title="Add to your trip" onClick={openAddModal}>
                <PlusIcon size={21} />
                {emailImports.count > 0 && <span className="fab-badge">{emailImports.count}</span>}
            </button>

            <AddItemModal
                open={modalState.open}
                onClose={closeModal}
                mode={modalState.mode}
                targetDayDate={modalState.targetDayDate}
                task={modalState.task}
                siblingTask={siblingTask}
                allTasks={tasks}
                tripId={tripId}
                tripStart={trip.startDate.slice(0, 10)}
                tripEnd={trip.endDate.slice(0, 10)}
                onSubmit={handleSubmit}
                onDelete={deleteTask}
                onImportSaved={refresh}
                emailImportCount={emailImports.count}
                onReviewEmails={startEmailReview}
            />

            <ConfirmationImportModal
                pendingImport={emailImports.current}
                showCaughtUp={emailImports.showCaughtUp}
                defaultTripId={tripId}
                position={emailImports.position}
                hasPrevious={emailImports.hasPrevious}
                hasNext={emailImports.hasNext}
                onPrevious={emailImports.goPrevious}
                onNext={emailImports.goNext}
                onClose={emailImports.closeReview}
                onResolved={handleImportResolved}
            />

            <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} reason={welcomeReason} />
        </div>
    );
}

export default Planner;
