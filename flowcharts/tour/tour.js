const STORAGE_KEY = 'igcse_ide_flowcharts_tour_seen';

// ------------------------ localStorage ------------------------

function load() {
    try { return window.localStorage.getItem(STORAGE_KEY) === 'True'; } catch { return false; }
}
function save() {
    try { window.localStorage.setItem(STORAGE_KEY, 'True'); } catch {}
}

// ------------------------ Utilities ------------------------

function onWindowReady(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
}

// is an element visible in the screen
function isUsable(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;

    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.visibility !== 'collapse' && cs.opacity !== '0';
}

function stepState(sel) {
    const el = document.querySelector(sel);
    if (!el) return 'absent';
    return isUsable(el) ? 'ready' : 'hidden';
}

// wait for all elements to be visible
async function waitForUsable(selectors, maxMs = 12000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
        (function tick() {
            const ready = [];
            const missing = [];
            let pending = 0; // still absent, so still worth another frame
            selectors.forEach(sel => {
                if (!sel) return; // ignore non-targeted (floating) steps
                const state = stepState(sel);
                if (state === 'ready') ready.push(sel);
                else { missing.push(sel); if (state === 'absent') pending++; }
            });
            if (ready.length && (pending === 0 || performance.now() - t0 > maxMs)) {
                return resolve({ ready, missing });
            }
            if (performance.now() - t0 > maxMs) return resolve({ ready, missing });
            requestAnimationFrame(tick);
        })();
    });
}

// wait for intro.js to be ready
function whenIntroReady(maxMs = 8000) {
    const initTime = performance.now();
    return new Promise((resolve, reject) => {
        (function tick() {
            if (typeof window.introJs === 'function') return resolve(window.introJs);
            if (performance.now() - initTime > maxMs) return reject(new Error('Intro.js not available'));
            setTimeout(tick, 25);
        })();
    });
}

// ------------------------ Steps ------------------------

const STEPS = [
    {
        title: 'Flowchart Editor',
        intro: 'Welcome to the flowchart editor! This is where you can create and run flowcharts.'
    }, {
        element: '#shapePanel',
        title: 'Shapes',
        intro: 'Drag a shape from here onto the canvas to add it to your flowchart.'
    }, {
        element: '#canvas',
        title: 'Canvas',
        intro: 'Connect shapes by dragging from the edge of one to another.'
    }, {
        element: '#flowchartFilesBar',
        title: 'Files',
        intro: 'You can create up to 7 different flowcharts, each saved separately.'
    }, {
        element: '#flowchartFilesBar',
        title: 'Files',
        intro: 'Renaming and undo/redo work here the same way as they do for code files.'
    }, {
        element: '#arrangeBtn',
        title: 'Arrange',
        intro: 'Automatically tidy up your flowchart\'s layout.'
    }, {
        element: '#downloadBtn',
        title: 'Download image',
        intro: 'Save your flowchart as a PNG image.'
    }, {
        element: '#toggleTraceTableBtn',
        title: 'Show/hide trace table',
        intro: 'Show or hide the trace table.'
    }, {
        element: '#makeTraceTableBtn',
        title: 'Trace table',
        intro: 'Build a trace table for the variables in your flowchart.'
    }, {
        element: '#runBtn',
        title: 'Run',
        intro: 'Run the flowchart, filling in the trace table one step at a time.'
    }, {
        element: '#settingsBtn',
        title: 'Settings',
        intro: 'Change the font size and family used on the canvas.'
    }, {
        element: '#issueReportBtn',
        title: 'Report an issue',
        intro: 'To report a bug, or if you feel there\'s something we can improve, use this button.'
    }, {
        intro: 'You can replay this tour anytime from the settings panel.'
    }, {
        intro: 'To get started, drag a Terminator onto the canvas and type START.'
    }
];
const SELECTORS = STEPS.filter(s => s.element).map(s => s.element);

// ------------------------ Init ------------------------

let startTutorial = null;

onWindowReady(async () => {
    try { await whenIntroReady(); } catch { return; }

    const { ready } = await waitForUsable(SELECTORS, 12000);
    const stepsReady = STEPS.filter(s => !s.element || ready.includes(s.element));

    startTutorial = function () {
        const steps = STEPS.filter(s => !s.element || stepState(s.element) === 'ready');
        if (!steps.length) return;

        const tour = window.introJs.tour();
        tour.setOptions({
            steps,
            exitOnOverlayClick: false,
            scrollToElement: true,
            helperElementPadding: 0,
            tooltipClass:   'tourTooltip',
            highlightClass: 'tourHighlight',
            buttonClass:    'tourBtn'
        });
        tour.oncomplete(save);
        tour.onexit(save);
        tour.start();
    };

    if (!load() && stepsReady.length) startTutorial();
});

// wire tour restart button
const restartBtn = document.getElementById('restartTourBtn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        const settingsOverlay = document.getElementById('settingsOverlay');
        if (settingsOverlay) settingsOverlay.style.display = 'none';
        if (startTutorial) startTutorial();
    });
}