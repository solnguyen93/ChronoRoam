// Black is both the default color new bags are created with and the "Black" swatch below.
export const DEFAULT_BAG_COLOR = '#1a1a1a';

// A 13-column grid (see .bag-color-swatches in Planner.css): 12 hues around the color wheel
// (every 30°, red → pink) plus a gray column, and 8 rows of shades going from pale (top) to dark
// (bottom). Black at the bottom of the gray column is DEFAULT_BAG_COLOR, so new bags always
// match a swatch.
const HUES = [
    ['Red', 0], ['Orange', 30], ['Yellow', 60], ['Lime', 90], ['Green', 120], ['Spring Green', 150],
    ['Cyan', 180], ['Azure', 210], ['Blue', 240], ['Violet', 270], ['Magenta', 300], ['Pink', 330],
];
const LIGHTNESS = [90, 80, 70, 60, 50, 40, 30, 20];
// Lightest is off-white, not pure #fff — a pure-white bag's pill and border vanish against the
// white packlist card.
const GRAYS = ['#e8e8e8', '#cccccc', '#b0b0b0', '#949494', '#787878', '#5a5a5a', '#3a3a3a', DEFAULT_BAG_COLOR];

// Fully saturated HSL → hex.
function hslHex(h, l) {
    const a = Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// Flattened row by row, so each row of 13 is one row of the picker. Names read as "Blue 1"
// (palest) … "Blue 8" (darkest) in the swatch tooltip.
export const NAMED_BAG_COLORS = LIGHTNESS.flatMap((l, row) => [
    ...HUES.map(([name, h]) => ({ name: `${name} ${row + 1}`, hex: hslHex(h, l / 100) })),
    { name: `Gray ${row + 1}`, hex: GRAYS[row] },
]);

// Kept for anything that just wants "a color", e.g. picking whichever swatch matches a bag's
// current color to mark it active.
const BAG_COLORS = NAMED_BAG_COLORS.map((c) => c.hex);

export default BAG_COLORS;

// Dark text for light bag colors (like the pale shades and yellows), white text otherwise.
export function textColorForBg(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}
