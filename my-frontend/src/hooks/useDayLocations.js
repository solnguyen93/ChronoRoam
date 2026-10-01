import { useEffect, useMemo, useState } from 'react';
import { resolveDayLocations } from '../utils/dayLocations';
import { dateRange } from '../utils/dateHelpers';

// Each day's location for weather (see utils/dayLocations.js), worked out again only when the
// dates, title, destinations or items change.
function useDayLocations(tripStart, tripEnd, tasksByDay, tripTitle, destinations) {
    const [result, setResult] = useState({ byDay: {}, fallback: null, itineraryPlaces: [] });
    const dateList = useMemo(() => dateRange(tripStart, tripEnd), [tripStart, tripEnd]);
    // The destinations as one string, so a new array with the same places doesn't count as a change.
    const destinationsKey = (destinations || []).join('|');

    useEffect(() => {
        let cancelled = false;
        resolveDayLocations(dateList, tasksByDay, tripTitle, destinations).then((r) => {
            if (!cancelled) setResult(r);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateList, tasksByDay, tripTitle, destinationsKey]);

    return result;
}

export default useDayLocations;
