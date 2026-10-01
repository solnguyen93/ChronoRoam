import React from 'react';

// A plus sign for the small round add buttons (sharper than a "+" character at small sizes).
function PlusIcon({ size = 15 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.25 4 H13.75 V10.25 H20 V13.75 H13.75 V20 H10.25 V13.75 H4 V10.25 H10.25 Z" />
        </svg>
    );
}

export default PlusIcon;
