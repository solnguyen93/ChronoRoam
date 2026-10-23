import React, { useState } from 'react';
import TaskList from './TaskList';
import CollapseChevron from './CollapseChevron';
import OptionsMenu from './OptionsMenu';
import AiTodoImportModal from './AiTodoImportModal';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useCollapsedSection from '../hooks/useCollapsedSection';

// One of a trip's named to-do lists (several per trip — see TodoList.js on the backend). "New"
// creates a sibling list; "Delete" only appears when canDelete is true (the server refuses
// deleting a trip's last remaining list, so the option is hidden rather than shown-then-rejected).
function TodoPanel({ tripId, list, canDelete, onRename, onDelete, onCreateList, addTodo, updateTodo, deleteTodo, reorderTodos, convertTodoToTask }) {
    const [collapsed, setCollapsed] = useCollapsedSection('chronoroam_collapsed_todos', `${tripId}:${list.id}`);
    const [hideChecked, setHideChecked] = useState(false);
    const [aiImportOpen, setAiImportOpen] = useState(false);
    // 'rename' | 'create' | false — one shared name-prompt modal for both, since they're the same
    // "title, then Save" shape.
    const [namePrompt, setNamePrompt] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const namePromptBackdrop = useBackdropDismiss(() => setNamePrompt(false));
    const todos = list.items;
    const visibleTodos = hideChecked ? todos.filter((t) => !t.done) : todos;

    const displayTitle = list.title || 'To-Do';

    const submitNamePrompt = () => {
        const next = nameDraft.trim();
        const mode = namePrompt;
        setNamePrompt(false);
        if (!next) return;
        if (mode === 'rename') { if (next !== displayTitle) onRename(next); }
        else if (mode === 'create') onCreateList(next);
    };

    const menuItems = [
        { label: 'Import to-dos', onClick: () => setAiImportOpen(true) },
        { label: 'Rename', onClick: () => { setNameDraft(displayTitle); setNamePrompt('rename'); } },
        { label: 'New to-do list', onClick: () => { setNameDraft(''); setNamePrompt('create'); } },
        ...(canDelete ? [{ label: 'Delete this list', onClick: onDelete }] : []),
        // (No "Uncheck all" here: it was easy to tap by mistake.)
        { label: hideChecked ? 'Show checked off' : 'Hide checked off', onClick: () => setHideChecked((h) => !h) },
    ];

    return (
        <div className={'todo-panel' + (collapsed ? ' todo-collapsed' : '')}>
            <div className="panel-head">
                <h2>{displayTitle}</h2>
                <div className="packlist-head-actions" style={{ marginLeft: 'auto' }}>
                    <OptionsMenu title="To-Do options" light items={menuItems} />
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                        <CollapseChevron collapsed={collapsed} size={13} />
                    </button>
                </div>
            </div>
            {!collapsed && (
                <div className="todo-tree-panel" data-todo-target={list.id}>
                    <TaskList
                        items={visibleTodos}
                        onToggle={(id) => { const t = todos.find((x) => x.id === id); updateTodo(id, { done: !t.done }); }}
                        onDelete={(id) => deleteTodo(id)}
                        onRename={(id, text) => updateTodo(id, { text })}
                        onUpdateTags={(id, tags) => updateTodo(id, { tags })}
                        onReorder={(orderedIds) => reorderTodos(orderedIds)}
                        onMoveDay={(todoId, dayDate, targetIndex) => convertTodoToTask(todoId, dayDate, targetIndex)}
                        onAdd={(text) => addTodo(text)}
                    />
                </div>
            )}

            <AiTodoImportModal open={aiImportOpen} onClose={() => setAiImportOpen(false)} addTodo={addTodo} />

            {namePrompt && (
                <div className="modal-overlay open" {...namePromptBackdrop}>
                    <div className="modal-box">
                        <button type="button" className="modal-close-btn" onClick={() => setNamePrompt(false)} aria-label="Close">×</button>
                        <h3>{namePrompt === 'create' ? 'New To-Do List' : 'Rename To-Do List'}</h3>
                        <input
                            autoFocus
                            autoCapitalize="sentences"
                            placeholder="Name *"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitNamePrompt(); }}
                        />
                        <div className="modal-btns">
                            <button className="cancel" onClick={() => setNamePrompt(false)}>Cancel</button>
                            <button className="confirm" disabled={!nameDraft.trim()} onClick={submitNamePrompt}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TodoPanel;
