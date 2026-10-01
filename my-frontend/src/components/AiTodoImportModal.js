import React, { useState } from 'react';
import ChronoRoamApi from '../api';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useScrollArrows from '../hooks/useScrollArrows';
import CollapseChevron from './CollapseChevron';

// The to-do import popup: paste a list, AI splits it into items (the same AI call as the packing
// list import, one credit), and each item is added as a to-do. Headings are ignored.
function AiTodoImportModal({ open, onClose, addTodo }) {
    const [text, setText] = useState('');
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [empty, setEmpty] = useState(false);
    const backdrop = useBackdropDismiss(handleClose);
    const { canBack: outerCanBack, canForward: outerCanForward, idle: outerIdle, scrollBack: outerScrollBack, scrollForward: outerScrollForward, ref: outerScrollRef } = useScrollArrows('y', [empty, error]);

    if (!open) return null;

    function handleClose() {
        setText('');
        setError('');
        setEmpty(false);
        onClose();
    }

    async function handleImport() {
        if (!text.trim()) return;
        setImporting(true);
        setError('');
        setEmpty(false);
        try {
            const { groups } = await ChronoRoamApi.extractPacklistItems(text);
            const items = (groups || []).flatMap((g) => g.subgroups.flatMap((sg) => sg.items));
            if (items.length === 0) {
                setEmpty(true);
                return;
            }
            for (const itemText of items) {
                await addTodo(itemText);
            }
            handleClose();
        } catch (err) {
            setError(err.response?.data?.message || "Couldn't extract items from that text. Try again, or add items manually.");
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="modal-overlay modal-overlay-top open" {...backdrop}>
            <div className="modal-box modal-box-flex-scroll">
                <button type="button" className="modal-close-btn" onClick={handleClose} aria-label="Close">×</button>
                <div className="v-scroll-wrap modal-box-outer-scroll-wrap">
                {outerCanBack && (
                    <button key="scroll-up" className={'v-scroll-arrow v-scroll-arrow-up' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll up" onClick={outerScrollBack}><CollapseChevron collapsed={false} size={16} /></button>
                )}
                <div key="scroll-body" className="modal-box-outer-scroll-body" ref={outerScrollRef}>
                <h3>Import to-dos</h3>
                <p className="modal-sub">Paste a list of to-dos below — we'll add each one straight to this list. Any headers in the source text are ignored; fix any mistakes afterward the same way you'd edit anything else here. Each import uses 1 credit, even if nothing is found.</p>
                <textarea
                    className="ai-import-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste your to-do list here…"
                    rows={12}
                />
                {empty && <p className="modal-sub">Nothing found in that text — try a different excerpt, or add items manually.</p>}
                {error && <div className="modal-error">{error}</div>}
                <div className="modal-btns">
                    <button className="cancel" onClick={handleClose} disabled={importing}>Cancel</button>
                    <button className="confirm" onClick={handleImport} disabled={!text.trim() || importing}>
                        {importing ? 'Importing…' : 'Import'}
                    </button>
                </div>
                </div>
                {outerCanForward && (
                    <button key="scroll-down" className={'v-scroll-arrow v-scroll-arrow-down' + (outerIdle ? ' scroll-arrow-idle' : '')} title="Scroll down" onClick={outerScrollForward}><CollapseChevron collapsed={true} size={16} /></button>
                )}
                </div>
            </div>
        </div>
    );
}

export default AiTodoImportModal;
