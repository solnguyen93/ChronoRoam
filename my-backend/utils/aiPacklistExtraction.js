// Pasted packing list -> bags and items, using AI.
const { BadRequestError } = require('../expressError');
const { assertReasonableLength } = require('./aiTextLimits');
const { callStructuredJSON } = require('./aiJsonCall');

// Always Claude (claude-haiku-4-5), whatever AI_EXTRACTION_PROVIDER says: on a long list the
// cheaper model stopped after the first section.
const PACKLIST_PROVIDER = 'anthropic';

// Real names are short; anything longer than this means the AI returned garbage.
const MAX_REASONABLE_FIELD_LENGTH = 200;

// Whether any group, subgroup or item name is too long.
function looksCorrupted(groups) {
    return groups.some((g) =>
        g.groupName.length > MAX_REASONABLE_FIELD_LENGTH ||
        g.subgroups.some((sg) => sg.subgroupName.length > MAX_REASONABLE_FIELD_LENGTH || sg.items.some((it) => it.length > MAX_REASONABLE_FIELD_LENGTH)));
}

// The answer's shape: groups (section headings), each with subgroups (e.g. one per person), each
// with items — two levels of headings, kept as the text has them. The app turns each heading into
// a bag and each subgroup into a bag inside it (AiPacklistImportModal.js).
const PACKLIST_SECTIONS_SCHEMA = {
    type: 'object',
    properties: {
        groups: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    groupName: { type: 'string', description: "The top-level section header these items fall under (e.g. 'Toiletries', 'Clothing + Accessories'), if any. Empty string if there's no such header." },
                    subgroups: {
                        type: 'array',
                        description: "Person/sub-category headers nested inside this section (e.g. 'Nori', 'Stank', 'Me'), if any. If the section's items have no further nesting, use exactly one subgroup with subgroupName '' holding all the items.",
                        items: {
                            type: 'object',
                            properties: {
                                subgroupName: { type: 'string', description: "The nested header's name, e.g. 'Nori'. Empty string if these items sit directly under groupName with no further header." },
                                items: {
                                    type: 'array',
                                    items: { type: 'string', description: "One packing item's text, e.g. 'Passport' or '3 t-shirts'." },
                                },
                            },
                            required: ['subgroupName', 'items'],
                            additionalProperties: false,
                        },
                    },
                },
                required: ['groupName', 'subgroups'],
                additionalProperties: false,
            },
        },
    },
    required: ['groups'],
    additionalProperties: false,
};

// Combines groups with the same name (ignoring case) into one. The AI sometimes repeats a
// heading as separate groups, which would otherwise create duplicate bags.
function mergeSameNameGroups(groups) {
    const byName = new Map();
    const order = [];
    for (const g of groups) {
        const key = g.groupName.toLowerCase();
        if (byName.has(key)) {
            byName.get(key).subgroups.push(...g.subgroups);
        } else {
            const copy = { groupName: g.groupName, subgroups: [...g.subgroups] };
            byName.set(key, copy);
            order.push(key);
        }
    }
    return order.map((key) => byName.get(key));
}

// Reads a pasted packing list (checklists, bullets, numbered lists, blank lines are all fine) into
// groups > subgroups > items. Returns [] when there's nothing list-like. Throws if the answer
// looks broken, since items are added straight away without a review step.
async function extractPacklistItems(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];
    assertReasonableLength(trimmed);

    const parsed = await callStructuredJSON({
        schemaName: 'packlist_sections',
        schema: PACKLIST_SECTIONS_SCHEMA,
        provider: PACKLIST_PROVIDER,
        prompt: `Extract every individual packing/checklist item from this pasted text, preserving up to two levels of header nesting exactly as the source has it: a top-level section header (e.g. "Toiletries", "Clothing + Accessories") and, if present, person/sub-category headers nested inside it (e.g. "Nori", "Stank", "Me"). Do NOT combine the two levels into one name, and do NOT decide to merge sections together — just report the structure as written. It may have bullets, checkboxes ("- [ ]"/"- [x]"), numbering, or other list formatting — strip that, keep just the item itself (including any quantity, e.g. "3 t-shirts"). A header itself (a person's name, a category label) is NOT an item. If a section has no further nesting inside it, put all its items in one subgroup with subgroupName "". If items have no section header at all, use a group with groupName "" and one subgroup with subgroupName "". If nothing list-like is in the text, return an empty groups array.\n\n${trimmed}`,
        refusalMessage: "Couldn't extract items from that text.",
        parseErrorMessage: "Couldn't parse the extracted items.",
        unavailableMessage: 'AI extraction is unavailable right now.',
    });

    // Trim names, and drop empty items, subgroups and groups.
    const groups = parsed && Array.isArray(parsed.groups) ? parsed.groups : [];
    const cleaned = groups
        .map((g) => ({
            groupName: (g.groupName || '').trim(),
            subgroups: (g.subgroups || [])
                .map((sg) => ({ subgroupName: (sg.subgroupName || '').trim(), items: (sg.items || []).map((s) => (s || '').trim()).filter(Boolean) }))
                .filter((sg) => sg.items.length > 0),
        }))
        .filter((g) => g.subgroups.length > 0);
    const merged = mergeSameNameGroups(cleaned);

    // Items are added without a review step, so refuse a broken answer instead of importing it.
    if (looksCorrupted(merged)) {
        throw new BadRequestError("Couldn't extract items cleanly from that text. Try again, or add items manually.");
    }

    return merged;
}

module.exports = { extractPacklistItems };
