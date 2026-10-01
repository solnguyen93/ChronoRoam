import { useCallback, useEffect, useState } from 'react';
import ChronoRoamApi, { EMAIL_IMPORT_ENABLED } from '../api';
import { useAuth } from '../AuthContext';

// Forwarded booking emails waiting for review, and the position while stepping through them
// (Previous / Next, then "All caught up" when none are left). Used by the "Emails to Review"
// button and ConfirmationImportModal.js. Guests have no forwarding address, so nothing is fetched.
export function usePendingEmailImports() {
    const { isGuest } = useAuth();
    const [imports, setImports] = useState([]);
    const [index, setIndex] = useState(-1); // which email is shown; -1 = not reviewing
    const [showCaughtUp, setShowCaughtUp] = useState(false);

    // Fetches the waiting emails.
    const refresh = useCallback(() => {
        if (!EMAIL_IMPORT_ENABLED || isGuest) return;
        ChronoRoamApi.getEmailImports().then(({ imports: fetched }) => setImports(fetched)).catch(() => {});
    }, [isGuest]);

    useEffect(() => {
        refresh();
        // Fetch again when the app comes back into view and every minute, so a newly forwarded
        // email shows up.
        const onFocus = () => refresh();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        const interval = setInterval(refresh, 60000);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
            clearInterval(interval);
        };
    }, [refresh]);

    // Starts at the first email.
    const startReview = () => {
        setShowCaughtUp(false);
        setIndex(0);
    };

    const goPrevious = () => setIndex((i) => Math.max(0, i - 1));
    const goNext = () => setIndex((i) => Math.min(imports.length - 1, i + 1));

    // Removes the email just added or discarded and shows the next one (or "All caught up").
    const resolveCurrent = () => {
        setImports((prev) => {
            const resolvedId = prev[index]?.id;
            const next = prev.filter((imp) => imp.id !== resolvedId);
            if (next.length === 0) {
                setIndex(-1);
                setShowCaughtUp(true);
            } else if (index >= next.length) {
                setIndex(next.length - 1);
            }
            return next;
        });
    };

    // Closes the review.
    const closeReview = () => {
        setIndex(-1);
        setShowCaughtUp(false);
    };

    return {
        count: imports.length,
        current: imports[index] || null,
        hasPrevious: index > 0,
        hasNext: index >= 0 && index < imports.length - 1,
        position: index >= 0 ? { current: index + 1, total: imports.length } : null,
        showCaughtUp,
        startReview,
        goPrevious,
        goNext,
        resolveCurrent,
        closeReview,
        refresh,
    };
}
