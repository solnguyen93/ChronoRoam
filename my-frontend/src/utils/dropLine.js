// The line shown while dragging, marking where the item would land. Created when a drag starts,
// moved as the finger moves, removed when the drag ends. Uses screen (fixed) positions.
export function createDropLine() {
    // Remove any line a previous drag left behind, just in case.
    document.querySelectorAll('.drag-drop-line').forEach((stray) => stray.remove());
    const line = document.createElement('div');
    line.className = 'drag-drop-line';
    document.body.appendChild(line);
    return {
        // Shows the line along the top or bottom edge of targetEl (landing before or after it).
        // original = true uses a different color, for the item's own starting spot (no change).
        showAt(targetEl, edge, original = false) {
            const rect = targetEl.getBoundingClientRect();
            line.style.left = rect.left + 'px';
            line.style.width = rect.width + 'px';
            line.style.top = (edge === 'top' ? rect.top : rect.bottom) + 'px';
            line.style.display = 'block';
            line.classList.toggle('drag-drop-line-original', original);
        },
        hide() {
            line.style.display = 'none';
        },
        remove() {
            line.remove();
        },
    };
}
