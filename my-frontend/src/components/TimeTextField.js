import React from 'react';
import { to24Hour } from '../utils/dateHelpers';

// A text time field (like "10:00 AM") for the booking email review screen. For afternoon times it
// also shows the 24-hour time, like "(14:00)".
function TimeTextField({ value, onChange }) {
    const t24 = to24Hour(value);
    const hour = t24 ? parseInt(t24.split(':')[0], 10) : 0;
    return (
        <div className="time-field-row">
            <input type="text" value={value} onChange={onChange} />
            {hour > 12 && <span className="time-24h-badge time-24h-badge-text">({t24})</span>}
        </div>
    );
}

export default TimeTextField;
