// US state and territory codes, matched against "City, XX" locations. Only the US is treated as
// Fahrenheit.
const US_STATES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'GU', 'VI',
]);

// 'F' or 'C' for a home location like "Seattle, WA" or "Paris, France": 'F' for the US (or no
// location), 'C' for everywhere else.
function getTempUnitFromLocation(location) {
    if (!location) return 'F';
    const trimmed = location.trim();
    if (/\busa\b/i.test(trimmed) || /\bunited states\b/i.test(trimmed)) return 'F';
    const match = trimmed.match(/,\s*([A-Za-z]{2})\b/);
    if (match && US_STATES.has(match[1].toUpperCase())) return 'F';
    return 'C';
}

module.exports = { getTempUnitFromLocation };
