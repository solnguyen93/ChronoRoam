// The 2-minute "how to use ChronoRoam" video, opened from the ⋮ menus on Home, a trip and a
// packlist.
export const TOUR_URL = 'https://www.youtube.com/shorts/4AG3pgatlbU';

// Opens the video the same way as other outside links (a link with target="_blank"), which the
// iPhone app hands to YouTube or Safari.
export function openTour() {
    const a = document.createElement('a');
    a.href = TOUR_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
}
