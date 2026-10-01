import React from 'react';
import { CAT_ICON_IMAGES } from '../utils/catIconImages';

// The icon for an item's category (from catIconImages.js), shown on day items and in trip search.
const IMAGE_ICONS = {
    'flight-depart': CAT_ICON_IMAGES.flightDepart,
    'flight-arrive': CAT_ICON_IMAGES.flightArrive,
    flight: CAT_ICON_IMAGES.flight, // a flight with no airports yet (see iconKeyFor)
    'lodging-checkin': CAT_ICON_IMAGES.lodging,
    'lodging-checkout': CAT_ICON_IMAGES.lodging,
    'transportation-depart': CAT_ICON_IMAGES.transportation,
    'transportation-arrive': CAT_ICON_IMAGES.transportation,
    ferry: CAT_ICON_IMAGES.ferry,
    direction: CAT_ICON_IMAGES.direction,
    restaurant: CAT_ICON_IMAGES.restaurant,
    'car-pickup': CAT_ICON_IMAGES.car,
    'car-return': CAT_ICON_IMAGES.car,
    car: CAT_ICON_IMAGES.car, // legacy tasks created before the pickup/return split
    activity: CAT_ICON_IMAGES.activity,
    tour: CAT_ICON_IMAGES.tour,
};

// Transportation named with one of these words gets a ferry icon instead of the bus.
const FERRY_WORDS = /\b(ferry|ferries|boat|water taxi|hovercraft|hydrofoil|catamaran)\b/i;

// Which icon to use for an item.
function iconKeyFor(cat, fields) {
    // A flight with no airports yet gets the level plane (neither taking off nor landing).
    if ((cat === 'flight-depart' || cat === 'flight-arrive') && !fields?.depAirport && !fields?.arrAirport) {
        return 'flight';
    }
    if ((cat === 'transportation-depart' || cat === 'transportation-arrive') && FERRY_WORDS.test(fields?.name || '')) {
        return 'ferry';
    }
    return cat;
}

function TaskCatIcon({ cat, fields }) {
    const key = iconKeyFor(cat, fields);
    if (!IMAGE_ICONS[key]) return null;
    return <span className="task-cat-icon task-cat-icon-img"><img src={IMAGE_ICONS[key]} alt="" /></span>;
}

export default TaskCatIcon;
