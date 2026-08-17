import { traceTableWrap, addRowBtn, MAX_ROWS, getCode, getFileId } from './traceTable.js';
import { varsTable, outputTable, buildTable, clearRows, addRow,
         rowCount, syncNaturalRowHeight, updateRemoveRowBtns, colId } from './table.js';
import { getVars, renderArrayControls, getArraySpecs, checkArrayValues, checkArraySizes, arrayTypes } from './arrays.js';
import { save, load }                                              from './storage.js';

let runRowIndex     = 0;
let writtenThisRow  = new Set();
let outputThisRow   = false; // whether this row's OUTPUT cell already holds output from this run
let pendingInputVar = null;
let seedSkip        = 0;     // number of prelude array-seed `variable` messages still to ignore
let onInitialRow    = false; // true while runtime is still parked on row 0 (a row that was prefilled)
let recording       = true;  // false once the table is full: the flowchart keeps running untraced

// whether row 0 holds values the *user* put there, as opposed to values a run wrote into
// it. this cannot be answered by looking at the row: a run that began on row 0 leaves it
// looking exactly like a prefilled one, which is why reading the row at the start of each
// run got it wrong — the second run saw the first run's output sitting in row 0 and read
// it as something worth preserving. so ownership is recorded as it happens instead. the
// user typing in row 0 claims it; a run that starts with the row unclaimed writes into it
// and leaves it unclaimed, so the run after that clears it
let firstRowPrefilled = false;

// build (or rebuild, preserving existing columns/data) the trace table from the chart.
// returns false if the chart has no traceable variables. throws validation errors to the caller.
export function makeTable() {
    const result = getCode(); // may throw a validation error

    const lines = result.code.split('\n').map(line => line.trim());

    // get columns + array metadata
    let { columns, arrays } = getVars(result.code);

    const hasOutput = lines.some(line => /^OUTPUT\b/i.test(line));
    if (!columns.length && !hasOutput) return false; // nothing to trace at all

    // preserve column order
    if (varsTable) {
        const existing = [...varsTable.tHead.rows[0].cells]
            .map(th => colId(th).trim())
            .filter(Boolean);
        const colsLower = new Set(columns.map(v => v.toLowerCase()));
        const inOrder = existing.filter(c => colsLower.has(c.toLowerCase()));
        const added = columns.filter(v => !existing.some(c => c.toLowerCase() === v.toLowerCase()));
        columns = [...inOrder, ...added];
    }

    // default the type of any newly seen array to INTEGER
    for (const { name } of arrays) {
        const k = name.toLowerCase();
        if (!arrayTypes[k]) arrayTypes[k] = 'INTEGER';
    }

    buildTable(columns, hasOutput);
    load(getFileId());            // restore saved columns, array types, row count, and cell content
    renderArrayControls(arrays);  // then render controls so type selectors show saved values
    return true;
}

// shown when a chart is valid but has nothing a trace table could hold
export const NOTHING_TO_TRACE = 'This flowchart has no variables or OUTPUT to trace.';

// show a message in place of the table (e.g. translation problem, unsupported chart)
export function showError(msg) {
    traceTableWrap.innerHTML = `<p class="trace-error">${msg}</p>`;
}

// ------------------------ Runtime helpers ------------------------

// display a value the way a trace table shows it
function displayValue(value) {
    if (value === true ) return 'TRUE';
    if (value === false) return 'FALSE';
    if (value ==  null ) return '';
    return String(value);
}

// column index of a variable in varsTable (case-insensitive), or -1
function varColIndex(name) {
    const cells = varsTable?.tHead.rows[0].cells ?? [];
    const lower = String(name).toLowerCase();
    for (let i = 0; i < cells.length; i++) {
        if (colId(cells[i]).toLowerCase() === lower) return i;
    }
    return -1;
}

// column index of array element name[index], or -1
function arrayColIndex(name, index) {
    return varColIndex(`${name}[${index}]`);
}

// number of prelude seed assignments a run will emit. STRING arrays seed every
// cell (a blank cell is the empty string ""); other types seed only non-empty
// cells (a blank cell is left uninitialized). Must match the prelude in graph.js.
function countSeedCells() {
    let n = 0;
    for (const spec of getArraySpecs()) {
        const isString = String(spec.type).toUpperCase() === 'STRING';
        for (const v of spec.vals) {
            if (v == null) continue;
            if (isString || String(v).trim() !== '') n++;
        }
    }
    return n;
}

// whether the reserved initial row (row 0) actually shows any value to preserve
function initialRowHasContent() {
    const row0 = varsTable?.tBodies[0].rows[0];
    if (!row0) return false;
    for (const cell of row0.cells) {
        const txt = (cell.querySelector('.cell-text')?.textContent ?? cell.textContent ?? '').trim();
        if (txt !== '') return true;
    }
    return false;
}

// the one answer Run and Make Trace Table both consult, so the two agree
export const isFirstRowPrefilled = () => firstRowPrefilled;

// row 0 is empty again — the table was rebuilt, or every row was cleared by hand — so
// nobody has claimed it
export function resetFirstRowPrefilled() { firstRowPrefilled = false; }

