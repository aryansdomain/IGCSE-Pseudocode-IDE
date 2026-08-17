import { traceTableWrap, addRowBtn, MAX_ROWS } from './traceTable.js';
import { save }                                from './storage.js';

export let varsTable   = null;
export let outputTable = null;
export function setVarsTable(t)   { varsTable   = t; }
export function setOutputTable(t) { outputTable = t; }

// swap two columns across all sections of a table
export function swapCols(table, i, j) {
    if (i === j) return;

    for (const section of [table.tHead, ...table.tBodies]) {
        for (const row of section.rows) {
            const cellI = row.cells[i];
            const cellJ = row.cells[j];
            if (!cellI || !cellJ) continue;

            const nextI = cellI.nextSibling;
            const nextJ = cellJ.nextSibling;

            if (nextI === cellJ) {
                row.insertBefore(cellJ, cellI);
            } else if (nextJ === cellI) {
                row.insertBefore(cellI, cellJ);
            } else {
                row.insertBefore(cellI, nextJ);
                row.insertBefore(cellJ, nextI);
            }
        }
    }
}

// hide left or right buttons on outermost columns
export function updateColButtons(table) {
    const cells = table.tHead.rows[0].cells;
    for (let i = 0; i < cells.length; i++) {
        cells[i].querySelector('.col-left' ).style.display = i === 0                ? 'none' : ''; // left most: no left  button
        cells[i].querySelector('.col-right').style.display = i === cells.length - 1 ? 'none' : ''; // rightmost: no right button
    }
}

// varsTable heading
// shown header text: array elements display just the index ([1], [2], …) since
// the array name is already shown in the array-controls strip above the table
function displayLabel(name) {
    const m = String(name).match(/^(\w+)\s*\[\s*(\d+)\s*\]$/);
    return m ? `[${m[2]}]` : name;
}

// a var column's identity (the full name, e.g. CodeStore[1]), kept on the label
// even though only the short form is displayed
export function colId(th) {
    const label = th?.querySelector('.col-label');
    return (label?.dataset.col ?? label?.textContent ?? '');
}

