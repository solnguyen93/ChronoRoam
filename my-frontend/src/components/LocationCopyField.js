import React, { useState } from 'react';
import PlaceAutocompleteInput from './PlaceAutocompleteInput';
import CopyIcon from './CopyIcon';

// A place field (with suggestions) plus a copy button, shown once there's text — handy for pasting
// the place into a maps app. Used on the add/edit item form and the booking email review screen.
function LocationCopyField({ value, onChange, searchFn, getFillValue }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Copying isn't allowed here; the text can still be selected by hand.
        }
    }

    return (
        <div className="location-copy-row">
            <PlaceAutocompleteInput value={value} onChange={onChange} searchFn={searchFn} getFillValue={getFillValue} />
            {value && (
                <button
                    type="button"
                    className="location-copy-btn"
                    onClick={handleCopy}
                    aria-label="Copy"
                    title={copied ? 'Copied!' : 'Copy'}
                >
                    <CopyIcon copied={copied} />
                </button>
            )}
        </div>
    );
}

export default LocationCopyField;
