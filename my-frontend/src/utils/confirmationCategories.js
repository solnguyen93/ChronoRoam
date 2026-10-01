// Booking categories for the email review screen (ConfirmationImportModal.js), and what happens to
// the entries' fields when the user changes the category.

// Categories grouped by the fields they use: 'leg' (flight, transportation: depart and arrive),
// 'stay' (lodging: check-in and check-out), 'rental' (car: pickup and return), 'direction', and
// 'item' (restaurant, tour, activity: one date and time).
export const SHAPE = { flight: 'leg', transportation: 'leg', lodging: 'stay', car: 'rental', direction: 'direction', restaurant: 'item', tour: 'item', activity: 'item' };

// The fields that differ between flight and transportation (the dates, times and duration are shared).
export const LEG_CATEGORY_FIELDS = {
    flight: ['flightNumber', 'depAirport', 'arrAirport'],
    transportation: ['name', 'from', 'to'],
};

// Empty fields for each group.
export const SHAPE_BLANK = {
    leg: { flightNumber: '', depAirport: '', arrAirport: '', name: '', from: '', to: '', depDate: '', depTime: '', arrDate: '', arrTime: '', duration: '' },
    stay: { name: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '' },
    rental: { name: '', pickupDate: '', pickupTime: '', returnDate: '', returnTime: '', location: '' },
    item: { name: '', date: '', time: '', duration: '', location: '' },
    direction: { from: '', to: '', date: '', time: '', duration: '' },
};

// Category names, in the same order as the add item form's picker (AddItemModal.js).
export const CATEGORY_LABELS = { flight: 'Flight', lodging: 'Lodging', restaurant: 'Restaurant', transportation: 'Transportation', direction: 'Direction', car: 'Car', tour: 'Tour', activity: 'Activity' };
export const CATEGORY_TABS = Object.keys(CATEGORY_LABELS).map((key) => ({ key, label: CATEGORY_LABELS[key] }));

// The entries after changing category: within flight/transportation, clears only the fields that
// differ; between groups (e.g. flight -> lodging), starts from empty fields, keeping only link and
// notes; within 'item', nothing changes.
export function reassignLegsForCategory(legs, prevCategory, nextCategory) {
    const prevShape = SHAPE[prevCategory];
    const nextShape = SHAPE[nextCategory];
    if (prevShape === nextShape && nextShape === 'leg') {
        const blankOnly = Object.fromEntries(LEG_CATEGORY_FIELDS[nextCategory].map((f) => [f, '']));
        return legs.map((leg) => ({ ...leg, ...blankOnly }));
    }
    if (prevShape !== nextShape) {
        return legs.map((leg) => ({ ...SHAPE_BLANK[nextShape], link: leg.link, notes: leg.notes }));
    }
    return legs; // within 'item': the fields are the same
}