export function makeVarsTh(name, table) {
    const th = document.createElement('th');

    // left button
    const leftBtn = document.createElement('button');
    leftBtn.className = 'col-move-btn col-left';
    leftBtn.innerHTML = '<i class="fas fa-angle-left"></i>';
    leftBtn.addEventListener('click', () => {
        const idx = [...table.tHead.rows[0].cells].indexOf(th);
        if (idx > 0) {
            swapCols(table, idx, idx - 1);
            updateColButtons(table);
            save();
        }
    });

    // name
    const label = document.createElement('span');
    label.className = 'col-label';
    label.dataset.col = name;             // identity (full name)
    label.textContent = displayLabel(name); // shown text (short for array elements)

    // right button
    const rightBtn = document.createElement('button');
    rightBtn.className = 'col-move-btn col-right';
    rightBtn.innerHTML = '<i class="fas fa-angle-right"></i>';
    rightBtn.addEventListener('click', () => {
        const idx = [...table.tHead.rows[0].cells].indexOf(th);
        if (idx < table.tHead.rows[0].cells.length - 1) {
            swapCols(table, idx, idx + 1);
            updateColButtons(table);
            save();
        }
    });

    // remove column button
    const removeColBtn = document.createElement('button');
    removeColBtn.className = 'col-move-btn col-remove-col';
    removeColBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeColBtn.addEventListener('click', () => {
        const idx = [...table.tHead.rows[0].cells].indexOf(th);
        for (const section of [table.tHead, ...table.tBodies]) {
            for (const row of section.rows) {
                if (row.cells[idx]) row.deleteCell(idx);
            }
        }
        updateColButtons(table);
        save();
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'col-header';
    wrapper.appendChild(leftBtn);
    wrapper.appendChild(label  );
    wrapper.appendChild(rightBtn);

    addColResizeHandle(th);
    th.appendChild(wrapper      );
    th.appendChild(removeColBtn );
    return th;
}

export function addRemoveOutputBtn(th) {
    const btn = document.createElement('button');
    btn.className = 'col-move-btn col-remove-col';
    btn.innerHTML = '<i class="fas fa-times"></i>';
    btn.addEventListener('click', () => {
        for (let i = 0; i < outputTable.tBodies[0].rows.length; i++) {
            const colRemoveTd = outputTable.tBodies[0].rows[i].querySelector('td.col-remove');
            if (colRemoveTd) varsTable.tBodies[0].rows[i]?.appendChild(colRemoveTd);
        }
        outputTable.remove();
        outputTable = null;
        for (let i = 0; i < varsTable.tBodies[0].rows.length; i++) syncNaturalRowHeight(i);
        save();
    });
    th.appendChild(btn);
}

function borderWidth(cell) {
    return Math.max(0, cell.offsetWidth - cell.clientWidth);
}

// smallest width that still fits a header's controls (move buttons + reserved remove-button space)
function colMinWidth(th) {
    const cs = getComputedStyle(th);
    let min = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + borderWidth(th);
    const header = th.querySelector('.col-header');
    if (header) for (const b of header.querySelectorAll('.col-move-btn')) min += b.offsetWidth;
    return Math.max(20, Math.floor(min));
}

// sub-pixel-accurate rendered width of an element's text (unaffected by overflow:hidden/ellipsis,
// unlike scrollWidth which rounds down and can clip the last fraction of a pixel)
function textWidth(el) {
    if (!el || !el.firstChild) return 0;
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
}

// natural width of a fully-expanded header: borders + paddings (incl. reserved
// remove-button space) + move buttons + the full label text
function headerFullWidth(th) {
    const cs = getComputedStyle(th);
    let w = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + borderWidth(th);
    const header = th.querySelector('.col-header');
    if (header) for (const b of header.querySelectorAll('.col-move-btn')) w += b.offsetWidth;
    const label = th.querySelector('.col-label, .output-label');
    if (label) w += textWidth(label);
    return Math.ceil(w);
}

export function addColResizeHandle(cell) {
    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const th = cell.tagName === 'TH'
            ? cell
            : cell.closest('table')?.tHead.rows[0].cells[cell.cellIndex];
        if (!th) return;

        // snapshot all other columns so table-layout: fixed has explicit widths to work from
        const table = th.closest('table');
        if (table) {
            for (const cell of table.tHead.rows[0].cells) {
                if (cell !== th) cell.style.width = cell.getBoundingClientRect().width + 'px';
            }
        }

        const startX = e.clientX;
        const startW = th.getBoundingClientRect().width;
        const minW   = colMinWidth(th); // measure while the header is still at natural size

        // pin the dragged column too before engaging fixed layout, so it doesn't collapse to 0
        th.style.width = startW + 'px';
        if (table) table.style.width = '0px';

        function onMove(e) {
            const w = Math.max(minW, startW + e.clientX - startX);
            th.style.minWidth = w + 'px';
            th.style.width    = w + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp  );

            const table = th.closest('table');
            for (let i = 0; i < (table.tBodies[0].rows.length ?? 0); i++) syncNaturalRowHeight(i);
            save();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp  );
    });
    cell.appendChild(handle);
}

export function setRowHeight(row, height) {
    row.style.height = height == null ? '' : `${height}px`;

    for (const cell of row.cells) {
        const textEl = cell.querySelector('.cell-text');
        if (!textEl) continue;

        if (height == null) {
            textEl.style.maxHeight = '';
            continue;
        }

        const cs = getComputedStyle(cell);
        const verticalPadding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        textEl.style.maxHeight = Math.max(0, height - verticalPadding) + 'px';
    }
}

export function setSyncedRowHeight(rowIndex, height) {
    for (const t of [varsTable, outputTable]) {
        const row = t?.tBodies[0]?.rows[rowIndex];
        if (row) setRowHeight(row, height);
    }
}

export function syncNaturalRowHeight(rowIndex) {
    const rows = [varsTable, outputTable]
        .map(t => t?.tBodies[0]?.rows[rowIndex])
        .filter(Boolean);
    if (!rows.length) return;

    for (const row of rows) setRowHeight(row, null);
    void rows[0].offsetHeight;

    const maxH = Math.max(...rows.map(row => row.offsetHeight));
    setSyncedRowHeight(rowIndex, maxH);
}

export function addRowResizeHandle(td) {
    const handle = document.createElement('div');
    handle.className = 'row-resize-handle';
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tr = td.closest('tr');
        const startY = e.clientY;
        const startH = tr.getBoundingClientRect().height;
        function onMove(e) {
            const h = Math.max(20, startH + e.clientY - startY);
            const idx = tr.sectionRowIndex;
            setSyncedRowHeight(idx, h);
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp  );
            save();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp  );
    });
    td.appendChild(handle);
}

