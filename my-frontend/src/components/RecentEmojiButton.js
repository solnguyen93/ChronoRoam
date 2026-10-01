import React from 'react';
import { useRecentEmoji, sameEmoji, startsWithEmoji, toggleLeadingEmoji } from '../utils/recentEmoji';

// The last emoji button on to-do and packing list items: the last emoji typed at the start of an
// item. Tapping it adds or removes that emoji at the start of the item's text, exactly as if it
// had been typed (see recentEmoji.js). Hidden until an emoji has been typed once, and when it's
// already one of the row's other buttons (`exclude`). `text`/`onTextChange` are the row's draft.
function RecentEmojiButton({ scope, text, onTextChange, exclude = [] }) {
    const recent = useRecentEmoji(scope);
    if (!recent || !onTextChange || exclude.some((e) => sameEmoji(e, recent))) return null;
    return (
        <button
            type="button"
            className={'item-tag item-tag-recent' + (startsWithEmoji(text, recent) ? ' active' : '')}
            title="Recent emoji"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTextChange(toggleLeadingEmoji(text || '', recent))}
        >
            <span className="tag-emoji" aria-hidden="true">{recent}</span>
        </button>
    );
}

export default RecentEmojiButton;
