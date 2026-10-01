// The Small / Big text size setting (Account). Saved on this device only (localStorage). It only
// changes the size of trip and packing list items: item rows (.task-wrap in Planner.css) use the
// chosen scale (--content-scale); everything else stays at normal size.
const STORAGE_KEY = 'chronoroam_text_scale';

// Small = 14px items (the default), Big = 16px (14 x 16/14).
export const TEXT_SCALE_PRESETS = { small: 1, big: 16 / 14 };
const DEFAULT_KEY = 'small';
// Older saved sizes map to the two current ones.
const LEGACY_KEYS = { normal: 'small', large: 'big', xlarge: 'big', xxlarge: 'big' };

// The saved size ('small' or 'big'); 'small' if none.
export function getTextScaleKey() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && TEXT_SCALE_PRESETS[stored]) return stored;
        return LEGACY_KEYS[stored] || DEFAULT_KEY;
    } catch {
        return DEFAULT_KEY;
    }
}

// Saves and applies a size (AccountModal.js calls this when Save is pressed).
export function setTextScaleKey(key) {
    const resolved = TEXT_SCALE_PRESETS[key] ? key : DEFAULT_KEY;
    try {
        localStorage.setItem(STORAGE_KEY, resolved);
    } catch {
        // Can't save (e.g. private browsing): the size still applies until the page reloads.
    }
    const scale = TEXT_SCALE_PRESETS[resolved];
    // Item rows use --content-scale; the other scale variables stay at 1.
    document.documentElement.style.setProperty('--content-scale', String(scale));
    // Lets the CSS also enlarge the add/edit item form on Big.
    document.documentElement.dataset.textSize = resolved;
    document.documentElement.style.setProperty('--text-scale', '1');
    document.documentElement.style.setProperty('--capped-scale', '1');
    document.documentElement.style.setProperty('--page-scale', '1');
}

// Applies the saved size when the app starts (index.js), before anything is drawn.
export function initTextScale() {
    setTextScaleKey(getTextScaleKey());
}
