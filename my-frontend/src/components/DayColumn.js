import React from 'react';
import TaskList from './TaskList';
import DayNameEditor from './DayNameEditor';
import CollapseChevron from './CollapseChevron';
import WeatherIcon from './WeatherIcon';
import useWeather from '../hooks/useWeather';
import useCollapsedDay from '../hooks/useCollapsedDay';
import { DOW_SHORT, MON_SHORT, parseISO } from '../utils/dateHelpers';

function DayColumn({ dateISO, tasks, isToday, dayTitle, location, showLocationLabel, weatherLocked, onToggle, onDelete, onRename, onUpdateTags, onEditCat, onReorder, onMoveDay, onMoveToTodo, onAdd, onSetDayTitle }) {
    const [collapsed, setCollapsed] = useCollapsedDay(dateISO);
    const weather = useWeather(dateISO, location, weatherLocked);
    const d = parseISO(dateISO);
    const hasFlight = tasks.some((t) => t.flight);
    const hasTrip = tasks.length > 0;

    const className = 'day-col'
        + (hasFlight ? ' flight-day' : hasTrip ? ' trip-day' : '')
        + (isToday ? ' today' : '')
        + (collapsed ? ' day-collapsed' : '');

    return (
        <div className={className} id={'day-' + dateISO} data-day-date={dateISO}>
            <div className="day-head">
                <div className="day-head-top">
                    <div className="day-date-dow-stack">
                        <span className="day-date">{MON_SHORT[d.getMonth()]} {d.getDate()}</span>
                        <span className="day-dow">{DOW_SHORT[d.getDay()]}</span>
                    </div>
                    <div className={'day-name-center' + (dayTitle ? '' : ' day-name-center-empty')}>
                        <DayNameEditor dayTitle={dayTitle} onSetDayTitle={onSetDayTitle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {weather && (
                            <div className={'weather-chip' + (weather.historical ? ' weather-chip-historical' : '')}>
                                <span className="weather-chip-temp">
                                    {weather.historical
                                        ? <>~{weather.hi}°/{weather.lo}°{weather.unit}</>
                                        : <><WeatherIcon kind={weather.icon} /> {weather.hi}°/{weather.lo}°{weather.unit}</>}
                                </span>
                                {showLocationLabel && <span className="weather-chip-city">{location.city}</span>}
                            </div>
                        )}
                        <button
                            className="collapse-btn"
                            title={collapsed ? 'Expand this day' : 'Minimize this day'}
                            onClick={() => setCollapsed(!collapsed)}
                        >
                            <CollapseChevron collapsed={collapsed} size={13} />
                        </button>
                    </div>
                </div>
            </div>

            {!collapsed && (
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
                />
            )}
        </div>
    );
}

export default DayColumn;
