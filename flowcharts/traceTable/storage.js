import { card, traceTableWrap, getFileId, storageKey }                   from './traceTable.js';
import { varsTable, outputTable, setVarsTable, setOutputTable,
         buildTable, addRow, rowCount, updateAddBtn, updateRemoveRowBtns,
         setSyncedRowHeight, tableToRows, colId }                        from './table.js';
import { arrayTypes, setArrayTypes, renderArrayControls, currentArrays } from './arrays.js';
import { isFirstRowPrefilled, restoreFirstRowPrefilled,
         resetFirstRowPrefilled }                                        from './run.js';
import { clampCard }                                                     from './card.js';

export function save() {
    if (!varsTable) return;

    // var names (current order, after any swaps/removals)
    const vars = [...varsTable.tHead.rows[0].cells].map(th => colId(th));

    // col widths: actual rendered width of each header cell
    const colWidths = {
        vars:   [...varsTable.tHead.rows[0].cells].map(th => th.offsetWidth),
        output: outputTable ? outputTable.tHead.rows[0].cells[0].offsetWidth : null
    };

    const colsSized = [...varsTable.tHead.rows[0].cells].some(th => th.style.width)
        || !!(outputTable && outputTable.tHead.rows[0].cells[0].style.width);

    // row heights
    const rowHeights = [...varsTable.tBodies[0].rows].map(row => row.offsetHeight);

    const traceTable = {
        vars,
        hasOutput: !!outputTable,
        arrayTypes,
        colWidths,
        colsSized,
        rowHeights,
        firstRowPrefilled: isFirstRowPrefilled(),
        card: {
            left:   card.style.left   || null,
            top:    card.style.top    || null,
            right:  card.style.right  || null,
            width:  card.style.width  || null,
            height: card.style.height || null
        },
        varsRows:                 tableToRows(varsTable),
        outputRows: outputTable ? tableToRows(outputTable) : null
    };

    localStorage.setItem(storageKey(getFileId()), JSON.stringify(traceTable));
}

export function load(fileId) {
    if (!fileId) return;
    const raw = localStorage.getItem(storageKey(fileId));
    if (!raw) return;
    const state = JSON.parse(raw);

    if (state.arrayTypes) setArrayTypes({ ...state.arrayTypes });

    if (!varsTable && (state.vars?.length || state.hasOutput)) {
        buildTable(state.vars, state.hasOutput);
        renderArrayControls(currentArrays());
    }

    if (!varsTable) return;

    // add extra rows
    const savedRows = Math.max(
        state.varsRows?.length ?? 0,
        state.outputRows?.length ?? 0
    );
    for (let i = rowCount(); i < savedRows; i++) {
        addRow();
        updateAddBtn();
        updateRemoveRowBtns();
    }

    // restore cell text
    const restoreRows = (table, rows) => {
        if (!table || !rows) return;
        rows.forEach((cells, r) => {
            const row = table.tBodies[0].rows[r];
            if (!row) return;
            cells.forEach((val, c) => {
                const cell = row.cells[c];
                if (!cell) return;
                const textEl = cell.querySelector('.cell-text');
                if (textEl) textEl.textContent = val;
                else          cell.textContent = val;
            });
        });
    };
    restoreRows(varsTable,   state.varsRows  );
    restoreRows(outputTable, state.outputRows);
    restoreFirstRowPrefilled(state.firstRowPrefilled);

    // restore col widths
    if (state.colWidths && (state.colsSized ?? true)) {
        const applyWidth = (th, w) => { if (w) { th.style.minWidth = w + 'px'; th.style.width = w + 'px'; } };
        state.colWidths.vars?.forEach((w, i) => {
            const th = varsTable.tHead.rows[0].cells[i];
            if (th) applyWidth(th, w);
        });
        if (state.colWidths.output != null && outputTable)
            applyWidth(outputTable.tHead.rows[0].cells[0], state.colWidths.output);

        varsTable.style.width = '0px';
        if (outputTable) outputTable.style.width = '0px';
    }

    // restore row heights
    state.rowHeights?.forEach((h, i) => {
        setSyncedRowHeight(i, h);
    });

    // restore card position and size
    if (state.card) {
        const c = state.card;
        if (c.left  ) card.style.left   = c.left;
        if (c.top   ) card.style.top    = c.top;
        if (c.right ) card.style.right  = c.right;
        if (c.width ) card.style.width  = c.width;
        if (c.height) card.style.height = c.height;

        // next frame, so the canvas area has been laid out to clamp against
        requestAnimationFrame(clampCard);
    }
}

// reset everything and reload for the active file (used on file switch)
export function clear() {
    traceTableWrap.innerHTML = '';
    card.querySelector('.array-controls')?.remove();
    setVarsTable(null);
    setOutputTable(null);
    setArrayTypes({});
    card.style.left   = '';
    card.style.top    = '';
    card.style.right  = '';
    card.style.width  = '';
    card.style.height = '';

    resetFirstRowPrefilled();
    load(getFileId());
}
