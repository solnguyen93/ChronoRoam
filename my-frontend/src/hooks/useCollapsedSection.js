import { useCallback, useState } from 'react';

function readAll(storageKey) {
    try {
        return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch (e) {
        return {};
    }
}

// Whether a trip page panel (Trip Tips, To-Do, ...) is collapsed for this trip, remembered on this
// device under storageKey.
function useCollapsedSection(storageKey, tripId) {
    const [collapsed, setCollapsedState] = useState(() => !!readAll(storageKey)[tripId]);

    const setCollapsed = useCallback((value) => {
        setCollapsedState(value);
        const all = readAll(storageKey);
        if (value) all[tripId] = true;
        else delete all[tripId];
        localStorage.setItem(storageKey, JSON.stringify(all));
    }, [storageKey, tripId]);

    return [collapsed, setCollapsed];
}

export default useCollapsedSection;
