// Filters a packing list for a search. Shows items whose text matches, and bags whose name matches
// (with all their items) or that contain a match somewhere inside. Used on the trip page and the
// packing list page.
export function filterPacklistTree(items, bags, query) {
    const q = query.trim().toLowerCase();
    if (!q) return { items, bags };

    const bagById = Object.fromEntries(bags.map((b) => [b.id, b]));
    const childBagsOf = {};
    bags.forEach((b) => {
        const key = b.parentBagId == null ? 'root' : b.parentBagId;
        (childBagsOf[key] = childBagsOf[key] || []).push(b);
    });
    const itemsOf = {};
    items.forEach((i) => {
        const key = i.bagId == null ? 'root' : i.bagId;
        (itemsOf[key] = itemsOf[key] || []).push(i);
    });

    const bagNameMatches = {};
    const bagVisible = {};
    const visit = (bagId) => {
        if (bagVisible[bagId] !== undefined) return bagVisible[bagId];
        const nameMatch = bagById[bagId].name.toLowerCase().includes(q);
        bagNameMatches[bagId] = nameMatch;
        const anyItemMatch = (itemsOf[bagId] || []).some((i) => i.text.toLowerCase().includes(q));
        const anyChildBagVisible = (childBagsOf[bagId] || []).some((cb) => visit(cb.id));
        return (bagVisible[bagId] = nameMatch || anyItemMatch || anyChildBagVisible);
    };
    bags.forEach((b) => visit(b.id));

    const filteredBags = bags.filter((b) => bagVisible[b.id]);
    const filteredItems = items.filter((i) => {
        if (i.text.toLowerCase().includes(q)) return true;
        return i.bagId != null && bagNameMatches[i.bagId] && bagVisible[i.bagId];
    });
    return { items: filteredItems, bags: filteredBags };
}
