import React from 'react';

// A row of pill-shaped tabs (like Sign In / Create Account, or Small / Big). `onSelect` gets the
// picked tab's key.
function TabSwitcher({ tabs, activeKey, onSelect, wrap }) {
    return (
        <div className={'auth-tabs' + (wrap ? ' auth-tabs-wrap' : '')}>
            {tabs.map((t) => (
                <button key={t.key} type="button" className={activeKey === t.key ? 'active' : ''} onClick={() => onSelect(t.key)}>
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export default TabSwitcher;
