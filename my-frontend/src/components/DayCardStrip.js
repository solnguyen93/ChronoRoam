import React from 'react';
import DayCard from './DayCard';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// A row of day cards that scrolls left and right, with arrows when there's more to see that way.
function DayCardStrip({ dates, todayKey, tasksByDay, dayTitles, locationsByDay, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: setStripRef } = useScrollArrows('x', [dates.length]);

    return (
        <div className="day-row-strip-wrap">
            {canBack && (
                <button key="scroll-up" className={'day-row-arrow day-row-arrow-left' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll left" onClick={scrollBack}><CollapseChevron rotate={90} size={16} /></button>
            )}
            <div key="scroll-body" className="day-row-strip" ref={setStripRef}>
                {dates.map((dateISO) => (
                    <DayCard
                        key={dateISO}
                        dateISO={dateISO}
                        isToday={dateISO === todayKey}
                        tasks={tasksByDay[dateISO] || []}
                        dayTitle={dayTitles[dateISO] || ''}
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
            {canForward && (
                <button key="scroll-down" className={'day-row-arrow day-row-arrow-right' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll right" onClick={scrollForward}><CollapseChevron rotate={-90} size={16} /></button>
            )}
        </div>
    );
}

export default DayCardStrip;
