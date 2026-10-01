// Plug types and voltage by country, and the plug notes for Trip Tips. A fixed list of common
// travel countries (no API call); a country not on the list gets no plug notes.
const OUTLET_TYPES = {
    Japan: 'Type A/B, 100V, 50Hz (east) / 60Hz (west)',
    'United States': 'Type A/B, 120V, 60Hz',
    'United States of America': 'Type A/B, 120V, 60Hz',
    Canada: 'Type A/B, 120V, 60Hz',
    Mexico: 'Type A/B, 127V, 60Hz',
    Portugal: 'Type C/F, 230V, 50Hz',
    Spain: 'Type C/F, 230V, 50Hz',
    France: 'Type C/E, 230V, 50Hz',
    Italy: 'Type C/F/L, 230V, 50Hz',
    Germany: 'Type C/F, 230V, 50Hz',
    Austria: 'Type C/F, 230V, 50Hz',
    Switzerland: 'Type C/J, 230V, 50Hz',
    'United Kingdom': 'Type G, 230V, 50Hz',
    Ireland: 'Type G, 230V, 50Hz',
    Netherlands: 'Type C/F, 230V, 50Hz',
    Belgium: 'Type C/E, 230V, 50Hz',
    Greece: 'Type C/F, 230V, 50Hz',
    Iceland: 'Type C/F, 230V, 50Hz',
    Norway: 'Type C/F, 230V, 50Hz',
    Sweden: 'Type C/F, 230V, 50Hz',
    Denmark: 'Type C/F/K, 230V, 50Hz',
    Croatia: 'Type C/F, 230V, 50Hz',
    'Czech Republic': 'Type C/E, 230V, 50Hz',
    Czechia: 'Type C/E, 230V, 50Hz',
    Poland: 'Type C/E, 230V, 50Hz',
    Turkey: 'Type C/F, 230V, 50Hz',
    'South Korea': 'Type C/F, 220V, 60Hz',
    China: 'Type A/C/I, 220V, 50Hz',
    // Hong Kong uses UK-style plugs, unlike mainland China.
    'Hong Kong': 'Type G, 220V, 50Hz',
    Macau: 'Type G/M, 220V, 50Hz',
    Taiwan: 'Type A/B, 110V, 60Hz',
    Thailand: 'Type A/B/C, 220V, 50Hz',
    Vietnam: 'Type A/C, 220V, 50Hz',
    Singapore: 'Type G, 230V, 50Hz',
    Indonesia: 'Type C/F, 230V, 50Hz',
    Malaysia: 'Type G, 240V, 50Hz',
    Philippines: 'Type A/B/C, 220V, 60Hz',
    India: 'Type C/D/M, 230V, 50Hz',
    Australia: 'Type I, 230V, 50Hz',
    'New Zealand': 'Type I, 230V, 50Hz',
    Brazil: 'Type C/N, 127V/220V (varies by region), 60Hz',
    Argentina: 'Type C/I, 220V, 50Hz',
    Peru: 'Type A/B/C, 220V, 60Hz',
    'South Africa': 'Type C/M/N, 230V, 50Hz',
    Morocco: 'Type C/E, 220V, 50Hz',
    Egypt: 'Type C/F, 220V, 50Hz',
    'United Arab Emirates': 'Type C/D/G, 230V, 50Hz',
};

// The outlet string for a country ("Type C/F, 230V, 50Hz"), matching the name ignoring case, or null.
function getOutletType(country) {
    if (!country) return null;
    if (OUTLET_TYPES[country]) return OUTLET_TYPES[country];
    const normalized = country.trim().toLowerCase();
    const match = Object.keys(OUTLET_TYPES).find((k) => k.toLowerCase() === normalized);
    return match ? OUTLET_TYPES[match] : null;
}

// Shorter names for a few home countries in the plug notes ("USA" instead of "United States").
const SHORT_COUNTRY_NAMES = {
    'United States': 'USA',
    'United States of America': 'USA',
    'United Kingdom': 'UK',
};

// The plug letters from an outlet string: "Type C/F, 230V, 50Hz" -> ['C', 'F'].
function extractPlugTypes(outletString) {
    const m = (outletString || '').match(/^Type ([A-Z/]+)/);
    return m ? m[1].split('/') : [];
}

// What each plug type looks like, so people can compare with their own chargers.
const PLUG_SHAPES = {
    A: 'flat two-pin, no ground',
    B: 'flat two-pin plus a round ground pin (3-prong)',
    C: 'two round pins',
    D: 'three round pins in a triangle (large, old-style)',
    E: 'two round pins, ground socket on the plug',
    F: 'two round pins, ground clips on the sides (Schuko)',
    G: 'three rectangular pins (UK-style)',
    I: 'two flat pins in a V shape, sometimes plus ground',
    J: 'three round pins (Swiss-style)',
    K: 'two round pins, ground pin on the plug',
    L: 'three round pins in a row (Italian-style)',
    M: 'three large round pins (South African-style)',
    N: 'three round pins (Brazilian-style)',
};

// Says which of the home plugs fit: ['A','B'] at an ['A','C'] destination -> "Type A (...) will
// fit, Type B (...) won't fit".
function describePlugFit(homeTypes, destTypes) {
    return homeTypes
        .map((t) => `Type ${t} (${PLUG_SHAPES[t] || 'shape not on file'}) ${destTypes.includes(t) ? 'will fit' : "won't fit"}`)
        .join(', ');
}

