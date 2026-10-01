import React from 'react';
import RecentEmojiButton from './RecentEmojiButton';
import { startsWithEmoji, toggleLeadingEmoji, TODO_SHORTCUT_EMOJI } from '../utils/recentEmoji';

// Emoji buttons for to-dos and plain day items: tapping 🍗 on "inandout" makes it "🍗 inandout", the
// same as typing it (it can be deleted like any text), and tapping again removes it. Several can
// be combined ("🍗🛍️ inandout"). The last button is the recent emoji (RecentEmojiButton). These are
// emoji characters, so each device shows its own emoji style.
const [FOOD, CAFE, SHOPPING] = TODO_SHORTCUT_EMOJI;
const SHORTCUTS = [
    { emoji: FOOD, title: 'Food', className: 'item-tag-food' },
    { emoji: CAFE, title: 'Cafe', className: 'item-tag-cafe' },
    { emoji: SHOPPING, title: 'Shopping', className: 'item-tag-shopping' },
];

// The buttons. `text` / `onTextChange` are the item's text being edited (or a new item's).
export function TodoTags({ text, onTextChange }) {
    return (
        <div className="item-tags" onClick={(e) => e.stopPropagation()}>
            {SHORTCUTS.map(({ emoji, title, className }) => (
                <button
                    key={emoji}
                    type="button"
                    className={`item-tag ${className}${startsWithEmoji(text, emoji) ? ' active' : ''}`}
                    title={title}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onTextChange(toggleLeadingEmoji(text || '', emoji))}
                >
                    <span className="tag-emoji" aria-hidden="true">{emoji}</span>
                </button>
            ))}
            <RecentEmojiButton scope="todo" text={text} onTextChange={onTextChange} exclude={TODO_SHORTCUT_EMOJI} />
        </div>
    );
}

// Older items saved these as separate tags (not in the text); they're shown as small badges.
const LEGACY_TAGS = [
    { key: 'food', emoji: '🍗', className: 'item-tag-food' },
    { key: 'cafe', emoji: '☕', className: 'item-tag-cafe' },
    { key: 'shopping', emoji: '🛍️', className: 'item-tag-shopping' },
];

// The badges for an older item's tags (nothing if none).
export function TodoTagBadges({ tags = {} }) {
    const active = LEGACY_TAGS.filter(({ key }) => tags[key]);
    if (!active.length) return null;
    return (
        <div className="item-tags item-tags-badges">
            {active.map(({ key, emoji, className }) => (
                <span key={key} className={`item-tag ${className} active`}><span className="tag-emoji" aria-hidden="true">{emoji}</span></span>
            ))}
        </div>
    );
}
