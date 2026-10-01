import React from 'react';
import { Link } from 'react-router-dom';

// The < button next to a trip's or packing list's title. Goes to Home with the matching tab
// ('trips' or 'packlists') open. Same chevron shape as CollapseChevron, turned to point left.
function BackButton({ tab = 'trips' }) {
    return (
        <Link to="/home" state={{ tab }} className="back-btn" aria-label="Back to Home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                <path d="M4 9.1 L12 17.1 L20 9.1 L17.8 6.9 L12 12.7 L6.2 6.9 Z" />
            </svg>
        </Link>
    );
}

export default BackButton;
