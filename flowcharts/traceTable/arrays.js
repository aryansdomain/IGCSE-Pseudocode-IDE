import { varsTable, makeVarsTh, addColResizeHandle, addRowResizeHandle, updateColButtons, syncNaturalRowHeight, colId } from './table.js';
import { card, traceTableWrap }                                                                                  from './traceTable.js';
import { save }                                                                                                  from './storage.js';

const TYPE_WORDS = new Set(['ARRAY', 'OF', 'INTEGER', 'REAL', 'STRING', 'BOOLEAN', 'CHAR', 'DATE']);

export let arrayTypes = {};
export function setArrayTypes(o) { arrayTypes = o; }

// extract the trace columns from pseudocode.
// returns { columns: [labels], arrays: [{ name, count }] } where an array
// contributes one `name[i]` column per element (1-based)
export function getVars(code) {
    const lines = code.split('\n').map(l => l.trim());

    // pass 1: find array names + their upper bound (lower assumed 1)
    const arrayUpper = new Map(); // lowercase name -> known upper (0 = size unknown)
    for (const line of lines) {
        // DECLARE arr : ARRAY[l:u] OF T  -> exact bound
        const d = line.match(/^DECLARE\s+(\w+)\s*:\s*ARRAY\s*\[\s*\d+\s*:\s*(\d+)\s*\]/i);
        if (d) {
            const k = d[1].toLowerCase();
            arrayUpper.set(k, Math.max(arrayUpper.get(k) ?? 0, parseInt(d[2], 10)));
        }
        // any  name[ index ]  usage
        for (const am of line.matchAll(/([A-Za-z]\w*)\s*\[\s*([^\]]*)\]/g)) {
            if (TYPE_WORDS.has(am[1].toUpperCase())) continue;
            const k = am[1].toLowerCase();
            if (!arrayUpper.has(k)) arrayUpper.set(k, 0);
            const idx = parseInt(am[2], 10);
            if (Number.isInteger(idx)) arrayUpper.set(k, Math.max(arrayUpper.get(k), idx)); // literal index grows the array
        }
    }
    const isArr = (name) => arrayUpper.has(String(name).toLowerCase());

    // pass 2: first-appearance order of every identifier (scalar or array base)
    const order = [];
    const seen  = new Set();
    const note  = (name) => { const k = name.toLowerCase(); if (!seen.has(k)) { seen.add(k); order.push(name); } };

    for (const line of lines) {
        const hits = []; // { pos, name } in left-to-right order

        // assignment / FOR target (word before <-)
        const ai = line.indexOf('<-');
        if (ai !== -1) {
            const before = line.slice(0, ai);
            const mm = before.match(/([A-Za-z]\w*)\s*(?:\[[^\]]*\])?\s*$/);
            if (mm) hits.push({ pos: mm.index, name: mm[1] });
        }
        // DECLARE / INPUT target
        const dt = line.match(/^(?:DECLARE|INPUT)\s+(\w+)/i);
        if (dt) hits.push({ pos: 0, name: dt[1] });
        // array usages
        for (const am of line.matchAll(/([A-Za-z]\w*)\s*\[/g)) {
            if (!TYPE_WORDS.has(am[1].toUpperCase())) hits.push({ pos: am.index, name: am[1] });
        }

        hits.sort((a, b) => a.pos - b.pos);
        for (const h of hits) note(h.name);
    }

    // build columns + array metadata, preserving any size the table already shows
    const arrays  = [];
    const columns = [];
    for (const name of order) {
        if (isArr(name)) {
            const detected = arrayUpper.get(name.toLowerCase());
            const existing = arrayCountInTable(name);
            const count = Math.max(detected || 0, existing);
            arrays.push({ name, count });
            for (let i = 1; i <= count; i++) columns.push(`${name}[${i}]`);
        } else {
            columns.push(name);
        }
    }
    return { columns, arrays };
}

// how many `name[i]` columns the current table already has for an array (preserves +/- edits)
export function arrayCountInTable(name) {
    if (!varsTable) return 0;
    const lower = String(name).toLowerCase();
    let count = 0;
    for (const th of varsTable.tHead.rows[0].cells) {
        const m = colId(th).match(/^(\w+)\s*\[\s*(\d+)\s*\]$/);
        if (m && m[1].toLowerCase() === lower) count = Math.max(count, parseInt(m[2], 10));
    }
    return count;
}

// unique array names currently shown in the table, in column order
export function currentArrays() {
    if (!varsTable) return [];
    const seen = new Set();
    const names = [];
    for (const th of varsTable.tHead.rows[0].cells) {
        const m = colId(th).match(/^(\w+)\s*\[\s*\d+\s*\]$/);
        if (m && !seen.has(m[1].toLowerCase())) { seen.add(m[1].toLowerCase()); names.push({ name: m[1] }); }
    }
    return names;
}

