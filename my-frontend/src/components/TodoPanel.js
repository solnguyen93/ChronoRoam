import React, { useState } from 'react';
import TaskList from './TaskList';
import CollapseChevron from './CollapseChevron';
import OptionsMenu from './OptionsMenu';
import AiTodoImportModal from './AiTodoImportModal';
import useBackdropDismiss from '../hooks/useBackdropDismiss';
import useCollapsedSection from '../hooks/useCollapsedSection';

function TodoPanel({ tripId, title, onRename, todos, addTodo, updateTodo, deleteTodo, reorderTodos, convertTodoToTask }) {
    const [collapsed, setCollapsed] = useCollapsedSection('chronoroam_collapsed_todos', tripId);
    const [hideChecked, setHideChecked] = useState(false);
    const [aiImportOpen, setAiImportOpen] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [renameDraft, setRenameDraft] = useState('');
    const renameBackdrop = useBackdropDismiss(() => setRenaming(false));
    const visibleTodos = hideChecked ? todos.filter((t) => !t.done) : todos;

    const displayTitle = title || 'To-Do';

    const submitRename = () => {
        const next = renameDraft.trim();
        setRenaming(false);
        if (next !== displayTitle) onRename(next);
    };

    return (
        <div className={'todo-panel' + (collapsed ? ' todo-collapsed' : '')}>
            <div className="panel-head">
                <h2>{displayTitle}</h2>
                <div className="packlist-head-actions" style={{ marginLeft: 'auto' }}>
                    <OptionsMenu
                        title="To-Do options"
                        light
                        items={[
                            { label: 'Import to-dos', onClick: () => setAiImportOpen(true) },
                            { label: 'Rename', onClick: () => { setRenameDraft(displayTitle); setRenaming(true); } },
                            // (No "Uncheck all" here: it was easy to tap by mistake.)
                            { label: hideChecked ? 'Show checked off' : 'Hide checked off', onClick: () => setHideChecked((h) => !h) },
                        ]}
                    />
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                        <CollapseChevron collapsed={collapsed} size={13} />
                    </button>
                </div>
            </div>
            {!collapsed && (
                <div className="todo-tree-panel" data-todo-target="true">
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

            {renaming && (
                <div className="modal-overlay open" {...renameBackdrop}>
                    <div className="modal-box">
                        <button type="button" className="modal-close-btn" onClick={() => setRenaming(false)} aria-label="Close">×</button>
                        <h3>Rename To-Do</h3>
                        <input
                            autoFocus
                            autoCapitalize="sentences"
                            placeholder="Name *"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); }}
                        />
                        <div className="modal-btns">
                            <button className="cancel" onClick={() => setRenaming(false)}>Cancel</button>
                            <button className="confirm" onClick={submitRename}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TodoPanel;
