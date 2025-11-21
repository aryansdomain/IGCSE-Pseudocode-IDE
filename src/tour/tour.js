(function () {
    const STORAGE_KEY = 'igcse_ide_tour_seen';

    // ------------------------ localStorage ------------------------------
    function loadFromStorage() {
        try { return window.localStorage.getItem(STORAGE_KEY) === 'True'; } catch { return false; }
    }
    function saveToStorage() {
        try { window.localStorage.setItem(STORAGE_KEY, 'True'); } catch {}
    }

    // ------------------------ Helpers ------------------------
    function onWindowReady(fn) {
        if (document.readyState === 'complete') fn();
        else window.addEventListener('load', fn, { once: true });
    }

    // is an element visible in the screen
    function isUsable(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // wait for all elements to be visible
    async function waitForUsable(selectors, maxMs = 12000) {
        const t0 = performance.now();
        return new Promise((resolve) => {
            (function tick() {
                const ready = [];
                const missing = [];
                selectors.forEach(sel => {
                    if (!sel) return; // ignore non-targeted (floating) steps
                    const el = document.querySelector(sel);
                    (isUsable(el) ? ready : missing).push(sel);
                });
                if (ready.length && (missing.length === 0 || performance.now() - t0 > maxMs)) {
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

    // ------------------------ Steps of the tour ------------------------
    const STEPS = [
        {
            title: 'Welcome!',
            intro: 'Welcome to the IGCSE IDE! Here\'s a quick tour that\'ll show you around.',
        }, {
            element: '#code .ace_scroller',
            title: 'Editor',
            intro: 'Write your code here.'
        }, {
            element: '.files-bar',
            title: 'Files',
            intro: 'You can create multiple files of code to work on at once.'
        }, {
            element: '#consoleViewport',
            title: 'Console',
            intro: 'Input and output for the program is here.',
        }, {
            element: '#consoleViewport',
            title: 'Console',
            intro: 'Press the up arrow to bring back the last command ran, and the down arrow to go to the next command.',
        }, {
            element: '#splitter',
            title: 'Splitter',
            intro: 'Drag the handle to resize the editor and the console. Double-clicking resets to the default position.',
        }, {
            element: '#formatBtn',
            title: 'Format',
            intro: 'Auto-indent, capitalize keywords, and make your code look better.',
        }, {
            element: '#settingsBtn',
            title: 'Settings',
            intro: 'Change font size, the theme of the editor, and more. A list of more editor settings can be shown by focusing on the editor and pressing Cmd/Ctrl + ,',
        }, {
            element: '#layoutBtn',
            title: 'Layout',
            intro: 'Switch from vertical (editor top, console bottom), to horizontal (editor left, console right).',
        }, {
            element: '#examplesBtn',
            title: 'Examples',
            intro: 'Access example code snippets that showcase what the language can do.',
        }, {
            element: '#infoBtn',
            title: 'Documentation',
            intro: 'View the official IGCSE documentation and learn about the pseudocode syntax.',
        }, {
            element: '#issueReportBtn',
            title: 'Report an issue',
            intro: 'To report a bug, or if you feel there\'s something we can improve, use this button.',
        }, {
            intro: 'If you ever want to see this tour again, the button is in the settings panel.',
        }, {
            intro: 'To get started, type \'help\' in the console for a list of commands!',
        }
    ];
    const SELECTORS = STEPS.filter(s => s.element).map(s => s.element);

    // ------------------------ Init ------------------------
    onWindowReady(async () => {
        try { await whenIntroReady(); } catch { return; }

        const { ready } = await waitForUsable(SELECTORS, 12000);
        const stepsReady = STEPS.filter(s => !s.element || ready.includes(s.element));

        function startTutorial() {
            const tour = window.introJs.tour();
            tour.setOptions({
                steps: stepsReady,
                exitOnOverlayClick: false,
                scrollToElement: true,
                helperElementPadding: 0,
                tooltipClass:   'tourTooltip',
                highlightClass: 'tourHighlight',
                buttonClass:    'tourBtn'
            });
            tour.oncomplete(saveToStorage);
            tour.onexit(saveToStorage);
            tour.start();
        }

        // expose globally for restart button
        window.startTutorial = startTutorial;

        // start tutorial if user hasn't seen it
        if (!loadFromStorage() && stepsReady.length) startTutorial();
    });

    // wire tour restart button
    const restartBtn = document.getElementById('restartTourBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            const settingsOverlay = document.getElementById('settingsOverlay');
            if (settingsOverlay) settingsOverlay.style.display = 'none';
            
            // use global function
            if (window.startTutorial) window.startTutorial();
        });
    }
})();
