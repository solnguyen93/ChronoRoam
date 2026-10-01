import { useCallback, useState } from 'react';

const STORAGE_KEY = 'chronoroam_collapsed_linked_packlists';

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Whether a trip's linked packing list card is collapsed, remembered on this device.
function useCollapsedPacklist(packlistId) {
    const [collapsed, setCollapsedState] = useState(() => !!readAll()[packlistId]);

    const setCollapsed = useCallback((value) => {
        setCollapsedState(value);
        const all = readAll();
        if (value) all[packlistId] = true;
        else delete all[packlistId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }, [packlistId]);

    return [collapsed, setCollapsed];
}

export default useCollapsedPacklist;
