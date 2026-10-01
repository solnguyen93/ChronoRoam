import { useEffect, useState } from 'react';
import { parseISO } from '../utils/dateHelpers';

// The countdown right now.
function compute(startISO, endISO) {
    const now = new Date();
    const start = parseISO(startISO);
    const diffStart = Math.ceil((start - now) / 86400000);
    if (diffStart > 0) {
        return { num: String(diffStart), label: diffStart === 1 ? 'day until departure' : 'days until departure' };
    }
    // No countdown once the trip has started.
    return null;
}

// Days until the trip starts, like { num: '12', label: 'days until departure' }, updated every
// minute; null once it has started.
function useCountdown(startISO, endISO) {
    const [countdown, setCountdown] = useState(() => compute(startISO, endISO));

    useEffect(() => {
        setCountdown(compute(startISO, endISO));
        const id = setInterval(() => setCountdown(compute(startISO, endISO)), 60000);
        return () => clearInterval(id);
    }, [startISO, endISO]);

    return countdown;
}

export default useCountdown;