export function addRow() {
    const varsCols = varsTable.tHead.rows[0].cells.length;
    const varsRow  = varsTable.tBodies[0].insertRow();
    const editable = String(varsRow.sectionRowIndex === 0); // only the first row is editable
    for (let i = 0; i < varsCols; i++) {
        const td = varsRow.insertCell();
        td.appendChild(Object.assign(document.createElement('span'), { className: 'cell-text', contentEditable: editable }));
        addColResizeHandle(td);
        addRowResizeHandle(td);
    }

    let targetRow;
    if (outputTable) {
        targetRow = outputTable.tBodies[0].insertRow();
        const outputTd = targetRow.insertCell();
        outputTd.appendChild(Object.assign(document.createElement('span'), { className: 'cell-text', contentEditable: editable }));
        addColResizeHandle(outputTd);
        addRowResizeHandle(outputTd);
    } else {
        targetRow = varsRow;
    }

    const td = targetRow.insertCell();
    td.className = 'col-remove';

    const removeRowBtn = document.createElement('button');
    removeRowBtn.className = 'trace-row-remove';
    removeRowBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeRowBtn.addEventListener('click', () => {
        const row = removeRowBtn.closest('tr').sectionRowIndex;
        varsTable.tBodies[0].deleteRow(row);
        if (outputTable) outputTable.tBodies[0].deleteRow(row);
        updateAddBtn();
        updateRemoveRowBtns();
        syncRowEditability(); // the first row may now be a different row
        save();
    });
    td.appendChild(removeRowBtn);

    syncNaturalRowHeight(varsRow.sectionRowIndex);
}

// only the first row is typed into (it holds an array's starting values). rows are built
// with that fixed at creation, so deleting a row — which promotes a different row to first
// — has to re-apply it, or the table ends up with no editable row at all
export function syncRowEditability() {
    for (const t of [varsTable, outputTable]) {
        if (!t) continue;
        for (const row of t.tBodies[0].rows) {
            const editable = String(row.sectionRowIndex === 0);
            for (const cell of row.cells) {
                const span = cell.querySelector('.cell-text');
                if (span) span.contentEditable = editable;
            }
        }
    }
}

export function tableToRows(table) {
    return [...table.tBodies[0].rows].map(row =>
        [...row.cells].filter(c => !c.classList.contains('col-remove')).map(c => c.textContent)
    );
}

export function rowCount() {
    return varsTable?.tBodies[0].rows.length ?? 0;
}

// hide add button when maximum rows reached
export function updateAddBtn() {
    addRowBtn.style.display = rowCount() >= MAX_ROWS ? 'none' : '';
}
// hide remove row buttons when only one row remains
export function updateRemoveRowBtns() {
    const hide = rowCount() <= 1;
    traceTableWrap.querySelectorAll('.trace-row-remove').forEach(btn => {
        btn.style.display = hide ? 'none' : '';
    });
}

export function buildTable(vars, hasOutput) {
    traceTableWrap.innerHTML = '';

    varsTable = document.createElement('table'); varsTable.id = 'varsTable';
    const thead = varsTable.createTHead().insertRow();
    for (const name of vars) thead.appendChild(makeVarsTh(name, varsTable));
    varsTable.createTBody();
    updateColButtons(varsTable);
    traceTableWrap.appendChild(varsTable);

    if (hasOutput) {
              outputTable = document.createElement('table'); outputTable.id = 'outputTable';
        const outputTh    = document.createElement('th'   );
        const outputLabel = document.createElement('span' ); outputLabel.className = 'output-label'; outputLabel.textContent = 'OUTPUT';
        outputTh.appendChild(outputLabel);
        addColResizeHandle(outputTh);
        addRemoveOutputBtn(outputTh);
        outputTable.createTHead().insertRow().appendChild(outputTh);
        outputTable.createTBody();
        traceTableWrap.appendChild(outputTable);
    } else outputTable = null;

    addRow(); // first row
    updateAddBtn();
    updateRemoveRowBtns();
}

// clear the text of cells from `startRow` down, keeping rows and columns intact
export function clearRows(startRow = 0) {
    for (const t of [varsTable, outputTable]) {
        if (!t) continue;
        const rows = t.tBodies[0].rows;
        for (let r = startRow; r < rows.length; r++) {
            for (const cell of rows[r].cells) {
                if (cell.classList.contains('col-remove')) continue;
                const span = cell.querySelector('.cell-text');
                if (span) span.textContent = '';
                else      cell.textContent = '';
            }
            setRowHeight(rows[r], null);
        }
    }
    traceTableWrap.querySelector('.trace-notice')?.remove();
}
export function clearAllRows() { clearRows(0); }

