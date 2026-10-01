import React from 'react';
import DayNameEditor from './DayNameEditor';
import TaskList from './TaskList';
import useWeather from '../hooks/useWeather';
import useScrollArrows from '../hooks/useScrollArrows';
import WeatherIcon from './WeatherIcon';
import CollapseChevron from './CollapseChevron';
import { DOW_SHORT, MON_SHORT, parseISO } from '../utils/dateHelpers';

function CheckIcon() {
    return (
        <svg className="day-card-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" />
        </svg>
    );
}

// One day as a card, with its date, weather, name and items (all editable). Used by the column view
// (a row of cards side by side, each growing with its items) and, with `square`, by the calendar
// view (a fixed-size square whose items scroll inside it; smaller squares show less, see
// Planner.css, and a ✓ when items are hidden).
function DayCard({ dateISO, tasks, dayTitle, location, showLocationLabel, isToday, square, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const weather = useWeather(dateISO, location, weatherLocked);
    const d = parseISO(dateISO);
    const hasItems = tasks.length > 0;
    const { canBack, canForward, idle, scrollBack, scrollForward, ref: tasksScrollRef } = useScrollArrows('y', [tasks.length]);

    // Weather: a real forecast shows an icon and "72°/58°"; further out (beyond about 16 days) it's
    // the typical weather, shown as "~72°/58°" with no icon.
    const weatherTemp = weather && (weather.historical
        ? <span className="day-row-cell-weather day-row-cell-weather-historical">~{weather.hi}°/{weather.lo}°{weather.unit}</span>
        : <span className="day-row-cell-weather"><WeatherIcon kind={weather.icon} /> {weather.hi}°/{weather.lo}°{weather.unit}</span>);
    // Column view cards also show the city under the temperature (when showLocationLabel is set).
    const weatherContent = !square && showLocationLabel
        ? <>{weatherTemp}<span className="day-row-cell-weather-city">{location.city}</span></>
        : weatherTemp;

    const className = 'day-row-cell'
        + (square ? ' day-card-square' : '')
        + (isToday ? ' day-row-cell-today' : '');

    return (
        <div className={className} id={'day-' + dateISO} data-day-date={dateISO}>
            <div className="day-row-cell-top">
                <div className="day-row-cell-heading">
                    <div className="day-row-cell-date-wrap">
                        <div className="day-row-cell-date">
                            {!square && <span className="day-card-month">{MON_SHORT[d.getMonth()]} </span>}
                            {square && isToday ? <span className="day-date-today-circle">{d.getDate()}</span> : d.getDate()}
                        </div>
                        {!square && <div className="day-row-cell-dow">{DOW_SHORT[d.getDay()]}</div>}
                    </div>
                    {/* Column view: the day's name, next to the date. */}
                    {!square && (
                        <div className={'day-name-center' + (dayTitle ? '' : ' day-name-center-empty')}>
                            <DayNameEditor dayTitle={dayTitle} onSetDayTitle={onSetDayTitle} />
                        </div>
                    )}
                    <div className="day-row-cell-side">
                        {square && (weather || hasItems) && (
                            <div className="day-row-cell-weather-row day-row-cell-weather-row-square">
                                {weatherContent}
                                {hasItems && <CheckIcon />}
                            </div>
                        )}
                        {!square && (
                            <div className="day-row-cell-weather-row">
                                {weatherContent}
                            </div>
                        )}
                    </div>
                </div>
                {/* Calendar view: the day's name on its own line below the date and weather. */}
                {square && <DayNameEditor dayTitle={dayTitle} onSetDayTitle={onSetDayTitle} />}
            </div>
            {square ? (
                <div className="v-scroll-wrap day-tasks-scroll-wrap">
                    {canBack && (
                        <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={scrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                    )}
                    <div key="scroll-body" className="day-row-cell-tasks" ref={tasksScrollRef}>
                        <TaskList
                            items={tasks}
                            onToggle={onToggle}
                            onDelete={onDelete}
                            onRename={onRename}
                            onUpdateTags={onUpdateTags}
                            onEditCat={onEditCat}
                            onReorder={onReorder}
                            onMoveDay={onMoveDay}
                            onMoveToTodo={onMoveToTodo}
                            onAdd={onAdd}
                            disableSwipe={!square}
                        />
                    </div>
                    {canForward && (
                        <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (idle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={scrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                    )}
                </div>
            ) : (
                <div className="day-row-cell-tasks">
                    <TaskList
                        items={tasks}
                        onToggle={onToggle}
                        onDelete={onDelete}
                        onRename={onRename}
                        onUpdateTags={onUpdateTags}
                        onEditCat={onEditCat}
                        onReorder={onReorder}
                        onMoveDay={onMoveDay}
                        onMoveToTodo={onMoveToTodo}
                        onAdd={onAdd}
                        disableSwipe={!square}
                    />
                </div>
            )}
        </div>
    );
}

export default DayCard;
