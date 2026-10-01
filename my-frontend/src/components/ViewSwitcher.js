import React from 'react';

function RowIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="18" height="4" rx="1.3" />
            <rect x="3" y="10" width="18" height="4" rx="1.3" />
            <rect x="3" y="17" width="18" height="4" rx="1.3" />
        </svg>
    );
}

function ColumnIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="3" width="4" height="18" rx="1.3" />
            <rect x="10" y="3" width="4" height="18" rx="1.3" />
            <rect x="17" y="3" width="4" height="18" rx="1.3" />
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="16" y1="2" x2="16" y2="6" />
        </svg>
    );
}

// The three trip views: row (☰, days stacked top to bottom), column (|||, days side by side) and calendar.
const VIEWS = [
    { key: 'row', label: 'Row view', Icon: RowIcon },
    { key: 'column', label: 'Column view', Icon: ColumnIcon },
    { key: 'calendar', label: 'Calendar view', Icon: CalendarIcon },
];

function ViewSwitcher({ view, onChange }) {
    return (
        <div className="view-switcher">
            {VIEWS.map(({ key, label, Icon }) => (
                <button
                    key={key}
                    className={'view-switcher-btn' + (view === key ? ' active' : '')}
                    title={label}
                    onClick={() => onChange(key)}
                >
                    <Icon />
                </button>
            ))}
        </div>
    );
}

export default ViewSwitcher;
