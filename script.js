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
    const fontCtrl = initFontControls({
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
    editorApis.setFontSize = (n) => fontCtrl.setFontSize(n);

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
    
    let spacingCtrl;
    if (tabSpacesSlider && tabSpacesValue && tabSpacesInfo) {
        // store original setTab before overriding
        const originalSetTab = editorApis.setTab;
        
        spacingCtrl = initSpacingControls({
            editor,
            editorApis: { ...editorApis, setTab: originalSetTab },
            slider: tabSpacesSlider,
            valueEl: tabSpacesValue,
            infoEl: tabSpacesInfo,
            tickSelector: '#tabSpacesSlider + .slider-ticks.tab-ticks .tick',
        });

        // override editorApis.setTab to use spacing controls
        editorApis.setTab = (n) => spacingCtrl.setTabSpaces(n);
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
    // Terminal module import
    const { initTerminal } = await import('./src/terminal/terminal.js');
    
    // Initialize terminal with module
    const { terminal, writePrompt, refit } = initTerminal({
        container: document.getElementById('terminal'),
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block',
    });
    
    // console output
    const { createConsoleOutput } = await import('./src/terminal/consoleOutput.js');
    const consoleOutput = createConsoleOutput(terminal);
    
    // REPL import
    const { createRepl } = await import('./src/terminal/repl.js');
    
    // theme controls
    const themeCtrl = initThemeControls({
        editor,
        editorApis,
        terminal,
        modeToggleBtn: document.getElementById('modeToggleBtn'),
        moonIcon: document.querySelector('#modeToggleBtn .moon-icon'),
        sunIcon: document.querySelector('#modeToggleBtn .sun-icon'),
        editorThemeSelect: document.getElementById('editorThemeSelect'),
    });
    
    // initial prompt
    writePrompt();

    // init repl
    let repl;

    // Create run controller first; pass a callback that flips REPL into input mode.
    const runBtn = document.getElementById('runBtn');
    const runCtrl = createRunController({
        consoleOutput,
        writePrompt,
        getCode,
        workerPath: new URL('./src/runtime/runner.js', window.location.href).toString(),
        onInputRequested: () => repl?.setAwaitingInput(true),
        onStateChange: (running) => {
            if (!runBtn) return;
            runBtn.textContent = running ? 'Stop' : 'Run';
            runBtn.classList.toggle('run', !running);
            runBtn.classList.toggle('stop', running);
        }
    });
    
    // Now create the REPL (it needs runCtrl to dispatch commands)
    repl = createRepl({
        terminal,
        consoleOutput,
        writePrompt,
        runCtrl,
        editorApis,
        themeCtrl
    });

    // run/stop button
    document.querySelector('.btn.run')?.addEventListener('click', () => {
        if (runCtrl.isRunning()) repl.execCommand('stop');
        else repl.execCommand('run');
    });

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
            if (typeof refit === 'function') refit();
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
