import React, { useState } from 'react';
import EyeIcon from './EyeIcon';

// A password field with a show/hide button. Takes the same props as a normal input.
function PasswordInput({ value, onChange, ...rest }) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="password-input-wrap">
            <input type={visible ? 'text' : 'password'} value={value} onChange={onChange} {...rest} />
            <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setVisible((v) => !v)}
                tabIndex={-1}
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                <EyeIcon open={visible} />
            </button>
        </div>
    );
}

export default PasswordInput;
