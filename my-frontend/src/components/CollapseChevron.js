import React from 'react';

// The chevron used on every collapse button and scroll arrow: points down when collapsed, up when
// open. `rotate` (degrees) points it another way, e.g. 90 / -90 for left and right arrows.
function CollapseChevron({ collapsed, size = 15, rotate }) {
    const deg = rotate !== undefined ? rotate : (collapsed ? 0 : 180);
    return (
        <svg
            className="collapse-chevron"
            style={{ transform: `rotate(${deg}deg)` }}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path d="M4 9.1 L12 17.1 L20 9.1 L17.8 6.9 L12 12.7 L6.2 6.9 Z" />
        </svg>
    );
}

export default CollapseChevron;