// tables saved before this flag existed cannot say who filled row 0. read as the user's,
// so that nobody's typed-in array seeds are wiped by the first run after this change; a
// row of leftover run output costs one press of Clear to be rid of, which is the cheaper
// mistake of the two
export function restoreFirstRowPrefilled(saved) {
    firstRowPrefilled = saved ?? initialRowHasContent();
}

// called for every edit made through the table's own UI. only edits to row 0 decide this,
// and only edits the user made: a run types into an input element of its own, and counting
// that would let a run claim the very row it had just been given permission to write over
export function noteCellEdited(target) {
    if (!varsTable) return;
    if (target?.classList?.contains?.('trace-run-input')) return;

    const row = target?.closest?.('tr');
    if (!row || row.parentElement?.tagName !== 'TBODY' || row.sectionRowIndex !== 0) return;

    // re-read rather than assume true: this also catches the user emptying row 0, which
    // hands it back and lets the next run start there again
    firstRowPrefilled = initialRowHasContent();
}

// a column's current value: the most recent non-empty cell at or above the current row
function lastColValue(col) {
    for (let r = runRowIndex; r >= 0; r--) {
        const cell = varsTable.tBodies[0].rows[r]?.cells[col];
        const txt = (cell?.querySelector('.cell-text')?.textContent ?? cell?.textContent ?? '').trim();
        if (txt !== '') return txt;
    }
    return '';
}

function writeVarsCell(col, text) {
    const cell = varsTable.tBodies[0].rows[runRowIndex]?.cells[col];
    if (!cell) return;
    const span = cell.querySelector('.cell-text');
    if (span) span.textContent = text;
    else      cell.textContent = text;
    syncNaturalRowHeight(runRowIndex);
}

// toggle editing controls while a run is in progress
function lockEditing(on) {
    traceTableWrap.classList.toggle('trace-running', on);
    addRowBtn.style.display = (on || rowCount() >= MAX_ROWS) ? 'none' : '';
}

// non-destructive notice shown beside the table (e.g. row limit reached). unlike
// showError this keeps the table, so a notice about a cell can be acted on
function showRunNotice(msg, isError = false) {
    let el = traceTableWrap.querySelector('.trace-notice');
    if (!el) {
        el = document.createElement('p');
        traceTableWrap.appendChild(el);
    }
    el.className   = isError ? 'trace-notice error' : 'trace-notice';
    el.textContent = msg;
}

// move off the reserved initial row (row 0) onto the first runtime row, once
function ensureRuntimeRow() {
    if (!onInitialRow) return true;
    return addRunRow(); // advances 0 -> 1 (clears onInitialRow)
}

// advance to the next row, reusing an existing (already-cleared) row before appending a new one.
// filling the table stops the trace, never the flowchart: past the row limit the run carries on
// untraced so it still reaches its OUTPUT, which keeps long loops and long charts usable
export function addRunRow() {
    onInitialRow = false; // any row advance leaves the initial row behind
    if (!recording) return true;

    const next = runRowIndex + 1;
    if (next < rowCount()) {
        runRowIndex    = next;
        writtenThisRow = new Set();
        outputThisRow  = false;
        return true;
    }
    if (rowCount() >= MAX_ROWS) {
        recording = false;
        showRunNotice(`Trace table full at ${MAX_ROWS} rows — the flowchart is still running, and its output is added to the last row.`);
        return true;
    }
    addRow();
    runRowIndex    = rowCount() - 1;
    writtenThisRow = new Set();
    outputThisRow  = false;
    return true;
}

// prepare a locked table for a run; reuse the current rows (keeping their count) when the
// columns already match, otherwise build a fresh table. false if there are no variables.
export function beginRun(result) {
    const lines = result.code.split('\n').map(line => line.trim());
    const { columns, arrays } = getVars(result.code);
    const hasOutput = lines.some(line => /^OUTPUT\b/i.test(line));
    if (!columns.length && !hasOutput) { showError(NOTHING_TO_TRACE); return false; }
    const hasArrays = arrays.length > 0;

    // reuse the existing table when it already has every needed column
    const canReuse = varsTable && columns.every(v => varColIndex(v) !== -1) && (!hasOutput || outputTable);
    // consulted, never re-derived from the table: by now the table may hold the previous
    // run's output, and that is exactly what must not be mistaken for a prefilled row
    if (canReuse) clearRows(firstRowPrefilled ? 1 : 0);
    else        { buildTable(columns, hasOutput); renderArrayControls(arrays); resetFirstRowPrefilled(); }


    // reject unusable arrays before the run rather than letting them fail as pseudocode.
    // the table stays up so the sizes/cells can be corrected
    if (hasArrays) {
        // refusals here are validation failures too, reported by slug like the rest
        const refuse = (reason) => {
            try {
                window.flowchart_error && window.flowchart_error({
                    flowchart_error_stage:  'validation',
                    flowchart_error_type:   'ArrayError',
                    flowchart_error_reason: reason
                });
            } catch {}
            return false;
        };

        const unsized = checkArraySizes(arrays);
        if (unsized) { showRunNotice(unsized, true); return refuse('array_not_sized'); }

        const bad = checkArrayValues();
        if (bad) { showRunNotice(bad, true); return refuse('array_bad_value'); }
    }

    runRowIndex  = 0;
    recording    = true;
    // the same answer the clear above acted on: row 0 was kept, so the run steps past it
    // to row 1 on its first write. left unclaimed, the run starts on row 0 itself and the
    // flag stays false, which is what makes the *next* run clear it
    onInitialRow = firstRowPrefilled;
    seedSkip     = hasArrays ? countSeedCells() : 0; // ignore the prelude's seed assignments
    writtenThisRow  = new Set();
    outputThisRow   = false;
    pendingInputVar = null;
    lockEditing(true);
    return true;
}

