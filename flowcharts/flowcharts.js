import { setAppReady } from '../shared/loading.js';

// import modules
const { initTraceTable            } = await import('./traceTable/traceTable.js');
const { initModeCtrl, isLightMode } = await import('../shared/modeCtrl.js'     );
const { initSettings              } = await import('./settings.js'             );
const { initCanvas                } = await import('./canvas/canvas.js'        );
const { initMode, CANVAS_BG       } = await import('./canvas/mode.js'          );
const { initFiles                 } = await import('./canvas/files.js'         );
const { getCode                   } = await import('./runtime/graph.js'        );
const { initUI                    } = await import('./ui/ui.js'                );
const { initArrange               } = await import('./canvas/arrange.js'       );
const { initRunCtrl               } = await import('./runtime/runCtrl.js'      );

const UI = initUI();

// ------------------------ Canvas ------------------------

let saveFiles, clearTraceTable, getActiveId, getActiveName;
let isRunning = () => false; // set once the runner exists

const { lf, resize, reconnectEdges, highlightNode, clearHighlight, getGraphData } = initCanvas(UI.canvas, () => saveFiles?.());

// files
({ save: saveFiles, getActiveId, getActiveName } = initFiles({
    filesEl: UI.filesEl,
    lf,
    onRender: () => { resize(); reconnectEdges(); clearTraceTable?.(); },
    locked: () => isRunning()
}));

// ------------------------ Issue Report ------------------------

// report the active xhart
window.__reportChart = () => {
    try { return JSON.stringify(getGraphData(), null, 2); } catch { return ''; }
};

// ------------------------ Arrange ------------------------

initArrange({ arrangeBtn: UI.arrangeBtn, lf, resize, save: saveFiles });

// ------------------------ Mode ------------------------

const applyMode = initMode(lf);
initModeCtrl({
    modeBtn: UI.modeBtn,
    page: 'flowcharts',
    defaultMode: 'light',
    onChange: applyMode
});

// ------------------------ Settings ------------------------

initSettings({
    openBtn:      UI.settingsBtn,
    closeBtn:     UI.closeSettings,
    overlayEl:    UI.settingsOverlay,
    sizeSlider:   UI.fontSizeSlider,
    sizeValueEl:  UI.fontSizeValue,
    familySelect: UI.fontFamilySelect,
    onChange: resize
});

// ------------------------ Trace Table ------------------------

const traceTable = initTraceTable({
    card:               UI.traceTableCard,
    cardTop:            UI.traceTableCardTop,
    makeTraceTableBtn:  UI.makeTraceTableBtn,
    addRowBtn:          UI.addRowBtn,
    fitBtn:             UI.fitBtn,
    clearTraceTableBtn: UI.clearTraceTableBtn,
    traceTableWrap:     UI.traceTableWrap,
    getCode: () => getCode(getGraphData()),
    getFileId: getActiveId,
    highlightNode,
    clearHighlight
});
clearTraceTable = traceTable.clear;

// ------------------------ Run ------------------------

const runner = initRunCtrl({
    traceRun: traceTable,
    highlightNode,
    clearHighlight,
    showError: traceTable.showError,
    onStateChange: (running) => {
        // change run button
        UI.runBtn.innerHTML = running
            ? '<i class="fas fa-stop"></i> Stop'
            : '<i class="fas fa-play"></i> Run';
        UI.runBtn.classList.toggle('run', !running);
        UI.runBtn.classList.toggle('stop', running);

        // disable buttons
        UI.makeTraceTableBtn.disabled  = running;
        UI.clearTraceTableBtn.disabled = running;
        UI.fitBtn.disabled             = running;

        // lock the file tabs: the run writes into this file's trace table
        UI.filesEl.classList.toggle('locked', running);
    }
});
isRunning = runner.isRunning;

// ------------------------ Event Listeners ------------------------

UI.runBtn.addEventListener('click', () => {
    if (runner.isRunning()) { runner.stop(); return; }

    clearHighlight();

    // if flowchart fails on validation
    const flowchart_error = (e) => {
        try {
            window.flowchart_error && window.flowchart_error({
                flowchart_error_stage:  'validation',
                flowchart_error_type:   e.type || 'Error',
                flowchart_error_reason: e.reason || ''
            });
        } catch {}

        if (e.nodeId) highlightNode(e.nodeId, e.message);
        else traceTable.showError(e.message);
    };

    // make trace table
    try {
        traceTable.makeTable();
    } catch (e) {
        flowchart_error(e);
        return;
    }

    // inspect the chart for trace-table column/array detection
    let result;
    try {
        result = getCode(getGraphData());
    } catch (e) {
        flowchart_error(e);
        return;
    }
    if (!traceTable.beginRun(result)) return; // no variables to trace

    // execute the graph directly
    runner.run(getGraphData(), traceTable.getArraySpecs());
});

// ctrl+C stop
document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.key !== 'c') return;
    if (!runner.isRunning()) return;
    e.preventDefault();
    runner.stop();
});

// download flowchart as PNG
UI.downloadBtn.addEventListener('click', async () => {
    await lf.getSnapshot(getActiveName(), { backgroundColor: isLightMode() ? CANVAS_BG.light : CANVAS_BG.dark });

    try {
        window.flowchart_downloaded && window.flowchart_downloaded({
            flowchart_downloaded_size: getGraphData().nodes.length
        });
    } catch {}
});

// show/hide trace table
const TRACE_VISIBLE_KEY = 'igcse_ide_flowchart_trace_visible';
function applyTraceVisibility(visible) {
    UI.traceTableCard.classList.toggle('hidden', !visible);
    UI.toggleTraceTableBtn.classList.toggle('table-visible', visible);
    UI.toggleTraceTableBtn.title = visible ? 'Hide trace table' : 'Show trace table';
}
let traceVisible = localStorage.getItem(TRACE_VISIBLE_KEY) !== 'false';
applyTraceVisibility(traceVisible);
UI.toggleTraceTableBtn.addEventListener('click', () => {
    traceVisible = !traceVisible;
    localStorage.setItem(TRACE_VISIBLE_KEY, String(traceVisible));
    applyTraceVisibility(traceVisible);
});

// undo/redo
document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!(e.metaKey || e.ctrlKey))             return;

    const key = (e.key || '').toLowerCase();
    if (key !== 'z' && key !== 'y') return;

    if (key === 'z' && e.shiftKey) { e.preventDefault(); lf.redo(); resize(); }
    else requestAnimationFrame(resize);
});

// resize canvas on window resize
window.addEventListener('resize', () => {
    lf.resize(UI.canvas.clientWidth || window.innerWidth, UI.canvas.clientHeight || window.innerHeight);
});

// ------------------------ Shape Panel ------------------------

// drag from shapePanel to canvas
UI.shapePanel.querySelectorAll('.shape-item').forEach(item => {
    item.addEventListener('mousedown', () => {
        lf.dnd.startDrag({ type: item.dataset.type, text: item.dataset.text });
    });
});

setAppReady();
