// Orchestrator + owner of the injected DOM refs/constants (set once by initTraceTable;
// the sibling modules import these live bindings). Wires the buttons and exposes the API.
import { varsTable, outputTable, colId, addRow, clearRows, clearAllRows, syncNaturalRowHeight, updateAddBtn, updateRemoveRowBtns, fit } from './table.js';
import { getArraySpecs }                                                  from './arrays.js';
import { save, load, clear }                                              from './storage.js';
import { makeTable, showError, beginRun, setVar, addRunRow, setOutput, focusInput, finishRun,
         isFirstRowPrefilled, resetFirstRowPrefilled, noteCellEdited, NOTHING_TO_TRACE } from './run.js';
import { initCard }                                                       from './card.js';

export let card, cardTop, makeTraceTableBtn, addRowBtn, fitBtn, clearTraceTableBtn,
           traceTableWrap, getCode, getFileId, highlightNode, clearHighlight;

export const MAX_ROWS = 30;
export const storageKey = (fileId) => `igcse_trace_${fileId}`;

export function initTraceTable(opts) {
    ({ card, cardTop, makeTraceTableBtn, addRowBtn, fitBtn, clearTraceTableBtn,
       traceTableWrap, getCode, getFileId, highlightNode, clearHighlight } = opts);

    initCard();

    // ------------------------ Buttons ------------------------

    makeTraceTableBtn.addEventListener('click', () => {
        clearHighlight();
        try {
            // build/refresh the table, then clear cell content (keeping the row count) —
            // row 0 is spared exactly when the user is the one who filled it, the same
            // rule and the same flag Run uses, so the two buttons agree
            if (makeTable()) {
                clearRows(isFirstRowPrefilled() ? 1 : 0);
                for (let i = 0; i < varsTable.tBodies[0].rows.length; i++) syncNaturalRowHeight(i);
                save();

                try {
                    const cols = [...varsTable.tHead.rows[0].cells].map(th => colId(th));
                    window.trace_table_made && window.trace_table_made({
                        trace_table_made_columns:    cols.length,
                        trace_table_made_arrays:     new Set(cols.map(c => c.match(/^(\w+)\s*\[/)?.[1]?.toLowerCase()).filter(Boolean)).size,
                        trace_table_made_has_output: !!outputTable
                    });
                } catch {}
            } else showError(NOTHING_TO_TRACE); // valid chart, but nothing to put in a table
        } catch (e) {
            // highlight erroring node if there is one, otherwise show error in card
            if (e.nodeId)                     highlightNode(e.nodeId, e.message);
            else traceTableWrap.innerHTML = `<p class="trace-error">${e.message}</p>`;
        }
    });

    // save on any cell edit — and let an edit to row 0 claim it for the user, so a run
    // will preserve it rather than start writing over it
    let saveTimer = null;
    traceTableWrap.addEventListener('input', (e) => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => save(), 300);
        noteCellEdited(e.target);
    });

    fitBtn.addEventListener('click', () => fit());

    clearTraceTableBtn.addEventListener('click', () => {
        if (!varsTable) return;
        clearAllRows();
        resetFirstRowPrefilled(); // row 0 is empty again, so it belongs to nobody

        for (let i = 0; i < varsTable.tBodies[0].rows.length; i++) syncNaturalRowHeight(i);
        save();
    });

    addRowBtn.addEventListener('click', () => {
        addRow();
        updateAddBtn();
        updateRemoveRowBtns();
        save();

        addRowBtn.focus();

        // expand card if the new row pushed content outside bounds
        requestAnimationFrame(() => {
            const overflowH = traceTableWrap.scrollHeight - traceTableWrap.clientHeight;
            const overflowW = traceTableWrap.scrollWidth  - traceTableWrap.clientWidth;

            if (overflowH > 0) card.style.height = (card.offsetHeight + overflowH) + 'px';
            if (overflowW > 0) card.style.width  = (card.offsetWidth  + overflowW) + 'px';
        });
    });

    // auto restore on init
    load(getFileId());

    return { clear, showError, makeTable, getArraySpecs, beginRun, setVar, addRunRow, setOutput, focusInput, finishRun };
}
