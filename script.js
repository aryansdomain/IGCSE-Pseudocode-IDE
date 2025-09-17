(async function () {
    // import modules
    const { initEditor } = await import('./src/editor/editor.js');
    const { initFontControls } = await import('./src/editor/font.js');
    const { initSpacingControls } = await import('./src/editor/tab.js');
    const { initThemeControls } = await import('./src/editor/theme.js');
    const { initFormatter } = await import('./src/format/format.js');
    const { createRunController } = await import('./src/runtime/runController.js');

    // ace editor
    const { editor, getCode, setCode, editorApis } = initEditor({
        container: document.getElementById('code'),
        defaultCode: 

`// Type your code here!

FUNCTION greet(name : STRING) RETURNS STRING
    RETURN "Hello, ", name, "!"
ENDFUNCTION

OUTPUT greet("World")`,

        tabSize: 4,
        theme: 'monokai',
        softWrap: false,
        readOnly: false,
    });
    window.editor = editor;

    // font controls
    const fontCtl = initFontControls({
        editor,
        sizeInput: document.getElementById('fontSizeSlider'),
        familySelect: document.getElementById('fontFamilySelect'),
        incBtn: document.querySelector('[data-font="inc"]'),
        decBtn: document.querySelector('[data-font="dec"]'),
        min: 6,
        max: 38,
        step: 1,
        defaultSize: 14
    });

    // set font size
    editorApis.setFontSize = (n) => fontCtl.setFontSize(n);

    // formatter
    const formatBtn = document.getElementById('btn-format');
    const fmt = initFormatter({
        editor,
        getCode,
        setCode,
        formatBtn
    });

    // spacing controls
    const tabSpacesSlider = document.getElementById('tabSpacesSlider');
    const tabSpacesValue = document.getElementById('tabSpacesValue');
    const tabSpacesInfo = document.querySelector('.tab-spaces-info');
    
    let spacingCtl;
    if (tabSpacesSlider && tabSpacesValue && tabSpacesInfo) {
        // store original setTab before overriding
        const originalSetTab = editorApis.setTab;
        
        spacingCtl = initSpacingControls({
            editor,
            editorApis: { ...editorApis, setTab: originalSetTab },
            slider: tabSpacesSlider,
            valueEl: tabSpacesValue,
            infoEl: tabSpacesInfo,
            tickSelector: '#tabSpacesSlider + .slider-ticks.tab-ticks .tick',
        });

        // override editorApis.setTab to use spacing controls
        editorApis.setTab = (n) => spacingCtl.setTabSpaces(n);
    }

    // Configure language tools and autocompletion
    const langTools = ace.require('ace/ext/language_tools');
    
    const completers = [];
    try {
        const LangModule = ace.require('ace/mode/lang');
        if (LangModule && LangModule.langCompleter) {
            completers.push(LangModule.langCompleter);
        }
    } catch {}
    
    editor.setOptions({
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

    editor.focus();

    const consoleOutput = {
        print:      (t, color = null) => terminalWrite(t,          color),
        println:    (t, color = null) => terminalWrite(t + '\r\n', color),
        lnprint:    (t, color = null) => terminalWrite('\r\n' + t, color),
        lnprintln:  (t, color = null) => terminalWrite('\r\n' + t + '\r\n', color), // newline before and after
        
        err:        (t) => terminalWrite(t,          '31'), // red
        errln:      (t) => terminalWrite(t + '\r\n', '31'), // newline after
        lnerr:      (t) => terminalWrite('\r\n' + t, '31'), // newline before
        lnerrln:    (t) => terminalWrite('\r\n' + t + '\r\n', '31'), // newline before and after

        warn:       (t) => terminalWrite(`\x1b[3m\x1b[33m${t}\x1b[0m`), // italics and yellow
        warnln:     (t) => terminalWrite(`\x1b[3m\x1b[33m${t}\x1b[0m\r\n`), // newline after
        lnwarn:     (t) => terminalWrite(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m`), // newline before
        lnwarnln:   (t) => terminalWrite(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m\r\n`), // newline before and after

        clear:      () => terminal.clear(),
        clearline:  () => terminalWrite('\x1b[2K\r'),

        newline:    () => terminalWrite('\r\n'),

        hideCursor: () => terminalWrite('\x1b[?25l'),
        showCursor: () => terminalWrite('\x1b[?25h')
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
        const code = getCode();
        
        if (!code.trim()) return; // empty files

        // create filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `code_${timestamp}.txt`;
        
        await saveTextAsFile(filename, code);
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
    
    // theme controls
    const themeCtl = initThemeControls({
        editor,
        editorApis,
        terminal,
        modeToggleBtn: document.getElementById('modeToggleBtn'),
        moonIcon: document.querySelector('#modeToggleBtn .moon-icon'),
        sunIcon: document.querySelector('#modeToggleBtn .sun-icon'),
        editorThemeSelect: document.getElementById('editorThemeSelect'),
    });
    
    writePrompt();

    let fitAddon = null;
    try {
        const FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || FitAddon;
        fitAddon = new FitCtor();
        terminal.loadAddon(fitAddon);

        // initial fit after the terminal attaches
        setTimeout(() => fitAddon.fit(), 0);
    } catch {}

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

            // handle program input
            if (data === '\r') { // enter

                runCtl.sendUserInput(currentCommand);
                currentCommand = '';
                cursorPosition = 0;
                awaitingProgramInput = false;
                return;

            } else if (data === '\u007f') { // backspace
                if (cursorPosition > 0) {
                    currentCommand = currentCommand.slice(0, cursorPosition - 1) + currentCommand.slice(cursorPosition);
                    cursorPosition--;

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

                execCommand(currentCommand);
                currentCommand = '';
                cursorPosition = 0;
                if (!deferPrompt) writePrompt();

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

                    consoleOutput.hideCursor();
                    consoleOutput.clearline();
                    writePrompt();
                    consoleOutput.print(currentCommand);
                    consoleOutput.showCursor();

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

                    consoleOutput.hideCursor();
                    consoleOutput.clearline();
                    writePrompt();                        
                    consoleOutput.print(currentCommand);
                    consoleOutput.showCursor();

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

    // run controller
    const runBtn = document.getElementById('runBtn');
    const runCtl = createRunController({
        consoleOutput,
        writePrompt,
        getCode,
        workerPath: 'runner.js',
        onInputRequested: () => { awaitingProgramInput = true; },
        onStateChange: (running) => {
            if (!runBtn) return;
            runBtn.textContent = running ? 'Stop' : 'Run';
            runBtn.classList.toggle('run', !running);
            runBtn.classList.toggle('stop', running);
        }
    });

    // run/stop button
    document.querySelector('.btn.run')?.addEventListener('click', () => {
        if (runCtl.isRunning()) runCtl.stop();
        else execCommand('run');
    });

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
        const validCommands = ['help', 'run', 'clear', 'tab', 'font', 'mode', 'theme', 'stop', 'format'];
        const isValidCommand = validCommands.includes(cmdLower);

        // command is green, arguments are white
        if (isValidCommand && cmdLower !== 'clear' && !runCtl.isRunning()) {
            consoleOutput.hideCursor();

            consoleOutput.clearline();
            writePrompt();
            consoleOutput.print(`\x1b[32m${cmd}`) // set color to green and print command
            consoleOutput.print(`\x1b[0m${arg ? ` ${arg}` : ''}`); // reset color to white and print arguments
            consoleOutput.showCursor();
        }

        consoleOutput.newline();

        switch (cmdLower) {
            case 'help': {
                const output =
                    'run                  Execute the code currently in the editor. If the program needs input, type and press Enter.\r\n' +
                    'stop                 Stop the running program\r\n' +
                    'clear                Clear console\r\n' +
                    'format               Format the editor code\r\n' +
                    'tab <n>              Set editor tab size (1-8 spaces)\r\n' +
                    'font <px>            Set editor font size (6-38 px)\r\n' +
                    'mode <light|dark>    Switch overall UI between light and dark modes.\r\n' +
                    'theme <theme>        Change the editor color theme. For a full list of themes, open Settings.\r\n\r\n'

                consoleOutput.println('\x1b[1mCommands:\x1b[0m');
                consoleOutput.println(output);
                break;
            }

            case 'run': {
                deferPrompt = true; // dont output prompt until run completes
                runCtl.run();
                break;
            }

            case 'stop': {
                if (!runCtl.isRunning()) {
                    consoleOutput.errln('No running execution to stop');
                    return;
                }
                
                window.__ide_stop_flag = true;        
                runCtl.stop();
                break;
            }

            case 'clear': {
                consoleOutput.clear();
                break;
            }

            case 'tab': {
                const n = parseInt(rest[0], 10);
                if (Number.isInteger(n) && n >= 0 && n <= 8) {
                    spacingCtl.setTabSpaces(n);
                    consoleOutput.println(`Tab size: ${n}`);
                    if (n === 0) {
                        consoleOutput.warnln(
                            'Warning: using the "tab" command again will not reverse this change.\r\n' +
                            'Press Cmd/Ctrl+Z on the editor to restore.');
                    }
                } else {
                    consoleOutput.errln('Usage: tab <0-8 spaces>');
                }
                break;
            }

            case 'font': {
                const px = parseInt(rest[0], 10);
                if (Number.isInteger(px) && px >= 6 && px <= 38) {
                    if (typeof fontCtl !== 'undefined') {
                        fontCtl.setFontSize(px);
                        consoleOutput.println(`Font size: ${px}px`);
                    } else {
                        consoleOutput.errln('Font controls not initialized');
                    }
                } else {
                    consoleOutput.errln('Usage: font <6-38px>');
                }
                break;
            }

            case 'mode': {
                const t = (rest[0] || '').toLowerCase();
                if (t === 'light' || t === 'dark') {

                    themeCtl.setMode(t);
                    consoleOutput.println(`Mode: ${t}`);

                } else {

                    consoleOutput.errln('Usage: mode <light|dark>');
                    console.log("command: ", cmdLower);
                    console.log("isValidCommand: ", isValidCommand);
                    if (isValidCommand) consoleOutput.errln(`Did you mean "theme ${t}"?`);
                }
                break;
            }

            case 'theme': {
                const themeSelect = document.getElementById('editorThemeSelect');
                if (!themeSelect) {
                    consoleOutput.errln('Theme dropdown not found');
                    return;
                }
                
                const t = rest.join(' ').toLowerCase().replace(/[_-]/g, ' ');

                if (!t) {
                    consoleOutput.errln('Usage: theme <theme_name>');
                    return;
                }
                
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
                    consoleOutput.errln(`Invalid theme: ${rest}.`);
                    if (t === 'light' || t === 'dark') {
                        consoleOutput.errln(`Did you mean "mode ${t}"?`);
                    }
                    return;
                }
                
                // set theme
                themeSelect.value = foundOption.value;
                const themeName = foundOption.value.replace('ace/theme/', '');
                themeCtl.setEditorTheme(themeName);
                consoleOutput.println(`Theme: ${foundOption.textContent}`);
                break;
            }

            case 'format':
                fmt.formatNow();
                consoleOutput.println('Formatted.');
                break;

            default:
                consoleOutput.errln(`Unknown command: ${cmd}`);
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
        const MIN_CONSOLE_H = 200
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

    // ------------------------ Console Sidebar Buttons ------------------------

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
            consoleOutput.errln('Failed to copy to clipboard. ' + err);
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
})();
