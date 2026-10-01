import React, { useEffect, useState } from 'react';
import DayCard from './DayCard';
import CollapseChevron from './CollapseChevron';
import useScrollArrows from '../hooks/useScrollArrows';
import { weeksForTrip, MONTH_NAMES } from '../utils/calendarHelpers';
import { isDateInRange, parseISO, todayISO } from '../utils/dateHelpers';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// At this width and below (same as Planner.css), each day shows just its date number.
const MOBILE_BREAKPOINT = 599;

// Whether the window is at or below that width (updates on resize).
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return isMobile;
}

// The calendar view: the weeks of the trip as a month grid under a fixed Sun-Sat header, scrolling
// when long. Trip days are square day cards (DayCard); other days in those weeks are grayed-out
// numbers. On wider screens a month's name appears above its 1st, and that month's days in that
// week move down to make room for it.
function DayCalendarView({ trip, tasksByDay, locationsByDay, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const startISO = trip.startDate.slice(0, 10);
    const endISO = trip.endDate.slice(0, 10);
    const weeks = weeksForTrip(startISO, endISO);
    const todayKey = todayISO();
    const dayTitles = trip.dayTitles || {};

    const { canBack, canForward, idle, scrollBack, scrollForward, ref: scrollRef } = useScrollArrows('y', [weeks.length]);
    const isMobile = useIsMobile();

    return (
        <div className="calendar-view">
            <div className="calendar-dow-header">
                {DOW_LABELS.map((l) => <div className="calendar-dow" key={l}>{l}</div>)}
            </div>
            <div className="v-scroll-wrap">
                {canBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="calendar-scroll-body" ref={scrollRef}>
                <div className="calendar-grid">
                    {weeks.map((week) => {
                        const monthStartIdx = week.findIndex((dateISO) => parseISO(dateISO).getDate() === 1);
                        return week.map((dateISO, idx) => {
                            const d = parseISO(dateISO);
                            const isMonthStart = d.getDate() === 1;
                            const shifted = !isMobile && monthStartIdx !== -1 && idx >= monthStartIdx;
                            const wrapClassName = 'calendar-cell-wrap' + (shifted ? ' calendar-cell-wrap-month-start' : '');
                            const monthLabel = isMonthStart && !isMobile && (
                                <div className="calendar-inline-month-label">{MONTH_NAMES[d.getMonth()]}</div>
                            );
                            // Phones: the short month name sits above the 1st's number instead.
                            const mobileMonthAbbrev = isMobile && isMonthStart ? MONTH_NAMES[d.getMonth()].slice(0, 3) : null;

                            if (!isDateInRange(dateISO, startISO, endISO)) {
                                return (
                                    <div className={wrapClassName} key={dateISO}>
                                        {monthLabel}
                                        <div className={'calendar-grid-pad' + (mobileMonthAbbrev ? ' calendar-grid-pad-month-cell' : '')}>
                                            {mobileMonthAbbrev && <span className="calendar-grid-pad-month">{mobileMonthAbbrev}</span>}
                                            {d.getDate()}
                                        </div>
                                    </div>
                                );
                            }
                            // Phones: trip days are also just a number (colored for the trip and today),
                            // since a card's other contents don't fit.
                            if (isMobile) {
                                return (
                                    <div className="calendar-cell-wrap" key={dateISO}>
                                        <div className={'calendar-grid-pad calendar-grid-pad-trip' + (dateISO === todayKey ? ' calendar-grid-pad-today' : '') + (mobileMonthAbbrev ? ' calendar-grid-pad-month-cell' : '')}>
                                            {mobileMonthAbbrev && <span className="calendar-grid-pad-month">{mobileMonthAbbrev}</span>}
                                            {d.getDate()}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className={wrapClassName} key={dateISO}>
                                    {monthLabel}
                                    <DayCard
                                        dateISO={dateISO}
                                        square
                                        isToday={dateISO === todayKey}
                                        tasks={tasksByDay[dateISO] || []}
                                        dayTitle={dayTitles[dateISO] || ''}
                                        location={locationsByDay[dateISO]}
                                        weatherLocked={weatherLocked}
                                        onToggle={(id) => onToggle(id)}
                                        onDelete={(id) => onDelete(id)}
                                        onRename={(id, text) => onRename(id, text)}
                                        onUpdateTags={onUpdateTags}
                                        onEditCat={(id) => onEditCat(id)}
                                        onReorder={(orderedIds) => onReorder(dateISO, orderedIds)}
                                        onMoveDay={onMoveDay}
                                        onMoveToTodo={onMoveToTodo}
                                        onAdd={(text) => onAdd(dateISO, text)}
                                        onSetDayTitle={(title) => onSetDayTitle(dateISO, title)}
                                    />
                                </div>
                            );
                        });
                    })}
                </div>
                </div>
                {canForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
            </div>
        </div>
    );
}

export default DayCalendarView;
