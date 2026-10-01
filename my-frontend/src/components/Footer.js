import React from 'react';
import { Link } from 'react-router-dom';

function Footer() {
    return (
        <div className="site-footer">
            <Link to="/privacy">Privacy Policy</Link>
            <span className="site-footer-sep">·</span>
            <Link to="/terms">Terms of Service</Link>
            <span className="site-footer-sep">·</span>
            <Link to="/contact">Contact</Link>
        </div>
    );
}

export default Footer;
