import React from 'react';
import DayCardStrip from './DayCardStrip';
import { dateRange, todayISO } from '../utils/dateHelpers';

// The column view: every day of the trip as cards side by side, scrolling left and right.
function DayRowList({ trip, tasksByDay, locationsByDay, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const dates = dateRange(trip.startDate.slice(0, 10), trip.endDate.slice(0, 10));

    return (
        <DayCardStrip
            dates={dates}
            todayKey={todayISO()}
            tasksByDay={tasksByDay}
            dayTitles={trip.dayTitles || {}}
            locationsByDay={locationsByDay}
            weatherLocked={weatherLocked}
            onToggle={onToggle}
            onDelete={onDelete}
            onRename={onRename}
            onUpdateTags={onUpdateTags}
            onEditCat={onEditCat}
            onReorder={onReorder}
            onMoveDay={onMoveDay}
            onMoveToTodo={onMoveToTodo}
            onAdd={onAdd}
            onSetDayTitle={onSetDayTitle}
        />
    );
}

export default DayRowList;
