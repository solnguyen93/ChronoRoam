import { useEffect } from 'react';

// On trip and packing list pages, pulling down past the top on an iPhone shows whatever is behind
// the page. This paints a cream strip, the height of the header, behind it while the page is
// scrolled to the top, so the pull shows cream instead of the navy background. (It sets a class
// and a CSS variable directly, not React state, since scrolling happens constantly.)
export default function useAtTopBackdrop() {
    // Runs after every render: the scrolling area only exists once the page's data has loaded.
    useEffect(() => {
        const el = document.querySelector('.detail-page-scroll-body');
        const page = el?.closest('.detail-page');
        if (!el || !page) return undefined;
        // Save the header's height (the strip's height) and turn the strip on only at the top.
        const update = () => {
            const header = el.querySelector(':scope > header');
            if (header) page.style.setProperty('--header-h', header.offsetHeight + 'px');
            page.classList.toggle('at-top', el.scrollTop <= 0);
        };
        update();
        el.addEventListener('scroll', update, { passive: true });
        // Measure again when the header changes size (e.g. text size), not just on scroll.
        const header = el.querySelector(':scope > header');
        const observer = header && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        if (observer) observer.observe(header);
        // Stop listening when the page closes.
        return () => {
            el.removeEventListener('scroll', update);
            if (observer) observer.disconnect();
        };
    });
}
