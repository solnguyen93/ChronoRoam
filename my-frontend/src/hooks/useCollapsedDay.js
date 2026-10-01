import { useCallback, useState } from 'react';

const STORAGE_KEY = 'chronoroam_collapsed_days';

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Whether a day is collapsed, remembered on this device (the same in every view).
function useCollapsedDay(dateISO) {
    const [collapsed, setCollapsedState] = useState(() => !!readAll()[dateISO]);

    const setCollapsed = useCallback((value) => {
        setCollapsedState(value);
        const all = readAll();
        if (value) all[dateISO] = true;
        else delete all[dateISO];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }, [dateISO]);

    return [collapsed, setCollapsed];
}

export default useCollapsedDay;
