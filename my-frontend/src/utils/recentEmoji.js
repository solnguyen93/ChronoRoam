import { useEffect, useState } from 'react';

// Emoji at the start of an item's text: reading them, the emoji buttons' add/remove, and the
// "recent emoji" button (RecentEmojiButton.js), which offers the last emoji typed at the start of
// an item ("🌳 park" -> 🌳). There are two recent emoji, one for to-dos and day items ('todo',
// recorded by useTripData.js) and one for packing lists ('packlist', recorded by api.js), saved on
// this device (localStorage).
const storageKey = (scope) => `chronoroam_recent_${scope}_emoji`;
const CHANGE_EVENT = 'chronoroam-recent-emoji';

// The to-do row's fixed emoji buttons (TodoTags.js); these never become the recent emoji.
export const TODO_SHORTCUT_EMOJI = ['🍗', '☕', '🛍️'];
// The packing list row's fixed emoji buttons (warm weather, cold weather, pack last minute).
export const PACKLIST_SHORTCUT_EMOJI = ['☀️', '❄️', '⏰'];
const SHORTCUTS_BY_SCOPE = { todo: TODO_SHORTCUT_EMOJI, packlist: PACKLIST_SHORTCUT_EMOJI };

// One emoji at the start of the text, including multi-part ones (skin tones, flags, ZWJ
// sequences like the family emoji), plus any spaces before it.
const ONE_LEADING_EMOJI_RE = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\p{Emoji_Modifier}|\u200D(?:\p{Extended_Pictographic})\uFE0F?)*)/u;

// Splits "🍗🛍️ inandout" into { emojis: ['🍗', '🛍️'], rest: 'inandout' } — every emoji at the
// start of the text (spaces between them allowed). No leading emoji returns [] and the text as is.
export function splitLeadingEmojis(text) {
    let rest = text || '';
    const emojis = [];
    for (;;) {
        const m = ONE_LEADING_EMOJI_RE.exec(rest);
        // ©, ® and ™ count as pictographic but read as text, not an emoji tag.
        if (!m || /^[\u00A9\u00AE\u2122]/.test(m[1])) break;
        emojis.push(m[1]);
        rest = rest.slice(m[0].length);
    }
    if (!emojis.length) return { emojis, rest: text || '' };
    return { emojis, rest: rest.replace(/^\s+/, '') };
}

// "🍗" or "🍗🛍️" with nothing else — an emoji button tapped on an empty new-item row. Add rows
// don't save these as items on their own; they wait for the actual text.
export function isOnlyEmoji(text) {
    const { emojis, rest } = splitLeadingEmojis(text);
    return emojis.length > 0 && !rest.trim();
}

// Same emoji, ignoring the invisible variation selector some keyboards add (☕ vs ☕️).
export function sameEmoji(a, b) {
    return !!a && !!b && a.replace(/\uFE0F/g, '') === b.replace(/\uFE0F/g, '');
}

// Called with an item's text on save — remembers the last leading emoji that isn't already one
// of that row's fixed buttons ("🍗🌳 park" → 🌳).
export function noteRecentEmoji(text, scope = 'todo') {
    if (typeof text !== 'string') return;
    const shortcuts = SHORTCUTS_BY_SCOPE[scope] || [];
    const emoji = splitLeadingEmojis(text).emojis.filter((e) => !shortcuts.some((s) => sameEmoji(s, e))).pop();
    if (emoji && emoji !== getRecentEmoji(scope)) setRecentEmoji(emoji, scope);
}

// An emoji button's tap: removes `emoji` from the leading emoji if it's there, otherwise adds it
// after the ones already there — tapping 🍗 then 🛍️ on "inandout" gives "🍗🛍️ inandout".
export function toggleLeadingEmoji(text, emoji) {
    const { emojis, rest } = splitLeadingEmojis(text);
    const next = emojis.some((e) => sameEmoji(e, emoji))
        ? emojis.filter((e) => !sameEmoji(e, emoji))
        : [...emojis, emoji];
    return next.length ? `${next.join('')} ${rest}` : rest;
}

// Whether `emoji` is among the text's leading emoji (lights up that button).
export function startsWithEmoji(text, emoji) {
    return splitLeadingEmojis(text).emojis.some((e) => sameEmoji(e, emoji));
}

// The saved recent emoji, or null.
export function getRecentEmoji(scope = 'todo') {
    try {
        return localStorage.getItem(storageKey(scope)) || null;
    } catch {
        return null;
    }
}

// Saves the recent emoji and tells every open emoji row to update.
export function setRecentEmoji(emoji, scope = 'todo') {
    try {
        localStorage.setItem(storageKey(scope), emoji);
    } catch {
        // Can't save (e.g. private browsing): the item keeps its emoji; only the button isn't updated.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

// The recent emoji, updating whenever a new one is saved.
export function useRecentEmoji(scope = 'todo') {
    const [emoji, setEmoji] = useState(() => getRecentEmoji(scope));
    useEffect(() => {
        const update = () => setEmoji(getRecentEmoji(scope));
        window.addEventListener(CHANGE_EVENT, update);
        return () => window.removeEventListener(CHANGE_EVENT, update);
    }, [scope]);
    return emoji;
}
