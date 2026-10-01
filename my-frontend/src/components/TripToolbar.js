import React, { useState } from 'react';
import { searchTrip } from '../utils/tripSearch';
import SearchExpandable from './SearchExpandable';
import TaskCatIcon from './TaskCatIcon';

// The trip page's TODAY button (when today is in the trip) and search box. Search results list
// matching days with their matching items; picking one jumps to that day.
function TripToolbar({ onToday, todayVisible, dates, tasksByDay, dayTitles, onJumpToDay }) {
    const [query, setQuery] = useState('');

    const results = query.trim() ? searchTrip(query, dates, tasksByDay, dayTitles) : [];

    const pick = (dateISO) => {
        setQuery('');
        onJumpToDay(dateISO);
    };

    return (
        <>
            {todayVisible && (
                <button className="trip-toolbar-today trip-toolbar-today-standalone" onClick={onToday}>TODAY</button>
            )}
            <SearchExpandable value={query} onChange={setQuery}>
                {query.trim() && (
                    <div className="trip-search-results">
                        {results.length === 0 && <div className="search-empty">No matches</div>}
                        {results.map((r) => (
                            <button key={r.dateISO} className="search-result" onClick={() => pick(r.dateISO)}>
                                <div className="search-result-head">
                                    <span className="search-result-date">{r.label}</span>
                                    {r.dayTitle && <span className="search-result-dayname">{r.dayTitle}</span>}
                                </div>
                                {r.matchingTasks.map((t, i) => (
                                    <div className="search-result-task" key={i}>
                                        <TaskCatIcon cat={t.cat} fields={t.fields} />
                                        {t.text}
                                    </div>
                                ))}
                            </button>
                        ))}
                    </div>
                )}
            </SearchExpandable>
        </>
    );
}

export default TripToolbar;
