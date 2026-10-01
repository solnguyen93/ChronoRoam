// Words that mark a packing list item as a battery or power bank (matched anywhere in the text,
// ignoring case; see matchesBatteryWarning). Add more here as needed.
export const BATTERY_ITEM_PHRASES = [
    'portable charger',
    'battery pack',
    'external battery',
    'power bank',
    'power pack',
    'charging pack',
    'portable battery',
];

export function matchesBatteryWarning(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return BATTERY_ITEM_PHRASES.some((phrase) => lower.includes(phrase));
}

export const BATTERY_WARNING_TEXT =
    'Spare lithium batteries and power banks must go in carry-on baggage, not checked luggage. ' +
    'Most airlines limit them to 100Wh (some allow up to 160Wh with airline approval). Check your ' +
    "battery's Wh rating and your airline's specific policy before flying.";