// The first voltage in an outlet string: "Type A/B, 120V, 60Hz" -> 120. (For "127V/220V" it takes 127.)
function extractVoltage(outletString) {
    const m = (outletString || '').match(/(\d+)V/);
    return m ? parseInt(m[1], 10) : null;
}

// The plug note for a destination, in parts (used when there are several places, so shared
// sentences can be written once — see buildMultiOutlets in aiRoutes.js):
//   verdictPhrase: "Same plugs as USA" / "Some outlets use the same plug as USA" / "Different from USA"
//   typesComparison: the plug types and voltages, e.g. "Type G, 220V, 50Hz vs. USA's Type A/B, 120V, 60Hz"
//   advisory: whether an adapter is needed
//   voltageNote: a warning when the voltage differs from home ('' otherwise)
// "Same plugs" only when every home plug type is used at the destination. Returns null when the
// home country isn't on the list.
function compareOutletsParts(destOutletString, homeCountry) {
    if (!destOutletString || !homeCountry) return null;
    const homeOutletString = getOutletType(homeCountry);
    if (!homeOutletString) return null;

    const destTypes = extractPlugTypes(destOutletString);
    const homeTypes = extractPlugTypes(homeOutletString);
    const homeLabel = SHORT_COUNTRY_NAMES[homeCountry] || homeCountry;

    const fullMatch = homeTypes.length > 0 && homeTypes.every((t) => destTypes.includes(t));
    const partialMatch = !fullMatch && destTypes.some((t) => homeTypes.includes(t));

    const destVoltage = extractVoltage(destOutletString);
    const homeVoltage = extractVoltage(homeOutletString);
    const voltageNote = (destVoltage != null && homeVoltage != null && destVoltage !== homeVoltage)
        ? `Voltage here is ${destVoltage}V vs. ${homeLabel}'s ${homeVoltage}V — fine for dual-voltage electronics (most phone/laptop chargers say "100-240V" on the label), but check before plugging in single-voltage appliances like hair dryers.`
        : '';

    if (fullMatch) {
        return {
            verdictPhrase: `Same plugs as ${homeLabel}`,
            typesComparison: destOutletString,
            advisory: 'no adapter needed.',
            voltageNote,
        };
    }
    if (partialMatch) {
        return {
            verdictPhrase: `Some outlets use the same plug as ${homeLabel}`,
            typesComparison: `${destOutletString} vs. ${homeLabel}'s ${homeOutletString}`,
            advisory: `${describePlugFit(homeTypes, destTypes)} — bring an adapter for the ones that won't.`,
            voltageNote,
        };
    }
    return {
        verdictPhrase: `Different from ${homeLabel}`,
        typesComparison: `${destOutletString} vs. ${homeLabel}'s ${homeOutletString}`,
        advisory: "you'll need a plug adapter.",
        voltageNote,
    };
}

// The plug note for one destination as a single sentence, e.g. "Different from USA — you'll need
// a plug adapter. (Type G, ... vs. USA's Type A/B, ...)", plus the voltage warning when it
// differs. Returns just the outlet string when the home country isn't on the list.
function compareOutlets(destOutletString, homeCountry) {
    if (!destOutletString || !homeCountry) return destOutletString;
    const homeOutletString = getOutletType(homeCountry);
    if (!homeOutletString) return destOutletString;

    const destTypes = extractPlugTypes(destOutletString);
    const homeTypes = extractPlugTypes(homeOutletString);
    const homeLabel = SHORT_COUNTRY_NAMES[homeCountry] || homeCountry;

    const fullMatch = homeTypes.length > 0 && homeTypes.every((t) => destTypes.includes(t));
    const partialMatch = !fullMatch && destTypes.some((t) => homeTypes.includes(t));

    const destVoltage = extractVoltage(destOutletString);
    const homeVoltage = extractVoltage(homeOutletString);
    const voltageNote = (destVoltage != null && homeVoltage != null && destVoltage !== homeVoltage)
        ? ` Voltage here is ${destVoltage}V vs. ${homeLabel}'s ${homeVoltage}V — fine for dual-voltage electronics (most phone/laptop chargers say "100-240V" on the label), but check before plugging in single-voltage appliances like hair dryers.`
        : '';

    if (fullMatch) {
        return `Same plugs as ${homeLabel} — no adapter needed. (${destOutletString})${voltageNote}`;
    }
    if (partialMatch) {
        return `Some outlets use the same plug as ${homeLabel}, but not all: ${describePlugFit(homeTypes, destTypes)} — bring an adapter for the ones that won't. (${destOutletString} vs. ${homeLabel}'s ${homeOutletString})${voltageNote}`;
    }
    return `Different from ${homeLabel} — you'll need a plug adapter. (${destOutletString} vs. ${homeLabel}'s ${homeOutletString})${voltageNote}`;
}

// Whether two country names are the same country, ignoring case and treating "USA", "US" and
// "United States of America" as "United States". Used to skip plug notes for trips at home.
const COUNTRY_ALIASES = { 'united states of america': 'united states', usa: 'united states', us: 'united states' };
function normalizeCountryName(country) {
    if (!country) return '';
    const n = country.trim().toLowerCase();
    return COUNTRY_ALIASES[n] || n;
}
function sameCountry(a, b) {
    return !!a && !!b && normalizeCountryName(a) === normalizeCountryName(b);
}

module.exports = { getOutletType, compareOutlets, compareOutletsParts, sameCountry };
