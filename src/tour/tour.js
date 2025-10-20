(function () {
    // ------------------------ Persistence ------------------------------
    function tourSeen() {
        try { return window.localStorage.getItem('tour_seen') === '1'; } catch { return false; }
    }
    function setTourSeen() {
        try { window.localStorage.setItem('tour_seen', '1'); } catch {}
    }
    function resetTourSeen() {
        try { window.localStorage.removeItem('tour_seen'); } catch {}
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
            element: '#console-viewport',
            title: 'Console',
            intro: 'Input and output for the program is here.',
        }, {
            element: '#console-viewport',
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
            intro: 'Change font size, the theme of the editor, and more. A list of editor settings can be shown by focusing on the editor and pressing Cmd/Ctrl + ,',
        }, {
            element: '#layoutBtn',
            title: 'Layout',
            intro: 'Switch from vertical (editor top, console bottom), to horizontal (editor right, console left).',
        }, {
            element: '#issue-report-btn',
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
            tour.oncomplete(setTourSeen); tour.onexit(setTourSeen);
            tour.start();
        }

        // expose globally for restart button
        window.startTutorial = startTutorial;

        // start tutorial if user hasn't seen it
        if (!tourSeen() && stepsReady.length) startTutorial();
    });

    // wire tour restart button
    const restartBtn = document.getElementById('restartTourBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            resetTourSeen();
            const settingsOverlay = document.getElementById('settingsOverlay');
            if (settingsOverlay) settingsOverlay.style.display = 'none';
            
            // use global function
            if (window.startTutorial) window.startTutorial();
        });
    }
})();
