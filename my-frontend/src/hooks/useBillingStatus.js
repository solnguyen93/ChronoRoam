import { useCallback, useEffect, useState } from 'react';
import ChronoRoamApi from '../api';
import { useAuth } from '../AuthContext';

// The signed-in user's credits and limits, fetched from the server (GET /billing/status), plus a
// refresh() to fetch again. Fields are undefined while loading or when signed out, so treat that as
// "not known yet".
export function useBillingStatus() {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);

    // Returns the fetched status (not just void), so a caller can check the new balance instead
    // of trusting that the refresh happened.
    const refresh = useCallback(() => {
        if (!user) { setStatus(null); return Promise.resolve(null); }
        return ChronoRoamApi.getBillingStatus().then((s) => { setStatus(s); return s; }).catch(() => null);
    }, [user]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { ...status, refresh };
}
