import { useEffect, useRef } from 'react';
import { BASE_URL, CLIENT_ID } from '../api';
import { isReorderDragActive } from '../utils/reorderGuard';

// Keeps a live connection to the server (my-backend/routes/liveRoutes.js) and calls onChange when
// someone else changes one of `keys` (like "trip:<publicId>" or "packlist:<publicId>"). Pass an
// empty list to stay disconnected: pages only connect for shared trips and lists.
// Also calls onChange after reconnecting (a dropped connection may have missed changes).
// Changes that arrive mid-drag wait until the drag ends, since reloading then scrambles rows.
function useLiveUpdates(keys, onChange) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const keyString = [...keys].sort().join(',');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!keyString || !token || typeof EventSource === 'undefined') return undefined;
        const url = `${BASE_URL}/live?keys=${encodeURIComponent(keyString)}&clientId=${CLIENT_ID}&token=${encodeURIComponent(token)}`;
        const source = new EventSource(url);
        let timer = null;
        let hasOpened = false;

        // Several changes in a row (like typing) become one reload.
        const reloadSoon = () => {
            clearTimeout(timer);
            timer = setTimeout(function run() {
                if (isReorderDragActive()) { timer = setTimeout(run, 500); return; }
                onChangeRef.current();
            }, 300);
        };
        source.onmessage = reloadSoon;
        source.onopen = () => {
            if (hasOpened) reloadSoon();
            hasOpened = true;
        };
        return () => {
            clearTimeout(timer);
            source.close();
        };
    }, [keyString]);
}

export default useLiveUpdates;
