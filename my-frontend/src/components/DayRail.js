import React from 'react';
import DayColumn from './DayColumn';
import { dateRange, todayISO } from '../utils/dateHelpers';

function DayRail({ trip, tasksByDay, locationsByDay, fallbackLocation, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const dates = dateRange(trip.startDate.slice(0, 10), trip.endDate.slice(0, 10));
    const todayKey = todayISO();

    return (
        <div className="day-rail-wrap">
            <div className="day-rail">
                {dates.map((dateISO) => (
                    <DayColumn
                        key={dateISO}
                        dateISO={dateISO}
                        isToday={dateISO === todayKey}
                        tasks={tasksByDay[dateISO] || []}
                        dayTitle={(trip.dayTitles || {})[dateISO] || ''}
                        location={locationsByDay[dateISO]}
                        showLocationLabel={Boolean(locationsByDay[dateISO])}
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
                ))}
            </div>
        </div>
    );
}

export default DayRail;
