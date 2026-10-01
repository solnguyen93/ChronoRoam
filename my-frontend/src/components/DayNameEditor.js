import React, { useState } from 'react';

const MAX_LENGTH = 50;

// A day's name (like "Disneyland Day"): tap to edit, up to 25 characters (with a warning), clear it
// by deleting the text. Shows nothing until a name is set. The tap area is bigger than the text.
function DayNameEditor({ dayTitle, onSetDayTitle }) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(dayTitle);

    const commitTitle = () => {
        setEditingTitle(false);
        const val = titleDraft.trim();
        if (val !== dayTitle) onSetDayTitle(val);
    };

    if (editingTitle) {
        return (
            <div className="day-name-edit-wrap" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                <input
                    className="day-name-input"
                    autoFocus
                    autoCapitalize="sentences"
                    maxLength={MAX_LENGTH}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                        if (e.key === 'Escape') { setTitleDraft(dayTitle); setEditingTitle(false); }
                    }}
                />
                {titleDraft.length >= MAX_LENGTH && (
                    <div className="day-name-limit-warning">{MAX_LENGTH} character limit reached</div>
                )}
            </div>
        );
    }

    return (
        <div
            className={'day-name-hit' + (dayTitle ? '' : ' day-name-hit-empty')}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setTitleDraft(dayTitle); setEditingTitle(true); }}
        >
            {dayTitle ? <span className="day-name-text">{dayTitle}</span> : <span className="day-name-plus">+</span>}
        </div>
    );
}

export default DayNameEditor;