// record a variable's current value into the current row (overwrite -> new row).
// `index` is set for array element writes (CodeStore[index] <- value).
export function setVar(name, value, index) {
    if (!recording) return true; // table is full; the run continues without being traced
    const text = displayValue(value);

    // array element write
    if (index != null) {
        if (seedSkip > 0) { seedSkip--; return true; } // prelude seed assignment; row 0 already shows it
        const col = arrayColIndex(name, index);
        if (col === -1) return true; // element not tracked (column removed)
        if (!ensureRuntimeRow()) return false; // leave the initial row before writing runtime data
        if (text === lastColValue(col)) return true; // value unchanged: leave the cell blank
        const key = `${name}[${index}]`.toLowerCase();
        if (writtenThisRow.has(key)) { if (!addRunRow()) return false; } // overwriting starts a new row
        writeVarsCell(col, text);
        writtenThisRow.add(key);
        return true;
    }

    const col = varColIndex(name);
    if (col === -1) return true; // not a tracked column
    if (!ensureRuntimeRow()) return false; // leave the initial row before writing runtime data
    const lower = String(name).toLowerCase();

    if (pendingInputVar && pendingInputVar.toLowerCase() === lower) {
        pendingInputVar = null;         // value just supplied via input: finalize, no new row
    } else if (text === lastColValue(col)) {
        return true;                    // value unchanged: leave the cell blank, no new row
    } else if (writtenThisRow.has(lower)) {
        if (!addRunRow()) return false; // overwriting a written cell starts a new row
    }

    writeVarsCell(col, text);
    writtenThisRow.add(lower);
    return true;
}

// write OUTPUT text into the current row's OUTPUT cell. rows only advance when a
// variable changes, so several OUTPUTs can land on one row: stack them on their own
// lines rather than letting the last one overwrite the rest
export function setOutput(text) {
    if (!outputTable) return;

    const cell = outputTable.tBodies[0].rows[runRowIndex]?.cells[0];
    if (!cell) return;
    const el = cell.querySelector('.cell-text') ?? cell;
    el.textContent = outputThisRow ? `${el.textContent}\n${text}` : text;
    outputThisRow  = true;
    syncNaturalRowHeight(runRowIndex);
}

// focus the current row's cell for `name` (or array element name[index]), resolve
// with the typed value on Enter
export function focusInput(name, index) {
    return new Promise(resolve => {
        const col = (index != null) ? arrayColIndex(name, index) : varColIndex(name);
        if (col === -1) { resolve(''); return; }
        ensureRuntimeRow();                          // leave the initial array-values row before prompting for input
        // re-reading the same cell within one row (an input loop with no counter)
        // starts a new row, since the typed value won't trigger overwrite-detection
        const key = (index != null) ? `${name}[${index}]`.toLowerCase() : String(name).toLowerCase();
        if (writtenThisRow.has(key)) { if (!addRunRow()) { resolve(''); return; } }
        const cell = varsTable.tBodies[0].rows[runRowIndex]?.cells[col];
        if (!cell) { resolve(''); return; }

        const span = cell.querySelector('.cell-text');
        if (span) span.style.display = 'none';

        const input = document.createElement('input');
        input.type      = 'text';
        input.className = 'trace-run-input';
        cell.appendChild(input);
        input.focus();
        syncNaturalRowHeight(runRowIndex);

        const submit = () => {
            const val = input.value;
            input.remove();
            if (span) { span.style.display = ''; span.textContent = val; }
            if (index != null) {
                writtenThisRow.add(`${name}[${index}]`.toLowerCase());
            } else {
                writtenThisRow.add(String(name).toLowerCase());
                pendingInputVar = name; // so the follow-up `variable` message doesn't open a new row
            }
            syncNaturalRowHeight(runRowIndex);
            resolve(val);
        };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
    });
}

// remove a stray input left behind by focusInput (e.g. run stopped before Enter)
function cleanupPendingInput() {
    const input = varsTable?.querySelector('.trace-run-input');
    if (!input) return;
    const cell = input.closest('td');
    const span = cell?.querySelector('.cell-text');
    if (span) span.style.display = '';
    input.remove();
    syncNaturalRowHeight(cell.closest('tr').sectionRowIndex);
}

// end of run: unlock editing, persist (row count is left as-is)
export function finishRun() {
    cleanupPendingInput();
    lockEditing(false);
    updateRemoveRowBtns();
    save();
}
