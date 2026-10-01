import React from 'react';
import useBackdropDismiss from '../hooks/useBackdropDismiss';

// The 2-minute "how to use ChronoRoam" video (YouTube), played in a popup from the Home ⋮ menu.
// It fills about 90% of the screen, with a × to close.
// Uses youtube-nocookie.com, which sets no cookies until the video is played. The player is only
// added while the popup is open, so it loads nothing otherwise.
const TOUR_VIDEO_ID = '4AG3pgatlbU';

function TourModal({ open, onClose }) {
    const backdrop = useBackdropDismiss(onClose);
    if (!open) return null;

    return (
        <div className="modal-overlay open" {...backdrop}>
            <div className="tour-modal">
                <button type="button" className="modal-close-btn tour-close" onClick={onClose} aria-label="Close">×</button>
                <div className="tour-video">
                    <iframe
                        src={`https://www.youtube-nocookie.com/embed/${TOUR_VIDEO_ID}?playsinline=1&rel=0`}
                        title="How to use ChronoRoam"
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                    />
                </div>
            </div>
        </div>
    );
}

export default TourModal;
