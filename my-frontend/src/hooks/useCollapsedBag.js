import { useCallback, useState } from 'react';

const STORAGE_KEY = 'chronoroam_collapsed_bags';

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Whether a bag is collapsed, remembered on this device. Each bag, nested or not, has its own setting.
function useCollapsedBag(bagId) {
    const [collapsed, setCollapsedState] = useState(() => !!readAll()[bagId]);

    const setCollapsed = useCallback((value) => {
        setCollapsedState(value);
        const all = readAll();
        if (value) all[bagId] = true;
        else delete all[bagId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }, [bagId]);

    return [collapsed, setCollapsed];
}

export default useCollapsedBag;