// size every column to its content and every row to its natural height
export function fit() {
    const tables = [varsTable, outputTable].filter(Boolean);
    if (!tables.length) return;

    // capture each column's full header width before collapsing (move buttons still at natural size)
    const heads = new Map();
    for (const t of tables) for (const th of t.tHead.rows[0].cells) heads.set(th, headerFullWidth(th));

    // collapse columns to 0 (fixed layout) so each cell's true content width can be measured
    for (const t of tables) {
        t.style.tableLayout = 'fixed';
        t.style.width = '0px';
        for (const th of t.tHead.rows[0].cells) { th.style.width = '0'; th.style.minWidth = '0'; }
    }
    void tables[0].offsetWidth; // force reflow

    // column width = max(full header, widest data cell)
    for (const t of tables) {
        const n = t.tHead.rows[0].cells.length;
        for (let c = 0; c < n; c++) {
            const th = t.tHead.rows[0].cells[c];
            let maxW = heads.get(th);

            for (const row of t.tBodies[0].rows) {
                const cell = row.cells[c];
                if (!cell) continue;
                const textEl  = cell.querySelector('.cell-text');
                const inputEl = cell.querySelector('input');
                if (textEl) {
                    const cs = getComputedStyle(cell);
                    maxW = Math.max(maxW, Math.ceil(textWidth(textEl)
                        + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + borderWidth(cell)));
                } else if (inputEl) {
                    maxW = Math.max(maxW, inputEl.scrollWidth + borderWidth(cell)); // input has its own padding; cell padding is 0
                }
            }

            maxW += 1;
            if (t === outputTable) maxW += 2; // outputTable's 2px border-left isn't part of the column width
            th.style.width    = maxW + 'px';
            th.style.minWidth = maxW + 'px';
        }
        t.style.tableLayout = '';
    }

    // ---- and now check that it actually fits ----
    //
    // everything above builds a width out of parts: text, padding, borders. that only
    // lands exactly when every part is known, and here they are not — the tables collapse
    // their borders, so how much of one falls inside a cell is the browser's business; a
    // width is a border-box width, so what reaches the text is a subtraction made after
    // the fact; and both get rounded to whole device pixels at the end. each of those can
    // go a fraction against the text, which is how columns kept coming out a pixel or two
    // short with the arithmetic looking right.
    //
    // so the sum is treated as an estimate and the result is measured: whatever the text
    // still overflows by is handed back. asking the laid-out element how much room it was
    // given settles every one of those unknowns at once, without needing to model any of
    // them. only widening, so a column that already fits is left exactly where it was
    void tables[0].offsetWidth; // force reflow so the widths just set are laid out
    for (const t of tables) {
        for (let c = 0; c < t.tHead.rows[0].cells.length; c++) {
            const th = t.tHead.rows[0].cells[c];

            // both sides sub-pixel: scrollWidth and clientWidth are whole numbers, and a
            // column short by part of a pixel — the whole problem here — reads as a clean
            // fit once either side has been rounded. the label and the cell text carry no
            // padding or border of their own, so the box they are measured by is exactly
            // the room their text has to fit in
            let short = 0;
            const check = (el) => {
                if (!el) return;
                short = Math.max(short, textWidth(el) - el.getBoundingClientRect().width);
            };
            check(th.querySelector('.col-label, .output-label'));
            for (const row of t.tBodies[0].rows) check(row.cells[c]?.querySelector('.cell-text'));

            if (short > 0) {
                const w = parseFloat(th.style.width) + Math.ceil(short);
                th.style.width    = w + 'px';
                th.style.minWidth = w + 'px';
            }
        }
    }

    for (const t of tables) for (const row of t.tBodies[0].rows) setRowHeight(row, null);
    void tables[0].offsetHeight; // force reflow so cleared heights take effect before measuring

    const maxRows = Math.max(...tables.map(t => t.tBodies[0].rows.length));
    for (let r = 0; r < maxRows; r++) {
        let maxH = 0;
        for (const t of tables) {
            const row = t.tBodies[0].rows[r];
            if (row) maxH = Math.max(maxH, row.offsetHeight);
        }
        setSyncedRowHeight(r, maxH);
    }
    save();
}
