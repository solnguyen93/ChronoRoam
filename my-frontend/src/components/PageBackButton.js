import React from 'react';
import { Link } from 'react-router-dom';

// The < button on the Privacy, Terms and Contact pages. Goes to "/", like the logo (Home when
// signed in, the sign-in page otherwise).
function PageBackButton() {
    return (
        <Link to="/" className="back-btn page-back-btn" aria-label="Back to Home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                <path d="M4 9.1 L12 17.1 L20 9.1 L17.8 6.9 L12 12.7 L6.2 6.9 Z" />
            </svg>
        </Link>
    );
}

export default PageBackButton;
