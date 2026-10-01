import { getNames } from 'country-list';
import majorCities from './majorCities.json';

// Place names (every country, and about 1,500 of the biggest cities) for spotting a place in a
// trip title without a network call (see resolveTitleLocation in dayLocations.js).

// Country names, without the "(the)" some official names have.
const countryNames = getNames().map((n) => n.replace(/\s*\(the\)$/i, ''));

// City names from majorCities.json (the biggest ~1,500 cities; only the name is used here).
const cityNames = majorCities.map((c) => c.name);
const allNames = [...countryNames, ...cityNames];

// Lowercase, without accents ("Cancún" -> "cancun"), for matching.
export function normalizeForMatch(str) {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Every place name, lowercased and without accents.
const PLACE_NAMES = new Set(allNames.map(normalizeForMatch));

// The most words in any place name, e.g. "Democratic Republic of the Congo", which limits how many
// words at a time need checking.
export const MAX_PLACE_NAME_WORDS = Math.max(...allNames.map((n) => n.split(/\s+/).length));

export default PLACE_NAMES;