// strip of per-array controls (type selector + add-element button) above the table
export function renderArrayControls(arrays) {
    card.querySelector('.array-controls')?.remove();
    if (!arrays || !arrays.length) return;

    const strip = document.createElement('div');
    strip.className = 'array-controls';

    for (const { name } of arrays) {
        const k = name.toLowerCase();
        if (!arrayTypes[k]) arrayTypes[k] = 'INTEGER';

        const group = document.createElement('div');
        group.className = 'array-control';

        const label = document.createElement('span');
        label.className = 'array-name';
        label.textContent = `${name}[ ]`;

        const select = document.createElement('select');
        select.className = 'array-type';
        for (const t of ['INTEGER', 'REAL', 'STRING', 'BOOLEAN']) {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            if (arrayTypes[k] === t) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => { arrayTypes[k] = select.value; save(); });

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'array-add';
        addBtn.title = `Add an element to ${name}`;
        addBtn.textContent = '+';
        addBtn.addEventListener('click', () => addArrayColumn(name));

        group.append(label, select, addBtn);
        strip.appendChild(group);
    }

    traceTableWrap.before(strip); // sit above the tables, outside the side-by-side flex row
}

// append a new element column name[next] to the end of the array
export function addArrayColumn(name) {
    if (!varsTable) return;
    const next = arrayCountInTable(name) + 1;

    // once column widths have been pinned (load() does this, and sets the table's own
    // width to 0 for the fixed layout) an unsized column collapses to nothing, so the
    // new one has to be given a width — the array's other elements are the right size
    const cells   = [...varsTable.tHead.rows[0].cells];
    const lower   = `${name.toLowerCase()}[`;
    const sibling = cells.filter(th => colId(th).toLowerCase().startsWith(lower)).pop() ?? cells[cells.length - 1];
    const pinned  = sibling?.style.width ? sibling.getBoundingClientRect().width : 0;

    // header
    const th = makeVarsTh(`${name}[${next}]`, varsTable);
    if (pinned) {
        th.style.width    = `${pinned}px`;
        th.style.minWidth = `${pinned}px`;
    }
    varsTable.tHead.rows[0].appendChild(th);

    // body cells (insert before the row-remove cell when it lives on varsTable)
    for (const row of varsTable.tBodies[0].rows) {
        const removeCell = row.querySelector('td.col-remove');
        const td = removeCell ? row.insertBefore(document.createElement('td'), removeCell) : row.insertCell();
        // only row 0 is typed into: it holds the array's starting values
        td.appendChild(Object.assign(document.createElement('span'),
            { className: 'cell-text', contentEditable: String(row.sectionRowIndex === 0) }));
        addColResizeHandle(td);
        addRowResizeHandle(td);
    }

    updateColButtons(varsTable);
    for (let i = 0; i < varsTable.tBodies[0].rows.length; i++) syncNaturalRowHeight(i);
    save();

    try {
        window.trace_array_sized && window.trace_array_sized({ trace_array_sized_elements: next });
    } catch {}
}

// arrays the chart uses but the table holds no elements for, as a message ready to show.
// an array only ever indexed by a variable (arr[i]) cannot be sized from the chart, so it
// has no columns until the + button adds them — and with no columns nothing declares it,
// leaving the run to fail with "name arr is not defined"
export function checkArraySizes(arrays) {
    const empty = (arrays ?? []).filter(a => !a.count).map(a => a.name);
    if (!empty.length) return null;
    return `${empty.join(', ')} ${empty.length > 1 ? 'have' : 'has'} no elements — use + above the table to add them`;
}

// whether a row-0 cell can be seeded as the array's chosen type. blanks are allowed:
// a blank STRING cell seeds as "", any other blank leaves the element uninitialized
function fitsType(value, type) {
    const text = String(value).trim();
    if (!text) return true;

    switch (String(type).toUpperCase()) {
        case 'INTEGER': return Number.isInteger(Number(text)); // 5.0 counts, the interpreter accepts it
        case 'REAL':    return Number.isFinite(Number(text));
        case 'BOOLEAN': return /^(TRUE|FALSE)$/i.test(text);
        default:        return true;                          // STRING takes anything
    }
}

// the first row-0 cell that does not fit its array's type, as a message ready to show.
// without this the cell is pasted into the run as pseudocode, where `abc` reads as an
// undefined variable and the student gets a NameError about a name they never wrote
export function checkArrayValues() {
    for (const { name, lower, type, vals } of getArraySpecs()) {
        for (let i = 0; i < vals.length; i++) {
            if (fitsType(vals[i], type)) continue;
            return `${name}[${lower + i}] is not a valid ${String(type).toUpperCase()} (found "${String(vals[i]).trim()}")`;
        }
    }
    return null;
}

// read each array's run spec from the table: { name, lower, upper, type, values[] from row 0 }
export function getArraySpecs() {
    if (!varsTable) return [];
    const groups = new Map(); // lowercase name -> { name, cells: [{ index, col }] }
    const headerCells = varsTable.tHead.rows[0].cells;
    for (let c = 0; c < headerCells.length; c++) {
        const m = colId(headerCells[c]).match(/^(\w+)\s*\[\s*(\d+)\s*\]$/);
        if (!m) continue;
        const k = m[1].toLowerCase();
        if (!groups.has(k)) groups.set(k, { name: m[1], cells: [] });
        groups.get(k).cells.push({ index: parseInt(m[2], 10), col: c });
    }

    const row0 = varsTable.tBodies[0].rows[0];
    const specs = [];
    for (const { name, cells } of groups.values()) {
        const lower = 1;
        const upper = Math.max(...cells.map(x => x.index));
        const vals = [];
        for (const { index, col } of cells) {
            vals[index - lower] = row0?.cells[col]?.querySelector('.cell-text')?.textContent ?? '';
        }
        specs.push({ name, lower, upper, type: arrayTypes[name.toLowerCase()] || 'INTEGER', vals });
    }
    return specs;
}
