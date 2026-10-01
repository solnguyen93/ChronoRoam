// While dragging an item or bag, raises every bag it's inside, so what's being dragged isn't hidden
// under other bags (each bag is its own layer, see Planner.css). Starts from the element's parent.
// Returns a function that undoes it.
export function raiseAncestorBags(el) {
    const bags = [];
    let node = el.parentElement;
    while (node) {
        if (node.classList?.contains('packlist-bag')) bags.push(node);
        node = node.parentElement;
    }
    bags.forEach((b) => { b.style.zIndex = 9999; });
    return () => bags.forEach((b) => { b.style.zIndex = ''; });
}
