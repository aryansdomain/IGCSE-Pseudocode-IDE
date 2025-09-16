(function () {
    const editor = ace.edit('code', {
        mode: 'ace/mode/lang',
        theme: 'ace/theme/monokai',
        showPrintMargin: false,
        fontSize: '14px',
        fontFamily: 'monospace',
    });
    window.editor = editor;

    const langTools = ace.require('ace/ext/language_tools');
    
    const completers = [];
    try {
        const LangModule = ace.require('ace/mode/lang');
        if (LangModule && LangModule.langCompleter) {
            completers.push(LangModule.langCompleter);
        }
    } catch {}
    
    editor.setOptions({
        useSoftTabs: true,
        tabSize: 4,
        enableBasicAutocompletion: completers,
        enableLiveAutocompletion:  completers,
        enableSnippets: false,
        highlightActiveLine: false,
        fixedWidthGutter: true,
    });
    
    langTools.setCompleters(completers);
    editor.completers = completers.slice();
    
    // if mode changes, re-apply completers
    editor.on('changeMode', () => {editor.completers = completers.slice();} );

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

    const consoleOutput = {
        print:   (t, color = null) => terminalWrite(t,          color),
        println: (t, color = null) => terminalWrite(t + '\r\n', color),
        lnprint: (t, color = null) => terminalWrite('\r\n' + t, color),
        error:   (t) => terminalWrite(t,          '31'), // red
        errorln: (t) => terminalWrite(t + '\r\n', '31'), // newline after
        lnerror: (t) => terminalWrite('\r\n' + t, '31'), // newline before
        warning:   (t) => terminalWrite(`\x1b[3m\x1b[33m${t}\x1b[0m`), // italics and yellow
        warningln: (t) => terminalWrite(`\x1b[3m\x1b[33m${t}\x1b[0m\r\n`), // newline after
        lnwarn: (t) => terminalWrite(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m`), // newline before
        clear:   () => terminal.clear(),
        clearline: () => terminalWrite('\x1b[2K\r')
    };

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
        
        if (!code.trim()) return; // empty files

        // create filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `code_${timestamp}.txt`;
        
        await saveTextAsFile(filename, code);
    });

    // ------------------------ Light/Dark Mode Toggle ------------------------
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const moonIcon = modeToggleBtn.querySelector('.moon-icon');
    const sunIcon = modeToggleBtn.querySelector('.sun-icon');

    // light and dark themes
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

    function updateTerminalMode() {
        const isLight = document.documentElement.classList.contains('light');
        const terminalTheme = isLight ? {
            // LIGHT MODE
            background: '#ffffff',
            foreground: '#000000',
            cursor: '#000000',
            selection: '#00000030',
            black: '#000000',
            red: '#d73a49',
            green: '#179645', // --green-accent
            yellow: '#ce8600', // --warning (light mode)
            blue: '#0000ff',
            magenta: '#ff00ff',
            cyan: '#00ffff',
            white: '#ffffff',
            brightBlack: '#8b949e', // --muted
            brightRed: '#ff7b72',
            brightGreen: '#179645', // --green-accent
            brightYellow: '#ce8600', // --warning (light mode)
            brightBlue: '#0000ff',
            brightMagenta: '#ff00ff',
            brightCyan: '#00ffff',
            brightWhite: '#ffffff'
        } : {
            // DARK MODE
            background: '#000000', // pitch black
            foreground: '#e6edf3', // --text
            cursor: '#e6edf3', // --text
            selection: '#2b313b30', // --border with transparency
            black: '#000000',
            red: '#ff7b72', // --red
            green: '#22c55e', // --green-accent
            yellow: '#ffd700', // --warning (dark mode)
            blue: '#0000ff',
            magenta: '#ff00ff',
            cyan: '#00ffff',
            white: '#e6edf3', // --text
            brightBlack: '#8b949e', // --muted
            brightRed: '#ff7b72', // --red
            brightGreen: '#22c55e', // --green-accent
            brightYellow: '#ffd700', // --warning (dark mode)
            brightBlue: '#0000ff',
            brightMagenta: '#ff00ff',
            brightCyan: '#00ffff',
            brightWhite: '#e6edf3' // --text
        };
        
        terminal.options.theme = terminalTheme;
    }

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
        
        // update terminal mode
        updateTerminalMode();
        
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
        const gutter = document.createElement('div');

        host.className = `ace_editor ${cssClass}`;
        host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;';

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
    let outputStorage = [];
    let hadFlushOutput = false;
    let __flushedPrefix = '';

    let runId = 0;           // incremental id to disambiguate overlapping timers
    let isRunning = false;
    let flipTimer = null;    // delayed flip timer
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
        let indicatorShown = false;
        let warningStorage = [];
        console.log(`DEBUG: Initialized warning buffer for run ${localRunId}`);
        let runningTimer = null;
        let dotTimer = null;
        let dotPhase = 0;

        // Set up animated dot ticker
        runningTimer = setTimeout(() => {
            if (isRunning && localRunId === runId && !hadFlushOutput) {
                indicatorShown = true;

                // output pending warnings
                console.log(`DEBUG: Outputting ${warningStorage.length} warnings before dots`);
                warningStorage.forEach(msg => {
                    console.log(`DEBUG: Outputting warning: "${msg}"`);
                    consoleOutput.warningln(msg);
                });
                warningStorage = [];

                dotTimer = setInterval(() => {
                    dotPhase = (dotPhase + 1) % 4; // cycle
                    consoleOutput.clearline()
                    consoleOutput.print('\x1b[32m' + '.'.repeat(dotPhase))
                    consoleOutput.print('\x1b[0m'); // reset color
                }, 300);
            }
        }, 75);

        const clearRunningIndicators = () => {
            if (runningTimer) { 
                clearTimeout(runningTimer);
                runningTimer = null;
            }
            if (dotTimer) {
                clearInterval(dotTimer); 
                dotTimer = null;
            }

            // clear dots
            if (indicatorShown) {
                consoleOutput.clearline();
                indicatorShown = false;
            }
        };

        // Capture indicators for force-terminate cleanup
        clearIndicators = clearRunningIndicators;
        currentLocalRunId = localRunId;

        worker.onmessage = (e) => {
            const { type } = e.data || {};

            if (type === 'done') {

                const hadInd = indicatorShown;
                clearRunningIndicators();
                
                try {

                    if (!hadInd && warningStorage.length) {
                        console.log(`DEBUG: Outputting ${warningStorage.length} warnings in completion handler`);
                        warningStorage.forEach(msg => {
                            console.log(`DEBUG: Outputting warning in completion: "${msg}"`);
                            consoleOutput.warningln(msg);
                        });
                        warningStorage = [];
                    }

                    // output warnings immediately before program output
                    if (warningStorage.length > 0) {
                        console.log(`DEBUG: Outputting ${warningStorage.length} warnings before program output`);
                        warningStorage.forEach(msg => {
                            console.log(`DEBUG: Outputting warning before output: "${msg}"`);
                            consoleOutput.warningln(msg);
                        });
                        warningStorage = [];
                    }

                    // output the output storage
                    if (outputStorage.length > 0) {
                        const combinedOutput = outputStorage.join('');
                        const parts = combinedOutput.split('\n');
                        parts.slice(1).forEach(line => consoleOutput.lnprint(line));
                        outputStorage = [];
                    }

                } finally {
                    finishRun(localRunId);

                    // reset flags
                    indicatorShown = false;
                    outputStorage = [];
                    warningStorage = [];
                }
            } else if (type === 'stopped') {
                clearRunningIndicators();
                consoleOutput.lnerror('Execution stopped');
                
                finishRun(localRunId);
            } else if (type === 'input_request') {
                clearRunningIndicators();
                
                // output warnings before showing output for input
                if (warningStorage.length > 0) {
                    console.log(`DEBUG: Outputting ${warningStorage.length} warnings before input request output`);
                    warningStorage.forEach(msg => {
                        console.log(`DEBUG: Outputting warning before input: "${msg}"`);
                        consoleOutput.warningln(msg);
                    });
                    warningStorage = [];
                }
                
                // show output before asking for input
                if (outputStorage.length > 0) {
                    const combinedOutput = outputStorage.join('');
                    const parts = combinedOutput.split('\n');

                    parts.slice(1).forEach(line => consoleOutput.lnprint(line));
                    outputStorage = [];
                }

                awaitingProgramInput = true;

            } else if (type === 'flush') {
                const s = String(e.data.output || '');
                const newPart = s.startsWith(__flushedPrefix) ? s.slice(__flushedPrefix.length) : s;
                __flushedPrefix += newPart;
                if (newPart.length) hadFlushOutput = true;

                outputStorage.push(newPart);

            } else if (type === 'warning') {
                const msg = (e.data && (e.data.message ?? e.data.text)) || '';
                if (!msg) return;

                console.log(`DEBUG: Adding warning to buffer: "${msg}"`);
                console.log(`DEBUG: Warning buffer now has ${warningStorage.length + 1} items`);
                warningStorage.push(msg);

            } else if (type === 'error') {
                const msg = String(e.data.error || 'Unknown error');
                
                // stop code immediately when error is encountered
                clearRunningIndicators();
                consoleOutput.lnerror(msg);
                
                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            
            clearRunningIndicators();

            consoleOutput.clearline();
            consoleOutput.lnerror(`Worker error: ${e.message || e.filename || 'unknown'}`);
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

        // show next prompt
        deferPrompt = false;
        //consoleOutput.lnprint('run finish');
        consoleOutput.lnprint('');
        consoleOutput.println('');
        writePrompt();
    }

    function stopCode() {

        try { worker && worker.postMessage({ type: 'stop' }); } catch {}
      
        setTimeout(() => {
            if (!worker) return; // already stopped
        
            try { worker.terminate(); } catch {}
            worker = null;
        
            // clear spinner
            if (typeof clearIndicators === 'function') clearIndicators();
        
            // show the message and finish the run
            consoleOutput.lnerror('Execution stopped');
            finishRun(currentLocalRunId);
        }, 600);
    }
    
    function runCode() {
        if (isRunning) return; // repeatedrun commands
        
        __flushedPrefix = '';
        outputStorage = [];
        lastStdoutEl = null;
        inputPromptBase = '';
        hadFlushOutput = false;
        const code = editor.getValue();
        const localRunId = ++runId;
        isRunning = true;

        // flip button to red only if still running
        if (flipTimer) clearTimeout(flipTimer);
        flipTimer = setTimeout(() => {
            if (isRunning && localRunId === runId) setRunButton(true);
        }, 30);

        // container for output
        currentRunContainer = document.createElement('div');
        currentRunContainer.className = 'run-chunk';

        // start worker, send job
        worker = new Worker('runner.js');
        attachWorkerHandlers(localRunId);

        worker.postMessage({ type: 'run', code });
    }

    // run/stop button
    runBtn.addEventListener('click', () => {
        if (runBtn.classList.contains('stop')) stopCode();
        else execCommand('run');
    });    

    // ------------------------ Console/Terminal --------------------------------
    const clearBtn = document.querySelector('.btn.clear');
    const copyBtn = document.querySelector('.btn.copy');
    const downloadBtn = document.querySelector('.btn.download');

    // ---------- Terminal wiring ----------
    const terminal = new Terminal({
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block'
    });
    
    terminal.open(document.getElementById('terminal'));
    
    updateTerminalMode();
    writePrompt();

    let fitAddon = null;
    try {
      const FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || FitAddon;
      fitAddon = new FitCtor();
      terminal.loadAddon(fitAddon);

      // initial fit after the terminal attaches
      setTimeout(() => fitAddon.fit(), 0);
    } catch (e) {
        consoleOutput.lnerror('Error: Terminal is not auto-resizing. Please reload the page or report this error.');
    }

    function fitTerm() { if (fitAddon) fitAddon.fit(); }

    // Terminal state
    let currentCommand = '';
    let commandHistory = [];
    let historyIndex = -1;
    let awaitingProgramInput = false;
    let cursorPosition = 0; // Track cursor position within current command
    let deferPrompt = false; // Defer prompt when run is active

    // cursor movement
    function moveCursorLeft() {
        if (cursorPosition > 0) {
            cursorPosition--;
            consoleOutput.print('\x1b[D'); // Move cursor left
        }
    }

    function moveCursorRight() {
        if (cursorPosition < currentCommand.length) {
            cursorPosition++;
            consoleOutput.print('\x1b[C'); // Move cursor right
        }
    }

    // keys pressed in terminal
    terminal.onData(data => {
        if (awaitingProgramInput) {
            // Handle program input
            if (data === '\r') { // enter
                worker.postMessage({ type: 'input_response', value: currentCommand });
                currentCommand = '';
                cursorPosition = 0;
                awaitingProgramInput = false;
            } else if (data === '\u007f') { // backspace
                if (cursorPosition > 0) {
                    currentCommand = currentCommand.slice(0, cursorPosition - 1) + currentCommand.slice(cursorPosition);
                    cursorPosition--;
                    // Always use efficient backspace for end-of-line deletion
                    if (cursorPosition === currentCommand.length) {
                        consoleOutput.print('\b \b');
                    } else {
                        // For middle deletion, move cursor back and delete character
                        consoleOutput.print('\b');
                        consoleOutput.print(currentCommand.slice(cursorPosition) + ' ');
                        consoleOutput.print('\x1b[' + (currentCommand.length - cursorPosition + 1) + 'D');
                    }
                }

            }
            else if (data === '\u001b[D') moveCursorLeft();
            else if (data === '\u001b[C') moveCursorRight();
                
            else if (data.length === 1 && data >= ' ') { // printable characters
                currentCommand += data;
                cursorPosition = currentCommand.length;
                consoleOutput.print(data);
            }
        } else {

            if (data === '\r') { // enter
                //consoleOutput.println('enter key pressed');
                consoleOutput.println('');

                execCommand(currentCommand);
                currentCommand = '';
                cursorPosition = 0;
                if (!deferPrompt) writePrompt(); // defer while a run is active

            } else if (data === '\u007f') { // backspace

                if (cursorPosition > 0) {
                    currentCommand = currentCommand.slice(0, cursorPosition - 1) + currentCommand.slice(cursorPosition);
                    cursorPosition--;
                    if (cursorPosition === currentCommand.length) {
                        consoleOutput.print('\b \b');
                    } else {
                        // middle deletion
                        consoleOutput.print('\x1b[D');
                        consoleOutput.print(currentCommand.slice(cursorPosition) + ' ');
                        consoleOutput.print('\x1b[' + (currentCommand.length - cursorPosition + 1) + 'D');
                    }
                }
            } else if (data === '\u001b[A') { // up arrow
                if (commandHistory.length > 0) {
                    if (historyIndex === -1) {
                        historyIndex = commandHistory.length - 1;
                    } else {
                        historyIndex = Math.max(0, historyIndex - 1);
                    }

                    currentCommand = commandHistory[historyIndex] || '';

                    consoleOutput.print('\x1b[?25l'); // hide cursor
                    consoleOutput.print('\r\x1b[2K');
                    writePrompt();
                    consoleOutput.print(currentCommand);
                    consoleOutput.print('\x1b[?25h'); // show cursor

                    cursorPosition = currentCommand.length;
                }

            } else if (data === '\u001b[B') { // down arrow
                if (commandHistory.length > 0) {
                    if (historyIndex === -1) {
                        currentCommand = '';
                    } else {
                        historyIndex = Math.min(commandHistory.length, historyIndex + 1);
                        currentCommand = historyIndex === commandHistory.length ? '' : commandHistory[historyIndex];
                    }

                    consoleOutput.print('\x1b[?25l'); // hide cursor
                    consoleOutput.print('\r\x1b[2K');
                    writePrompt();                        
                    consoleOutput.print(currentCommand);
                    consoleOutput.print('\x1b[?25h'); // show cursor

                    cursorPosition = currentCommand.length;
                }
                
            } else if (data === '\u001b[D') moveCursorLeft();
              else if (data === '\u001b[C') moveCursorRight();
              else if (data.length === 1 && data >= ' ') { // printable characters
                currentCommand = currentCommand.slice(0, cursorPosition) + data + currentCommand.slice(cursorPosition);
                cursorPosition++;
                
                if (cursorPosition === currentCommand.length) {
                    // insert at end
                    consoleOutput.print(data);
                } else {
                    // insert in middle
                    consoleOutput.print('\x1b[s'); // save cursor position
                    consoleOutput.print(currentCommand.slice(cursorPosition - 1));
                    consoleOutput.print('\x1b[u'); // restore cursor position
                    consoleOutput.print('\x1b[C'); // move cursor right by 1
                }
            }
        }
    });

    // terminal output
    function writePrompt() {
        terminalWrite('% ', '90'); // muted gray color
    }

    function terminalWrite(text, color = null) {
        if (color) {
            terminal.write(`\x1b[${color}m${text}\x1b[0m`);
        } else {
            terminal.write(text);
        }
    }

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

        // command is green, arguments are white
        if (isValidCommand) {
            if (!(cmdLower === 'stop' && isRunning) && cmdLower !== 'clear') {
                // delete the last line
                consoleOutput.print(`\x1b[1A`)
                consoleOutput.clearline();
                consoleOutput.print(`\x1b[90m% \x1b[0m`);

                // output colored command with prompt
                consoleOutput.println(`\x1b[32m${cmd}\x1b[0m${arg ? ` ${arg}` : ''}`); 
            }
        }

        switch (cmdLower) {
            case 'help':
                const output =
                    'run                  Execute the code currently in the editor. If the program needs input, type and press Enter.\r\n' +
                    'stop                 Stop the running program\r\n' +
                    'clear                Clear console\r\n' +
                    'tab <n>              Set editor tab size (1-8 spaces)\r\n' +
                    'font <px>            Set editor font size (6-40 px)\r\n' +
                    'mode <light|dark>    Switch overall UI between light and dark modes.\r\n' +
                    'theme <theme>        Change the editor color theme. For a full list of themes, open Settings.\r\n\r\n'

                consoleOutput.println('\x1b[1mCommands:\x1b[0m');
                consoleOutput.println(output);
            break;

            case 'run':
                deferPrompt = true; // dont output prompt until run completes
                runCode();
            break;

            case 'stop':
                if (!isRunning) {
                    consoleOutput.lnerror('No running execution to stop');
                    return;
                }
                
                window.__ide_stop_flag = true;        
                stopCode();
                break;

            case 'clear':
                consoleOutput.clear();
            break;

            case 'tab': {
                const n = parseInt(rest[0], 10);
                if (Number.isInteger(n) && n >= 0 && n <= 8) {
                    refreshTabSpaces(n);
                    consoleOutput.println(`Tab size: ${n}`);
                    if (n === 0) {
                        consoleOutput.warningln(
                            'Warning: using the "tab" command again will not reverse this change.\r\n' +
                            'Press Cmd/Ctrl+Z to restore.');
                    }
                } else {
                    consoleOutput.errorln('Usage: tab <0-8 spaces>');
                }
                break;
            }

            case 'font': {
                const px = parseInt(rest[0], 10);
                if (Number.isInteger(px) && px >= 6 && px <= 40) {
                    editor.setFontSize(px);
                    consoleOutput.println(`Font size: ${px}px`);
                } else {
                    consoleOutput.errorln('Usage: font <6-40px>');
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
                    if (!lightThemes.includes(currentTheme)) {
                        editor.setTheme('ace/theme/github');
                    }
                    consoleOutput.println('Mode: light');

                } else if (t === 'dark') {
                    document.documentElement.classList.remove('light');
                    moonIcon.hidden = true;
                    sunIcon.hidden = false;
                    
                    // if current theme is already dark, keep it
                    if (!darkThemes.includes(currentTheme)) {
                        editor.setTheme('ace/theme/monokai');
                    }
                    consoleOutput.println('Mode: dark');

                } else {
                    document.documentElement.classList.remove('mode-switching');
                    return consoleOutput.errorln('Usage: mode <light|dark>');
                }
                
                // update terminal mode
                updateTerminalMode();
                
                // enable transitions
                setTimeout(() => {
                    document.documentElement.classList.remove('mode-switching');
                }, 50);
                break;
            }

            case 'theme': {
                const themeSelect = document.getElementById('editorThemeSelect');
                if (!themeSelect) return consoleOutput.lnerror('Theme dropdown not found');
                
                const t = rest.join(' ').toLowerCase().replace(/[_-]/g, ' ');
                if (!t) return consoleOutput.errorln('Usage: theme <theme_name>');
                
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
                    return consoleOutput.errorln(`Invalid theme: ${t}`);
                }
                
                // set theme
                themeSelect.value = foundOption.value;
                editor.setTheme(foundOption.value);
                consoleOutput.println(`Theme: ${foundOption.textContent}`);
                break;
            }

            default:
                consoleOutput.errorln(`Unknown command: ${cmd}`);
        }
    }

    // init
    clearBtn.disabled = false;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;

    // ------------------------ Splitter ------------------------
    (function initSplitter() {
        const workspace   = document.getElementById('workspace');
        const editorPane  = document.getElementById('editor-pane');
        const consolePane = document.getElementById('console-pane');
        const splitter    = document.getElementById('splitter');
    
        if (!workspace || !editorPane || !consolePane || !splitter) return;

        const SPLITTER_H = 8;
        const MIN_EDITOR_H  = 0;
        const MIN_CONSOLE_H = 200;

        // If you already have applySplit(), keep it; otherwise use this one:
        function applySplit(editorH) {
            const totalH   = workspace.clientHeight;
            const maxEdH   = totalH - SPLITTER_H - MIN_CONSOLE_H;
            const clamped  = Math.max(MIN_EDITOR_H, Math.min(editorH, maxEdH));
            const consoleH = totalH - SPLITTER_H - clamped;

            editorPane.style.height  = clamped  + 'px';
            consolePane.style.height = consoleH + 'px';

            // Resize editors/terminal if present
            if (window.editor && typeof window.editor.resize === 'function') {
                window.editor.resize(true);
            }
            if (typeof fitTerm === 'function') fitTerm();
        }

        // Initial layout (keep your existing logic if you have one)
        applySplit(Math.round((workspace.clientHeight - SPLITTER_H) * 0.4));

        let pointerId = null;
        let startY = 0;
        let startEditorH = 0;

        function onPointerDown(e) {
            // Only handle primary button
            if (e.button !== undefined && e.button !== 0) return;

            pointerId = e.pointerId ?? 1;
            try { splitter.setPointerCapture(pointerId); } catch {}

            e.preventDefault();
            document.body.classList.add('dragging');

            startY = e.clientY;
            // Use rendered height as baseline
            startEditorH = editorPane.getBoundingClientRect().height;
        }
    
        function onPointerMove(e) {
            if (pointerId == null) return;
            // delta (positive when dragging down)
            const dy = e.clientY - startY;

            applySplit(startEditorH + dy);
        }
    
        function endDrag() {
            if (pointerId == null) return;
            try { splitter.releasePointerCapture(pointerId); } catch {}
            pointerId = null;
            document.body.classList.remove('dragging');
        }

        splitter.addEventListener('pointerdown', onPointerDown);
        splitter.addEventListener('pointermove', onPointerMove);
        splitter.addEventListener('pointerup', endDrag);
        splitter.addEventListener('pointercancel', endDrag);
        splitter.addEventListener('lostpointercapture', endDrag);

        // Keep proportions on window resize
        window.addEventListener('resize', () => {
            // Recompute based on current ratio
            const edH = editorPane.getBoundingClientRect().height;
            const coH = consolePane.getBoundingClientRect().height;
            const total = edH + SPLITTER_H + coH || 1;
            const ratio = edH / total;
            const newEdH = Math.round((workspace.clientHeight - SPLITTER_H) * ratio);
            applySplit(newEdH);
        });
    })();  

    // clear
    clearBtn.addEventListener('click', () => {
        consoleOutput.clear();
    });

    // copy console output
    copyBtn.addEventListener('click', () => {
        output = '';
        for (let i = 0; i < terminal.buffer.active.length; i++) {
            const line = terminal.buffer.active.getLine(i).translateToString();
            output += line + '\n';
        }
        output = output.trim();

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
        }).catch(err => {
            consoleOutput.errorln('Failed to copy to clipboard. ' + err);
        });
    });

    // download console output
    downloadBtn.addEventListener('click', async () => {
        // Get all terminal content
        let output = '';
        for (let i = 0; i < terminal.buffer.active.length; i++) {
            output += terminal.buffer.active.getLine(i).translateToString() + '\n';
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
