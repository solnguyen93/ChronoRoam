import React from 'react';

// The lock icon on locked buttons (a guest's New Trip at their limit, imports at 0 credits).
function LockIcon({ width = 16, height = 16 }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    );
}

export default LockIcon;
