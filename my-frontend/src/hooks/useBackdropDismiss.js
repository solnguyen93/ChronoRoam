import { useRef } from 'react';

// Click handlers for a popup's dark background that close the popup only when both the press and
// the release are on the background itself — so dragging to select text inside the popup and
// letting go outside it doesn't close it. Spread them onto the .modal-overlay element.
export default function useBackdropDismiss(onClose) {
    const downOnOverlay = useRef(false);
    return {
        onMouseDown: (e) => { downOnOverlay.current = e.target === e.currentTarget; },
        onClick: (e) => {
            if (downOnOverlay.current && e.target === e.currentTarget) onClose();
            downOnOverlay.current = false;
        },
    };
}
