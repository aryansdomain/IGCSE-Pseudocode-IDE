(function () {

    // ------------------------ Ace Editor ------------------------
    const editor = ace.edit('code', {
        mode: 'ace/mode/lang',
        theme: 'ace/theme/monokai', // default
        showPrintMargin: false,
        fontSize: '14px',           // default
        fontFamily: 'monospace',    // default
    });
    window.editor = editor;

    editor.setOptions({
        useSoftTabs: true,
        tabSize: 4,                 // default
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
        highlightActiveLine: false,
        fixedWidthGutter: true
    });

    const Range = ace.require('ace/range').Range;

    // initial code
    editor.setValue(
`// Type your code here!

FUNCTION greet(name : STRING) RETURNS STRING
    RETURN "Hello, ", name, "!"
ENDFUNCTION

OUTPUT greet("World")`
        , -1); // -1 keeps cursor at start of editor

    editor.focus();

    // ------------------------ Cursor Position ------------------------
    const cursorInfo = document.getElementById('line-col-info');

    function updateCursorPos() {
        const pos = editor.getCursorPosition();
        const selText = editor.getSelectedText() || '';
        cursorInfo.textContent =
        `Ln ${pos.row + 1}, Col ${pos.column + 1}` +
        (selText ? ` (${selText.length} selected)` : '');
    }

    editor.session.selection.on('changeCursor', updateCursorPos);
    editor.session.selection.on('changeSelection', updateCursorPos);
    editor.session.on('change', updateCursorPos);
    updateCursorPos();

    // ------------------------ Settings ------------------------
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const closeSettings = document.getElementById('closeSettings');
    const changeEditortheme = document.getElementById('changeEditortheme');

    // show/close settings overlay
    settingsBtn.addEventListener('click', () => {
        settingsOverlay.style.display = 'flex';
    });
    closeSettings.addEventListener('click', () => {
        settingsOverlay.style.display = 'none';
    });
    settingsOverlay.addEventListener('click', (e) => { // close when clicking outside
        if (e.target === settingsOverlay) {
            settingsOverlay.style.display = 'none';
        }
    });

    // ------------------------ Light/Dark Mode Toggle ------------------------
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const moonIcon = modeToggleBtn.querySelector('.moon-icon');
    const sunIcon = modeToggleBtn.querySelector('.sun-icon');

    function toggleMode() {
        const isLight = document.documentElement.classList.contains('light');
        
        if (isLight) {
            document.documentElement.classList.remove('light');
            editor.setTheme('ace/theme/monokai');
            moonIcon.hidden = true;
            sunIcon.hidden = false;
        } else {
            document.documentElement.classList.add('light');
            editor.setTheme('ace/theme/iplastic');
            moonIcon.hidden = false;
            sunIcon.hidden = true;
        }
    }

    modeToggleBtn.addEventListener('click', toggleMode);

    // ------------------------ Tab Spacing ------------------------
    const tabSpacesSlider = document.getElementById('tabSpacesSlider');
    const tabSpacesValue  = document.getElementById('tabSpacesValue');
    const tabSpacesInfo   = document.querySelector('.tab-spaces-info');

    // make ticks clickable
    const tabSpacesTicks = document.querySelectorAll('#tabSpacesSlider + .slider-ticks .tick');
    tabSpacesTicks.forEach((tick, index) => {
        tick.addEventListener('click', () => {
            const value = index + 1; // 1, 2, 3, 4, 5
            tabSpacesSlider.value = value;
            refreshTabSpaces(value);
        });
    });

    function getCurrentTabSize(session) {
        return typeof session.getTabSize === 'function'
        ? session.getTabSize()
        : (session.$tabSize || 4);
    }

    // change tab spacing
    function retabDocumentByUnits(session, oldSize, newSize) {

        const doc = session.getDocument();
        const lineCount = session.getLength();

        const changeSpacing = () => {
            for (let row = 0; row < lineCount; row++) {
                const line = session.getLine(row);
                const m = line.match(/^[\t ]+/);
                if (!m) continue;

                const oldIndent = m[0];

                // measure current column spacing
                let cols = 0;
                for (const ch of oldIndent) {
                    if (ch === '\t') cols += oldSize - (cols % oldSize);
                    else cols += 1; // space
                }

                // convert columns to indent units, still old size
                const units = Math.floor(cols / oldSize);
                const remainder = cols % oldSize; // keep alignment

                // make new indent with new size
                let newIndent;
                newIndent = ' '.repeat(units * newSize + remainder);

                if (newIndent !== oldIndent) {
                    doc.replace(new Range(row, 0, row, oldIndent.length), newIndent);
                }
            }
        };

        const um = session.getUndoManager();
        if (um && typeof um.transact === 'function') um.transact(changeSpacing);
        else changeSpacing();
    }

    // update tab spacing
    function refreshTabSpaces(value) {
        const session = editor.session;
        const newSize = parseInt(value, 10);
        const oldSize = getCurrentTabSize(session);
        if (!Number.isFinite(newSize) || newSize === oldSize) return;

        session.setUseSoftTabs(true);
        session.setTabSize(newSize);
        editor.setOption('tabSize', newSize);

        retabDocumentByUnits(session, oldSize, newSize);

        tabSpacesValue.textContent = newSize;
        tabSpacesInfo.textContent = `Tab Spaces: ${newSize}`;
        editor.renderer.updateFull();
    }

    tabSpacesSlider.addEventListener('input',  e => refreshTabSpaces(e.target.value));
    tabSpacesSlider.addEventListener('change', e => refreshTabSpaces(e.target.value));

    // ------------------------ Font ------------------------
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');

    // make ticks clickable
    const fontSizeTicks = document.querySelectorAll('#fontSizeSlider + .slider-ticks .tick');
    fontSizeTicks.forEach((tick) => {
        tick.addEventListener('click', () => {
            const value = parseInt(tick.textContent); // evens from 10-24
            fontSizeSlider.value = value;
            updateFontSize(value);
        });
    });

    // update font size
    function refreshFontSize(value) {
        editor.setFontSize(parseInt(value));
        fontSizeValue.textContent = value;
    }

    fontSizeSlider.addEventListener('input', (e) => {
        refreshFontSize(e.target.value);
    });

    // typeface
    const fontFamilySelect = document.getElementById('fontFamilySelect');

    // update font family
    function updateFontFamily(fontFamily) {
        editor.setOption('fontFamily', fontFamily);
        // Also set CSS directly as backup
        const editorElement = document.getElementById('code');
        if (editorElement) {
            editorElement.style.fontFamily = fontFamily;
        }
    }

    fontFamilySelect.addEventListener('change', (e) => {
        updateFontFamily(e.target.value);
    });

    // init ui
    const initialTab = getCurrentTabSize(editor.session);
    tabSpacesSlider.value = initialTab;
    tabSpacesValue.textContent = initialTab;
    tabSpacesInfo.textContent = `Tab Spaces: ${initialTab}`;

    if (editor.renderer.$theme) refreshEditortheme();
    editor.renderer.on('themeLoaded', refreshEditortheme);

    // ------------------------ Editor Theme ------------------------
    const editorthemeOverlay = document.getElementById('editorthemeOverlay');
    const closeEditortheme = document.getElementById('closeEditortheme');
    let editorthemeItemsInitialized = false;

    // show editortheme overlay when clicked
    changeEditortheme.addEventListener('click', () => {
        settingsOverlay.style.display = 'none';
        editorthemeOverlay.style.display = 'flex';

        // initialize editortheme items if not done yet
        if (!editorthemeItemsInitialized) {
            const editorthemeItems = document.querySelectorAll('.editortheme-item');

            // on editortheme item click
            editorthemeItems.forEach(item => {
                item.addEventListener('click', () => {
                    const editortheme = item.dataset.editortheme;

                    editor.setTheme(editortheme);

                    // update editortheme state
                    editorthemeItems.forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                });
            });

            editorthemeItemsInitialized = true;
        }

        // highlight current editortheme
        const currentEditortheme = editor.getTheme();
        const editorthemeItems = document.querySelectorAll('.editortheme-item');
        editorthemeItems.forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.editortheme === currentEditortheme) {
                item.classList.add('selected');
            }
        });
    });

    // close editortheme overlay and go back to settings
    closeEditortheme.addEventListener('click', () => {
        editorthemeOverlay.style.display = 'none';
        settingsOverlay.style.display = 'flex';
    });

    // update bottom bar and topbar colors
    function refreshEditortheme() {
        const bottomBar = document.querySelector('.bottombar');
        const topBar = document.querySelector('.topbar');
        const topBarButtons = topBar.querySelectorAll('.topbar .btn');
        const editorthemeObj = editor.renderer.$theme || {};
        const cssClass = editorthemeObj.cssClass || `ace-${(editor.getTheme() || '').split('/').pop()}`;

        // find editortheme colors
        const host = document.createElement('div');
        host.className = `ace_editor ${cssClass}`;
        host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;';
        const gutter = document.createElement('div');
        gutter.className = 'ace_gutter';
        host.appendChild(gutter);
        document.body.appendChild(host);

        const cs = (el) => window.getComputedStyle(el);

        // read editortheme colors
        let editorBg;
        let editorText;

        const actualEditor = document.querySelector('#code');
        editorBg = cs(actualEditor).backgroundColor;
        editorText = cs(actualEditor).color;

        // apply to bottom bar and topbar
        bottomBar.style.backgroundColor = editorBg;
        bottomBar.style.color = editorText;

        topBar.style.backgroundColor = editorBg;
        topBar.style.color = editorText;

        // color all buttons and icons in topbar
        topBarButtons.forEach(btn => {
            btn.style.color = editorText;

            const icons = btn.querySelectorAll('ion-icon');
            icons.forEach(icon => {
                icon.style.color = editorText;
            });
        });

        document.body.removeChild(host);
    }

    // ------------------------ Run / Stop ------------------------
    const runBtn = document.querySelector('.btn.run');

    let worker = null;
    let runId = 0;           // incremental id to disambiguate overlapping timers
    let isRunning = false;
    let flipTimer = null;    // delayed flip timer
    let currentLocalRunId = 0;
    let clearIndicators = null;

    function setRunButton(running) {
        if (running) {
            runBtn.textContent = 'Stop';
            runBtn.classList.remove('run');
            runBtn.classList.add('stop');
        } else {
            runBtn.textContent = 'Run';
            runBtn.classList.remove('stop');
            runBtn.classList.add('run');
        }
    }

    function attachWorkerHandlers(localRunId) {
        let runningLine = null;
        let runningTimer = null;
        let dotTimer = null;
        let dotPhase = 0; // 0..3 => '' '.' '..' '...'

        // Set up animated dot ticker
        runningTimer = setTimeout(() => {
            if (isRunning && localRunId === runId) {
                runningLine = consoleLine('', 'stdin');                  // create a line to update
                runningLine.style.color = 'var(--green)'; 
                dotTimer = setInterval(() => {
                    dotPhase = (dotPhase + 1) % 4;                    // cycle
                    runningLine.textContent = '.'.repeat(dotPhase);   // '', '.', '..', '...'
                    if (dotPhase == 0) runningLine.textContent = '\u00A0'
                }, 300);
            }
        }, 40);

        const clearRunningIndicators = () => {
            if (runningTimer) { clearTimeout(runningTimer); runningTimer = null; }
            if (dotTimer)     { clearInterval(dotTimer);    dotTimer = null; }
            if (runningLine)  { runningLine.style.removeProperty('color'); } // reset color
        };

        // Capture indicators for force-terminate cleanup
        clearIndicators = clearRunningIndicators;
        currentLocalRunId = localRunId;

        worker.onmessage = (e) => {
            const { type } = e.data || {};

            if (type === 'done') {
                const out = String(e.data.output || '').trim();
                clearRunningIndicators();

                if (runningLine) {
                    runningLine.textContent = out || '(no output)';
                    runningLine.className = 'line stdout';
                } else {
                    consoleOutput.println(out || '(no output)', 'stdout');
                }
                finishRun(localRunId);

            } else if (type === 'error') {
                const msg = String(e.data.error || 'Unknown error');
                clearRunningIndicators();

                if (runningLine) {
                    runningLine.textContent = msg;
                    runningLine.className = 'line stderr';
                } else {
                    consoleOutput.error(msg);
                }
                finishRun(localRunId);

            } else if (type === 'stopped') {
                clearRunningIndicators();
                
                if (runningLine) {
                    runningLine.textContent = 'Execution stopped';
                    runningLine.className = 'line stderr';
                } else {
                    consoleOutput.println('Execution stopped', 'stderr');
                }
                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            const errorMsg = `Worker error: ${e.message || e.filename || 'unknown'}`;
            clearRunningIndicators();

            if (runningLine) {
                runningLine.textContent = errorMsg;
                runningLine.className = 'line stderr';
            } else {
                consoleOutput.error(errorMsg);
            }
            finishRun(localRunId);
        };
    }

    function finishRun(localRunId) {
        if (localRunId !== runId) return; // stale completion
        isRunning = false;
        if (flipTimer) { clearTimeout(flipTimer); flipTimer = null; }
        setRunButton(false);
        if (worker) { worker.terminate(); worker = null; }
    }

    function stopCode() {
        // tell the worker to stop; force-terminate after a short grace period
        try { worker && worker.postMessage({ type: 'stop' }); } catch {}
        setTimeout(() => {
            if (worker) {
                try { worker.terminate(); } catch {}
                worker = null;
            }
            if (typeof clearIndicators === 'function') {
                clearIndicators(); // stop the green dots
                // Replace running line with "Execution stopped" if it exists
                const runningLine = document.querySelector('.line.stdin');
                if (runningLine) {
                    runningLine.textContent = 'Execution stopped';
                    runningLine.className = 'line stderr';
                }
            }
            finishRun(currentLocalRunId);                                  // flip button back to Run
        }, 300);
    }
    
    function runCode() {
        if (isRunning) return; // ignore double clicks
        
        const code = editor.getValue();
        const localRunId = ++runId;
        isRunning = true;

        // keep the button green briefly; flip to red only if still running
        if (flipTimer) clearTimeout(flipTimer);
        flipTimer = setTimeout(() => {
            if (isRunning && localRunId === runId) setRunButton(true);
        }, 30);

        // snapshot the current INPUT queue; the worker will consume it
        const inputQueue = Array.isArray(window.__ide_input_queue)
            ? window.__ide_input_queue.slice()
            : [];

        // start worker
        worker = new Worker('runner.js');
        attachWorkerHandlers(localRunId);

        // send job
        worker.postMessage({ type: 'run', code, inputQueue });
    }

    // Run/Stop button behavior
    runBtn.addEventListener('click', () => {
        if (runBtn.classList.contains('stop')) stopCode();
        else runCode();
    });    

    // ------------------------ Console ------------------------
    const console = document.querySelector('.console');
    const consoleSidebar = document.querySelector('.console-sidebar');
    const consoleMain = document.querySelector('.console-main');

    const clearBtn = document.querySelector('.btn.clear');
    const copyBtn = document.querySelector('.btn.copy');

    // ---------- Console wiring ----------
    const consoleBody  = document.getElementById('console-body');
    const consolePrompt = document.querySelector('.console-prompt');
    const cursor = document.querySelector('.cursor');

    let currentCommand = '';
    let commandHistory = [];
    let historyIndex = -1;

    function consoleLine(text, cls = 'stdout') {
        const div = document.createElement('div');
        div.className = `line ${cls}`;
        div.textContent = text;
        consoleBody.appendChild(div);
        consoleBody.scrollTop = consoleBody.scrollHeight;
        updateButtonStates();
        return div; // Return the element so it can be referenced later
    }

    function updateButtonStates() {
        const hasContent = consoleBody.children.length > 0;
        clearBtn.disabled = !hasContent;
        copyBtn.disabled = !hasContent;
    }

    function updatePrompt() {
        const commandText = document.querySelector('.command-text');
        commandText.textContent = currentCommand;
    }

    const consoleOutput = {
        println: (t, cls) => consoleLine(t, cls),
        info:    (t) => consoleLine(t, 'stdin'),
        error:   (t) => consoleLine(t, 'stderr'),
        clear:   () => { 
            consoleBody.textContent = ''; 
            updateButtonStates();
        },
    };

    // Minimal command set (type 'help')
    function execCommand(raw) {
        const line = String(raw || '').trim();
        if (!line) return;
        commandHistory.push(line);
        historyIndex = commandHistory.length;

        const [cmd, ...rest] = line.split(/\s+/);
        const arg = rest.join(' ');
        const cmdLower = (cmd || '').toLowerCase();

        // Check if it's a valid command
        const validCommands = ['help', 'run', 'in', 'input', 'clear', 'tab', 'font', 'mode', 'theme', 'stop'];
        const isValidCommand = validCommands.includes(cmdLower);

        if (isValidCommand) {
            // Show command in green, arguments in white
            const coloredLine = `> <span style="color: var(--green);">${cmd}</span>${arg ? ` <span style="color: var(--text);">${arg}</span>` : ''}`;
            consoleBody.innerHTML += `<div class="line stdin">${coloredLine}</div>`;
            consoleBody.scrollTop = consoleBody.scrollHeight;
        } else {
            // Show invalid command normally
            consoleOutput.info(`> ${line}`);
        }

        switch (cmdLower) {
            case 'help':
            consoleOutput.println(
                [
                    'Commands:',
                    '  run                 Execute code in the editor',
                    '  stop                Stop currently running code',
                    '  in <value>          Queue an INPUT value for next run',
                    '  clear               Clear console output',
                    '  tab <n>             Set editor tab size (1-8 spaces)',
                    '  font <px>           Set editor font size (10-24px)',
                    '  mode <light|dark>   Switch mode to light or dark',
                    '  theme <theme>       Switch editor theme',
                ].join('\n'),
                'stdout'
            );
            break;

            case 'run':
                runCode();
            break;

            case 'stop':
                if (window.__ide_stop_flag) {
                    consoleOutput.println('Code execution was already stopped', 'stdout');
                } else {
                    window.__ide_stop_flag = true;
                    stopCode()
                    consoleOutput.println('Stopping...', 'stdout');
                }
            break;

            case 'in': // this falls through to the input case
            case 'input':
                if (!arg) return consoleOutput.error('Usage: input <value>');
                if (!Array.isArray(window.__ide_input_queue)) window.__ide_input_queue = [];
                window.__ide_input_queue.push(arg);
                consoleOutput.println(`Queued input: ${arg}`, 'stdout');
                break;

            case 'clear':
                consoleOutput.clear();
            break;

            case 'tab': {
                const n = parseInt(rest[0], 10);
                if (Number.isInteger(n) && n >= 1 && n <= 8) { // 1-8 spaces
                    editor.session.setTabSize(n);
                    consoleOutput.println(`Tab size: ${n}`, 'stdout');
                } else {
                    consoleOutput.error('Usage: tab <1-8 spaces>');
                }
                break;
            }

            case 'font': {
                const px = parseInt(rest[0], 10);
                if (Number.isInteger(px)) {
                    editor.setFontSize(px);
                    consoleOutput.println(`Editor font size: ${px}px`, 'stdout');
                } else {
                    consoleOutput.error('Usage: font <10-24px>');
                }
                break;
            }

            case 'mode': {
                const t = (rest[0] || '').toLowerCase();
                if (t === 'light') {
                    document.documentElement.classList.add('light');
                    editor.setTheme('ace/theme/github');
                    moonIcon.hidden = false;
                    sunIcon.hidden = true;
                } else if (t === 'dark') {
                    document.documentElement.classList.remove('light');
                    editor.setTheme('ace/theme/monokai');
                    moonIcon.hidden = true;
                    sunIcon.hidden = false;
                } else {
                    return consoleOutput.error('Usage: mode <light|dark>');
                }

                consoleOutput.println(`Mode: ${t}`, 'stdout');
                break;
            }

            case 'theme': {
                // extract themes
                const themeItems = document.querySelectorAll('.editortheme-item');
                const editorThemes = Array.from(themeItems).map(item => {
                    const aceTheme = item.dataset.editortheme;
                    return aceTheme.replace('ace/theme/', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                });
                
                const t = rest.join(' ').toLowerCase().replace(/[_-]/g, ' ');
                if (!t) return consoleOutput.error('Usage: theme <theme_name>');
                
                // find theme in list
                let themeIndex = -1;
                for (let i = 0; i < editorThemes.length; i++) {
                    if (editorThemes[i].toLowerCase() === t) {
                        themeIndex = i;
                        break;
                    }
                }
                
                if (themeIndex === -1) {
                    return consoleOutput.error(`Invalid theme: ${t}`);
                }
                
                // set theme
                editor.setTheme(`ace/theme/${editorThemes[themeIndex].toLowerCase()}`);
                consoleOutput.println(`Theme: ${editorThemes[themeIndex]}`, 'stdout');
                break;
            }

            default:
                consoleOutput.error(`Unknown command: ${cmd}`);
        }
    }

    // Keyboard event handling for console
    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            execCommand(currentCommand);
            currentCommand = '';
            updatePrompt();
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            currentCommand = currentCommand.slice(0, -1);
            updatePrompt();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                historyIndex = Math.max(0, historyIndex - 1);
                currentCommand = commandHistory[historyIndex] || '';
                updatePrompt();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                historyIndex = Math.min(commandHistory.length, historyIndex + 1);
                currentCommand = historyIndex === commandHistory.length ? '' : commandHistory[historyIndex];
                updatePrompt();
            }
        } else if (e.key.length === 1) {
            // Regular character input
            e.preventDefault();
            currentCommand += e.key;
            updatePrompt();
        }
}

    // Make console focusable and add keyboard listener
    consolePrompt.setAttribute('tabindex', '0');
    consolePrompt.addEventListener('keydown', handleKeyDown);

    // Focus console when clicked
    consolePrompt.addEventListener('click', () => {
        consolePrompt.focus();
    });

    // Initialize button states
    updateButtonStates();

    // ------------------------ Splitter ------------------------
    (function () {
        const workspace  = document.getElementById('workspace');
        const editorPane = document.getElementById('editor-pane');
        const consolePane   = document.getElementById('console-pane');
        const splitter   = document.getElementById('splitter');
    
        const SPLITTER_H   = parseFloat(getComputedStyle(splitter).height) || 8;
        const MIN_EDITOR_H = 120;
        const MIN_CONSOLE_H   = 120;

        // Height of fixed siblings inside the workspace (run bar + bottom bar)
        function fixedBarsHeight() {
            const bb = document.querySelector('.bottombar');
            const rc = document.querySelector('.run-container');
            return (bb?.offsetHeight || 0) + (rc?.offsetHeight || 0);
        }

        function availableStackHeight() {
            const wsRect = workspace.getBoundingClientRect();
            return wsRect.height;
          }
    
        function applySplit(editorPx) {
            const avail = availableStackHeight();
            const maxEditor = Math.max(MIN_EDITOR_H, avail - SPLITTER_H - MIN_CONSOLE_H);
            const clamped   = Math.min(Math.max(editorPx, MIN_EDITOR_H), maxEditor);
            const newConsole   = avail - SPLITTER_H - clamped;
        
            editorPane.style.flex = '0 0 auto';
            consolePane.style.flex   = '0 0 auto';
            editorPane.style.height = clamped + 'px';
            consolePane.style.height   = newConsole + 'px';
        
            if (window.editor) window.editor.resize(true);
        }
    
        // Set a sensible initial split (about 62% editor / 38% console)
        function layoutInitial() {
            const avail   = availableStackHeight();
            const targetE = Math.round(
                Math.max(MIN_EDITOR_H,
                Math.min(avail - SPLITTER_H - MIN_CONSOLE_H, 0.50 * (avail - SPLITTER_H)))
            );
            applySplit(targetE);
        }
    
        let dragging = false;
        let startY = 0;
        let startEditorH = 0;
    
        function beginDrag(e) {
            dragging = true;
            startY = e.clientY;
            startEditorH = editorPane.getBoundingClientRect().height;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', endDrag);
            e.preventDefault();
        }

        function onDrag(e) {
            if (!dragging) return;
            const dy = e.clientY - startY;
            applySplit(startEditorH + dy);
        }
    
        function endDrag() {
            dragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
        }

        splitter.addEventListener('mousedown', beginDrag);

        // Keep proportions on window resize
        window.addEventListener('resize', () => {
            const eH = editorPane.getBoundingClientRect().height;
            const cH = consolePane.getBoundingClientRect().height;
            const total = eH + SPLITTER_H + cH || 1;
            const ratio = eH / total;
            const avail = availableStackHeight();
            applySplit(Math.round(ratio * (avail - SPLITTER_H)));
        });
    
        // Do the initial layout once everything paints
        requestAnimationFrame(layoutInitial);
    })();

    // clear
    clearBtn.addEventListener('click', () => {
        consoleOutput.clear();
    });

    // copy console output
    copyBtn.addEventListener('click', () => {
        const output = consoleBody.textContent;

        navigator.clipboard.writeText(output).then(() => {
            // store original copy icon to change back to
            const originalcopyIcon = copyBtn.innerHTML;

            // animate to copied state
            copyBtn.style.transition = 'background 0.3s, color 0.3s';
            copyBtn.style.background = 'var(--green-accent)'; // green
            copyBtn.style.color = 'white';
            copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';

            // animate back to original state
            setTimeout(() => {
                copyBtn.style.background = '';
                copyBtn.style.color = '';

                // wait for the transition to finish before changing icon back
                setTimeout(() => {
                    copyBtn.innerHTML = originalcopyIcon;
                }, 20);
            }, 750);
        }).catch(err => {
            consoleOutput.error('Failed to copy text: ', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = output;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                // Show success feedback even with fallback
                const originalcopyIcon = copyBtn.innerHTML;
                copyBtn.style.transition = 'background 0.3s, color 0.3s';
                copyBtn.style.background = 'var(--green-accent)';
                copyBtn.style.color = 'white';
                copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
                
                setTimeout(() => {
                    copyBtn.style.background = '';
                    copyBtn.style.color = '';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalcopyIcon;
                    }, 20);
                }, 750);
            } catch (fallbackErr) {
                consoleOutput.error('Fallback copy failed: ', fallbackErr);
            }
            document.body.removeChild(textArea);
        });
    });

    // load formatter
    document.addEventListener('DOMContentLoaded', () => {
        if (window.pseudoFormatter) {
            window.pseudoFormatter.wireFormatterButton();
        }
    });
})();
