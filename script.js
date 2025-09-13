(function () {

    // ------------------------ Initialization ------------------------
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

    // Use only our language completer (no word-based suggestions)
    try {
        const LangModule = ace.require('ace/mode/lang');
        if (LangModule && LangModule.langCompleter) {
            editor.completers = [LangModule.langCompleter];
        }
    } catch {}

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

    // ------------------------ Line/Column Info ------------------------
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
    const editorThemeSelect = document.getElementById('editorThemeSelect');
    const downloadEditorBtn = document.getElementById('downloadEditorBtn');

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

    // ------------------------ File Save Function ------------------------
    async function saveTextAsFile(filename, text) {
        try {
            // Show Chrome's Save dialog
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: "Text", accept: { "text/plain": [".txt"] } }]
            });

            const writable = await handle.createWritable();
            await writable.write(new Blob([text], { type: "text/plain" }));
            await writable.close();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error saving file:', error);
            }
        }
    }

    // ------------------------ Download Editor Code ------------------------
    downloadEditorBtn.addEventListener('click', async () => {
        const code = editor.getValue();
        
        if (!code.trim()) {
            return; // Don't download empty files
        }

        // Create filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `code_${timestamp}.txt`;
        
        await saveTextAsFile(filename, code);
    });

    // ------------------------ Light/Dark Mode Toggle ------------------------
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const moonIcon = modeToggleBtn.querySelector('.moon-icon');
    const sunIcon = modeToggleBtn.querySelector('.sun-icon');

    // Define light and dark themes
    const lightThemes = [
        'ace/theme/chrome', 'ace/theme/clouds', 'ace/theme/dawn', 'ace/theme/dreamweaver',
        'ace/theme/eclipse', 'ace/theme/github', 'ace/theme/gruvbox_light_hard', 'ace/theme/iplastic',
        'ace/theme/katzenmilch', 'ace/theme/kuroir', 'ace/theme/solarized_light', 'ace/theme/sqlserver',
        'ace/theme/textmate', 'ace/theme/tomorrow', 'ace/theme/xcode'
    ];
    
    const darkThemes = [
        'ace/theme/ambiance', 'ace/theme/chaos', 'ace/theme/clouds_midnight', 'ace/theme/cobalt',
        'ace/theme/dracula', 'ace/theme/gruvbox', 'ace/theme/gruvbox_dark_hard', 'ace/theme/idle_fingers',
        'ace/theme/kr_theme', 'ace/theme/merbivore', 'ace/theme/monokai', 'ace/theme/nord_dark',
        'ace/theme/one_dark', 'ace/theme/pastel_on_dark', 'ace/theme/solarized_dark', 'ace/theme/terminal',
        'ace/theme/tomorrow_night', 'ace/theme/tomorrow_night_blue', 'ace/theme/tomorrow_night_bright',
        'ace/theme/tomorrow_night_eighties', 'ace/theme/twilight', 'ace/theme/vibrant_ink'
    ];

    function toggleMode() {
        const isLight = document.documentElement.classList.contains('light');
        const currentTheme = editor.getTheme();
        
        // add class to disable transitions during mode switch
        document.documentElement.classList.add('mode-switching');
        
        // switch from light to dark mode
        if (isLight) {
            document.documentElement.classList.remove('light');
            moonIcon.hidden = true; // show dark theme icon
            sunIcon.hidden = false; // show light theme icon
            
            // if current theme is light
            if (lightThemes.includes(currentTheme)) {
                editor.setTheme('ace/theme/monokai'); // switch to default dark theme
            }
        // switch from dark to light mode
        } else {
            document.documentElement.classList.add('light');
            moonIcon.hidden = false; // show light theme icon
            sunIcon.hidden = true;   // show dark theme icon
            
            // if current theme is dark
            if (darkThemes.includes(currentTheme)) {
                editor.setTheme('ace/theme/github'); // switch to default light theme
            }
        }
        
        // re-enable transitions
        setTimeout(() => {
            document.documentElement.classList.remove('mode-switching');
        }, 50);
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

    // make ticks clickable (only those with numbers)
    const fontSizeTicks = document.querySelectorAll('#fontSizeSlider + .slider-ticks .tick');
    fontSizeTicks.forEach((tick) => {
        // only make clickable if tick has content (is a number)
        if (tick.textContent.trim()) {
            tick.addEventListener('click', () => {
                const value = parseInt(tick.textContent); // evens from 10-24
                fontSizeSlider.value = value;
                updateFontSize(value);
            });
        }
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

    // editor theme
    editorThemeSelect.addEventListener('change', (e) => {
        editor.setTheme(e.target.value);
    });

    // set initial theme in dropdown
    editorThemeSelect.value = editor.getTheme();

    // init ui
    const initialTab = getCurrentTabSize(editor.session);
    tabSpacesSlider.value = initialTab;
    tabSpacesValue.textContent = initialTab;
    tabSpacesInfo.textContent = `Tab Spaces: ${initialTab}`;

    if (editor.renderer.$theme) refreshEditortheme();
    editor.renderer.on('themeLoaded', refreshEditortheme);

    // ------------------------ Editor Theme ------------------------

    // update bottom bar and topbar colors
    function refreshEditortheme() {
        const bottomBar = document.querySelector('.bottombar');
        const topBar = document.querySelector('.topbar');
      
        const editorthemeObj = editor.renderer.$theme || {};
        const cssClass = editorthemeObj.cssClass || `ace-${(editor.getTheme() || '').split('/').pop()}`;
      
        const host = document.createElement('div');
        host.className = `ace_editor ${cssClass}`;
        host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;';
        const gutter = document.createElement('div');
        gutter.className = 'ace_gutter';
        host.appendChild(gutter);
        document.body.appendChild(host);
      
        const actualEditor = document.querySelector('#code');
        const cs = el => window.getComputedStyle(el);
        const editorBg = cs(actualEditor).backgroundColor;
        const editorText = cs(actualEditor).color;
      
        // apply background/text to both bars
        [bottomBar, topBar].filter(Boolean).forEach(bar => {
            bar.style.backgroundColor = editorBg;
            bar.style.color = editorText;
        });
      
        // color icons/buttons in both bars
        document.querySelectorAll('.topbar .btn').forEach(btn => {
            btn.style.color = editorText;
            btn.querySelectorAll('ion-icon').forEach(icon => (icon.style.color = editorText));
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
    let currentRunningLine = null;  // track the most recent running line

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
        let dotPhase = 0;

        // Set up animated dot ticker
        runningTimer = setTimeout(() => {
            if (isRunning && localRunId === runId) {
                runningLine = consoleLine('', 'stdin');                  // create a line to update
                runningLine.style.color = 'var(--green)'; 
                currentRunningLine = runningLine;  // store globally
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
            currentRunningLine = null;  // clear global reference
        };

        // Capture indicators for force-terminate cleanup
        clearIndicators = clearRunningIndicators;
        currentLocalRunId = localRunId;

        worker.onmessage = (e) => {
            const { type } = e.data || {};

            if (type === 'done') {
                const full = String(e.data.output || '');
                const out  = (full.startsWith(__flushedPrefix) ? full.slice(__flushedPrefix.length) : full).trim();
                
                clearRunningIndicators();

                if (out) {
                    terminalWrite(out + '\r\n');
                } else {
                    // If we already flushed any output earlier, don't print "(no output)"
                    if (!hadFlushOutput) {
                        terminalWrite('(no output)\r\n');
                    }
                }

                finishRun(localRunId);

            } else if (type === 'error') {
                const msg = String(e.data.error || 'Unknown error');
                
                clearRunningIndicators();
                terminalWrite(msg + '\r\n', '31'); // red
                
                finishRun(localRunId);

            } else if (type === 'stopped') {
                clearRunningIndicators();
                terminalWrite('Execution stopped\r\n', '31'); // red
                
                finishRun(localRunId);
            } else if (type === 'input_request') {
                // Clear "running..." dots and switch to program input mode
                clearRunningIndicators();
                awaitingProgramInput = true;

            } else if (type === 'flush') {
                const s = String(e.data.output || '');
                const newPart = s.startsWith(__flushedPrefix) ? s.slice(__flushedPrefix.length) : s;
                __flushedPrefix += newPart;

                newPart.split('\n').forEach(part => {
                    hadFlushOutput = true; // we printed something this run
                    if (part === '') {
                        consoleLine('', 'stdout');      // real blank line
                    } else {
                        const lineEl = consoleLine('', 'stdout');
                        lineEl.textContent = part;
                    }
                });
            } else if (type === 'warning') {
                const msg = (e.data && (e.data.message ?? e.data.text)) || '';
                if (!msg) return;
                const lineEl = consoleLine('', 'warning');
                lineEl.innerHTML = `<span class="warning-text">${msg}</span>`;
            }
        };

        worker.onerror = (e) => {
            const errorMsg = `Worker error: ${e.message || e.filename || 'unknown'}`;
            
            // Store reference to running line before clearing indicators
            const runningLineToReplace = currentRunningLine;
            clearRunningIndicators();

            if (runningLineToReplace) {
                runningLineToReplace.textContent = errorMsg;
                runningLineToReplace.className = 'line stderr';
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
        currentRunContainer = null;
    }

    function stopCode() {
        // tell the worker to stop; force-terminate after a short grace period
        try { worker && worker.postMessage({ type: 'stop' }); } catch {}
        setTimeout(() => {
            if (worker) {
                try { worker.terminate(); } catch {}
                worker = null;
            }
            // Store reference to running line before clearing indicators
            const runningLineToReplace = currentRunningLine;
            if (typeof clearIndicators === 'function') {
                clearIndicators(); // stop the green dots
            }
            // Replace the most recent running line with "Execution stopped"
            if (runningLineToReplace) {
                runningLineToReplace.textContent = 'Execution stopped';
                runningLineToReplace.className = 'line stderr';
            }
            finishRun(currentLocalRunId);                                  // flip button back to Run
        }, 300);
    }
    
    function runCode() {
        if (isRunning) return; // repeated "run" inputs
        
        __flushedPrefix = '';        // <-- add this
        lastStdoutEl = null;
        inputPromptBase = '';
        hadFlushOutput = false;
        const code = editor.getValue();
        const localRunId = ++runId;
        isRunning = true;

        // keep the button green briefly; flip to red only if still running
        if (flipTimer) clearTimeout(flipTimer);
        flipTimer = setTimeout(() => {
            if (isRunning && localRunId === runId) setRunButton(true);
        }, 30);

        // No input queue needed - input will be handled interactively

        // create a container for this run's output so we can reorder it later
        currentRunContainer = document.createElement('div');
        currentRunContainer.className = 'run-chunk';
        if (inputLineEl && inputLineEl.isConnected) {
            consoleBody.insertBefore(currentRunContainer, inputLineEl);
        } else {
            consoleBody.appendChild(currentRunContainer);
        }

        // start worker
        worker = new Worker('runner.js');
        attachWorkerHandlers(localRunId);

        // send job
        worker.postMessage({ type: 'run', code });
    }

    // Run/Stop button behavior
    runBtn.addEventListener('click', () => {
        if (runBtn.classList.contains('stop')) stopCode();
        else {
            // Display "> run" command in console for button click
            consoleOutput.info('run');
            runCode();
        }
    });    

    // ------------------------ Console --------------------------------
    const clearBtn = document.querySelector('.btn.clear');
    const copyBtn = document.querySelector('.btn.copy');
    const downloadBtn = document.querySelector('.btn.download');

    // ---------- Terminal wiring ----------
    const terminal = new Terminal({
        theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            selection: '#ffffff30',
            black: '#000000',
            red: '#ff0000',
            green: '#00ff00',
            yellow: '#ffff00',
            blue: '#0000ff',
            magenta: '#ff00ff',
            cyan: '#00ffff',
            white: '#ffffff',
            brightBlack: '#808080',
            brightRed: '#ff8080',
            brightGreen: '#80ff80',
            brightYellow: '#ffff80',
            brightBlue: '#8080ff',
            brightMagenta: '#ff80ff',
            brightCyan: '#80ffff',
            brightWhite: '#ffffff'
        },
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block'
    });
    
    terminal.open(document.getElementById('terminal'));

    let fitAddon = null;
    try {
      const FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || FitAddon;
      fitAddon = new FitCtor();
      terminal.loadAddon(fitAddon);
      // initial fit after the terminal attaches
      setTimeout(() => fitAddon.fit(), 0);
    } catch (e) {
      // Optional: console.warn('xterm-addon-fit not loaded; terminal won't auto-resize');
    }

    function fitTerm() { if (fitAddon) fitAddon.fit(); }

    // Terminal state
    let currentCommand = '';
    let commandHistory = [];
    let historyIndex = -1;
    let awaitingProgramInput = false;

    // Terminal data handler
    terminal.onData(data => {
        if (awaitingProgramInput) {
            // Handle program input
            if (data === '\r') { // Enter
                terminal.write('\r\n');
                worker.postMessage({ type: 'input_response', value: currentCommand });
                currentCommand = '';
                awaitingProgramInput = false;
            } else if (data === '\u007f') { // Backspace
                if (currentCommand.length > 0) {
                    currentCommand = currentCommand.slice(0, -1);
                    terminal.write('\b \b');
                }
            } else if (data.length === 1 && data >= ' ') { // Printable characters
                currentCommand += data;
                terminal.write(data);
            }
        } else {
            // Handle console commands
            if (data === '\r') { // Enter
                terminal.write('\r\n');
                execCommand(currentCommand);
                currentCommand = '';
            } else if (data === '\u007f') { // Backspace
                if (currentCommand.length > 0) {
                    currentCommand = currentCommand.slice(0, -1);
                    terminal.write('\b \b');
                }
            } else if (data === '\u001b[A') { // Arrow Up
                if (commandHistory.length > 0) {
                    historyIndex = Math.max(0, historyIndex - 1);
                    currentCommand = commandHistory[historyIndex] || '';
                    terminal.write('\r\x1b[K' + currentCommand);
                }
            } else if (data === '\u001b[B') { // Arrow Down
                if (commandHistory.length > 0) {
                    historyIndex = Math.min(commandHistory.length, historyIndex + 1);
                    currentCommand = historyIndex === commandHistory.length ? '' : commandHistory[historyIndex];
                    terminal.write('\r\x1b[K' + currentCommand);
                }
            } else if (data.length === 1 && data >= ' ') { // Printable characters
                currentCommand += data;
                terminal.write(data);
            }
        }
    });

    function terminalWrite(text, color = null) {
        if (color) {
            terminal.write(`\x1b[${color}m${text}\x1b[0m`);
        } else {
            terminal.write(text);
        }
    }

    function updateButtonStates() {
        // Terminal always has content, so buttons are always enabled
        clearBtn.disabled = false;
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
    }

    // Terminal output functions
    const consoleOutput = {
        println: (t, cls) => terminalWrite(t + '\r\n'),
        info:    (t) => terminalWrite(t + '\r\n'),
        error:   (t) => terminalWrite(t + '\r\n', '31'), // red
        clear:   () => terminal.clear(),
    };

    // console commands
    function execCommand(raw) {
        const line = String(raw || '').trim();
        if (!line) return;
        commandHistory.push(line);
        historyIndex = commandHistory.length;

        const [cmd, ...rest] = line.split(/\s+/);
        const arg = rest.join(' ');
        const cmdLower = (cmd || '').toLowerCase();

        // check if command is valid
        const validCommands = ['help', 'run', 'clear', 'tab', 'font', 'mode', 'theme', 'stop'];
        const isValidCommand = validCommands.includes(cmdLower);

        if (isValidCommand) {
            // Don't display "> stop" command if something is running
            if (cmdLower === 'stop' && isRunning) {
                // Skip displaying the command
            } else {
                // command is green, arguments are white
                terminalWrite(`\x1b[32m${cmd}\x1b[0m${arg ? ` ${arg}` : ''}\r\n`);
            }
        } else {
            // show invalid command
            consoleOutput.info(`${line}`);
        }

        switch (cmdLower) {
            case 'help':
            consoleOutput.println(
                [
                    'Commands:',
                    '  run                 Execute code in the editor',
                    '  stop                Stop currently running code',
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
                if (!isRunning) {
                    consoleOutput.error('No running execution to stop');
                    return;
                }
                
                window.__ide_stop_flag = true;        
                stopCode()
                break;

            case 'clear':
                consoleOutput.clear();
            break;

            case 'tab': {
                const n = parseInt(rest[0], 10);
                if (Number.isInteger(n) && n >= 0 && n <= 8) {
                    refreshTabSpaces(n);
                    consoleOutput.println(`Tab size: ${n}`, 'stdout');
                    if (n === 0) {
                        consoleOutput.println('Warning: using the "tab" command again will not reverse this change.', 'warning');
                        consoleOutput.println('Press Cmd/Ctrl+Z to restore.', 'warning');
                    }
                } else {
                    consoleOutput.error('Usage: tab <0-8 spaces>');
                }
                break;
            }

            case 'font': {
                const px = parseInt(rest[0], 10);
                if (Number.isInteger(px) && px >= 6 && px <= 50) {
                    editor.setFontSize(px);
                    consoleOutput.println(`Font size: ${px}px`, 'stdout');
                } else {
                    consoleOutput.error('Usage: font <6-50px>');
                }
                break;
            }

            case 'mode': {
                const t = (rest[0] || '').toLowerCase();
                const currentTheme = editor.getTheme();
                
                // disable transitions
                document.documentElement.classList.add('mode-switching');
                
                if (t === 'light') {
                    document.documentElement.classList.add('light');
                    moonIcon.hidden = false;
                    sunIcon.hidden = true;
                    
                    // if current theme is already light, keep it
                    if (lightThemes.includes(currentTheme)) {
                        consoleOutput.println(`Mode: light`, 'stdout');
                    } else {
                        editor.setTheme('ace/theme/github');
                        consoleOutput.println('Mode: light', 'stdout');
                    }
                } else if (t === 'dark') {
                    document.documentElement.classList.remove('light');
                    moonIcon.hidden = true;
                    sunIcon.hidden = false;
                    
                    // if current theme is already dark, keep it
                    if (darkThemes.includes(currentTheme)) {
                        consoleOutput.println(`Mode: dark`, 'stdout');
                    } else {
                        editor.setTheme('ace/theme/monokai');
                        consoleOutput.println('Mode: dark', 'stdout');
                    }
                } else {
                    document.documentElement.classList.remove('mode-switching');
                    return consoleOutput.error('Usage: mode <light|dark>');
                }
                
                // enable transitions
                setTimeout(() => {
                    document.documentElement.classList.remove('mode-switching');
                }, 50);
                break;
            }

            case 'theme': {
                const themeSelect = document.getElementById('editorThemeSelect');
                if (!themeSelect) return consoleOutput.error('Theme dropdown not found');
                
                const t = rest.join(' ').toLowerCase().replace(/[_-]/g, ' ');
                if (!t) return consoleOutput.error('Usage: theme <theme_name>');
                
                // find theme in dropdown options
                const options = Array.from(themeSelect.options);
                let foundOption = null;
                
                for (const option of options) {
                    const optionText = option.textContent.toLowerCase().replace(/[_-]/g, ' ');
                    if (optionText === t) {
                        foundOption = option;
                        break;
                    }
                }
                
                if (!foundOption) {
                    return consoleOutput.error(`Invalid theme: ${t}`);
                }
                
                // set theme
                themeSelect.value = foundOption.value;
                editor.setTheme(foundOption.value);
                consoleOutput.println(`Theme: ${foundOption.textContent}`, 'stdout');
                break;
            }

            default:
                consoleOutput.error(`Unknown command: ${cmd}`);
        }
    }

    // init
    updateButtonStates();
    ensureInputLine();
    consoleBody.focus();

    // ------------------------ Splitter ------------------------
    (function () {
        const workspace   = document.getElementById('workspace');
        const editorPane  = document.getElementById('editor-pane');
        const consolePane = document.getElementById('console-pane');
        const splitter    = document.getElementById('splitter');
    
        // --- Splitter constants ---
        const SPLITTER_H    = parseFloat(getComputedStyle(splitter).height) || 8;
        const MIN_CONSOLE_H = 120;
        const MAX_SPLITTER_FROM_BOTTOM = 175; // min distance from bottom (i.e., min console height)
        const MAX_SPLITTER_FROM_TOP    = 50;  // min distance from top of topbar to splitter center
    
        const app       = document.querySelector('.app');
        const topBar    = document.querySelector('.topbar');
        const bottomBar = document.querySelector('.bottombar');
    
        // measure once (refresh on resize)
        let TOPBAR_BASE   = topBar    ? topBar.getBoundingClientRect().height    : 0;
        let BOTTOM_BASE   = bottomBar ? bottomBar.getBoundingClientRect().height : 0;
        let BOTTOM_PAD_Y  = bottomBar ? (parseFloat(getComputedStyle(bottomBar).paddingTop) +
                                        parseFloat(getComputedStyle(bottomBar).paddingBottom)) : 0;
    
        function availableStackHeight() {
            const wsRect = workspace.getBoundingClientRect();
            return wsRect.height;
        }
    
        // --- Max editor height w.r.t. viewport/footer/topbar/utilitybar ---
        function getMaxEditorHeight() {
            const topbar     = document.querySelector('.topbar');
            const utilitybar = document.querySelector('.utilitybar');
            const footer     = document.querySelector('.footer');
            const pad        = parseFloat(getComputedStyle(document.querySelector('.app')).padding) * 2 || 28;
        
            const tbH = topbar     ? topbar.getBoundingClientRect().height     : 0;
            const ubH = utilitybar ? utilitybar.getBoundingClientRect().height : 0;
            const ftH = footer     ? footer.getBoundingClientRect().height     : 0;
        
            return window.innerHeight - tbH - ubH - ftH - pad;
        }
    
        function applySplit(editorPx) {
            const avail = availableStackHeight(); // editor + splitter + console height
        
            // ---- Bottom guard (keep console ≥ requiredConsoleMin) ----
            const requiredConsoleMin = Math.max(MIN_CONSOLE_H, MAX_SPLITTER_FROM_BOTTOM);
            const editorMaxByBottom  = avail - SPLITTER_H - requiredConsoleMin;
            const editorMaxViewport  = getMaxEditorHeight();
            const maxEditor          = Math.min(editorMaxByBottom, editorMaxViewport);
        
            // ---- Top guard (keep splitter center ≥ MAX_SPLITTER_FROM_TOP below topbar top) ----
            const wsTop           = workspace.getBoundingClientRect().top;
            const topbarTop       = topBar ? topBar.getBoundingClientRect().top : 0;
            const splitterCenterY = wsTop + editorPx + (SPLITTER_H / 2);
            const distFromTopbarTop = splitterCenterY - topbarTop;
        
            // If too close to the top, clamp to the highest legal editor height
            let finalEditorPx = editorPx;
            if (distFromTopbarTop < MAX_SPLITTER_FROM_TOP) {
                // place the splitter center exactly MAX_SPLITTER_FROM_TOP below topbar top
                finalEditorPx = (topbarTop + MAX_SPLITTER_FROM_TOP) - wsTop - (SPLITTER_H / 2);
            }
        
            // ---- Clamp to [0 .. maxEditor] for the actual pane heights ----
            const clampedEditor = Math.max(0, Math.min(finalEditorPx, maxEditor));
        
            // ---- Smooth bottom-bar squeeze for "overdrag" above workspace top ----
            const over = Math.max(0, -finalEditorPx); // only when dragging past the top
            const consumeBottom = Math.min(over, BOTTOM_BASE);
            const newBottomH = BOTTOM_BASE - consumeBottom;
        
            // Top bar remains at its base height (no shrinking)
            const newTopH = TOPBAR_BASE;
        
            // Apply bars
            app.style.gridTemplateRows = `auto ${Math.max(0, newTopH)}px 1fr`;
        
            bottomBar.style.height = `${Math.max(0, newBottomH)}px`;
            const padScale = BOTTOM_BASE > 0 ? Math.max(0, newBottomH) / BOTTOM_BASE : 0;
            const newPad = (BOTTOM_PAD_Y * padScale) / 2; // split across top & bottom
            bottomBar.style.paddingTop = bottomBar.style.paddingBottom = `${newPad}px`;
        
            // Finally, size editor + console (bottom stays anchored)
            const consoleH = avail - SPLITTER_H - clampedEditor;
            editorPane.style.flex = '0 0 auto';
            consolePane.style.flex = '0 0 auto';
            editorPane.style.height  = clampedEditor + 'px';
            consolePane.style.height = consoleH + 'px';
        
            if (window.editor) window.editor.resize(true);
            fitTerm();
        }
    
        // initial split
        function layoutInitial() {
            const avail = availableStackHeight();
            const targetE = Math.round(Math.min(getMaxEditorHeight(), 0.5 * (avail - SPLITTER_H)));
            applySplit(targetE);
            fitTerm();
        }
    
        let dragging = false;
        let startY = 0;
        let startEditorH = 0;
    
        function beginDrag(e) {
            dragging = true;
            startY = e.clientY;
            startEditorH = editorPane.getBoundingClientRect().height;
            document.body.classList.add('dragging');
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
            document.body.classList.remove('dragging');
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
        }
    
        splitter.addEventListener('mousedown', beginDrag);
    
        // keep proportions on resize
        window.addEventListener('resize', () => {
            // refresh baselines
            TOPBAR_BASE  = topBar    ? topBar.getBoundingClientRect().height    : 0;
            BOTTOM_BASE  = bottomBar ? bottomBar.getBoundingClientRect().height : 0;
            BOTTOM_PAD_Y = bottomBar ? (parseFloat(getComputedStyle(bottomBar).paddingTop) +
                                        parseFloat(getComputedStyle(bottomBar).paddingBottom)) : 0;
        
            const eH = editorPane.getBoundingClientRect().height;
            const cH = consolePane.getBoundingClientRect().height;
            const total = eH + SPLITTER_H + cH || 1;
            const ratio = eH / total;
            const avail = availableStackHeight();
            const maxEditor = getMaxEditorHeight();
            applySplit(Math.round(Math.min(ratio * (avail - SPLITTER_H), maxEditor)));
            fitTerm();
        });
    
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
            // animate to copied state
            copyBtn.style.transition = 'background 0.3s, color 0.3s';
            copyBtn.style.background = 'var(--green-accent)';
            copyBtn.style.color = 'white';

            // animate back to original state
            setTimeout(() => {
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 750);
        })
    });

    // download console output
    downloadBtn.addEventListener('click', async () => {
        const output = consoleBody.textContent;
        
        if (!output.trim()) {
            consoleOutput.error('No output to download');
            return;
        }

        // Create filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `console_output_${timestamp}.txt`;
        
        await saveTextAsFile(filename, output);
    });

    // load formatter and setup resize
    document.addEventListener('DOMContentLoaded', () => {
        if (window.pseudoFormatter) {
            window.pseudoFormatter.wireFormatterButton();
        }
    });
})();
