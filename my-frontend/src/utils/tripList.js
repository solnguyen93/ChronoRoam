// Remembers, on this device, where each user last was ('home' or a trip), so opening the app
// again goes back there. Stored per user, so a different account on the same device never opens
// the previous user's trip.
const LOCATION_KEY_PREFIX = 'chronoroam_last_location_';

// This user's last place: 'home', a trip's public id, or null.
export function getLastLocation(userId) {
    if (!userId) return null;
    return localStorage.getItem(LOCATION_KEY_PREFIX + userId);
}

// Saves this user's last place.
export function setLastLocation(userId, location) {
    if (!userId) return;
    localStorage.setItem(LOCATION_KEY_PREFIX + userId, location);
}
