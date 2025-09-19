(async function () {
    // import modules
    const { initEditor } = await import('./src/editor/editor.js');
    const { initFontControls } = await import('./src/editor/font.js');
    const { initSpacingControls } = await import('./src/editor/tab.js');
    const { initThemeControls } = await import('./src/editor/themeCtrl.js');
    const { initFormatter } = await import('./src/format/format.js');
    const { createRunController } = await import('./src/runtime/runController.js');
    const { createConsoleOutput } = await import('./src/terminal/consoleOutput.js');
    const { createRepl } = await import('./src/terminal/repl.js');
    const { initEditorDownloads, initConsoleDownloads } = await import('./src/ui/downloads.js');
    const { initMode } = await import('./src/ui/modeCtrl.js');
    const { initSettings } = await import('./src/ui/settings.js');
    const { initSplitter } = await import('./src/ui/splitter.js');

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
    const downloadEditorBtn = document.getElementById('downloadEditorBtn');

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
    const consoleOutput = createConsoleOutput(terminal);
    
    // theme controls
    const themeCtrl = initThemeControls({
        editor,
        editorApis,
        terminal,
        modeBtn: null,
        moonIcon: null,
        sunIcon: null,
        editorThemeSelect: document.getElementById('editorThemeSelect'),
    });
    
    // Mode controls
    const modeCtrl = initMode({
        themeCtrl: themeCtrl,
        button: document.getElementById('modeBtn'),
        moonIcon: document.querySelector('#modeBtn .moon-icon'),
        sunIcon: document.querySelector('#modeBtn .sun-icon'),
        defaultMode: 'dark'
    });
    
    // Settings panel
    const settings = initSettings({
        panelEl: document.getElementById('settingsOverlay'),
        openBtn: document.getElementById('settingsBtn'),
        closeBtn: document.getElementById('closeSettings'),
        overlayEl: document.getElementById('settingsOverlay'),
        fontCtrl,
        spacingCtrl,
        themeCtrl,
        editorApis,
        selectors: {
            fontSize: '#fontSizeSlider',
            fontFamily: '#fontFamilySelect',
            tabSpaces: '#tabSpacesSlider',
            softWrap: '#softWrap',
            readOnly: '#readOnly',
            theme: '#editorThemeSelect',
            mode: '#modeSelect'
        }
    });
    
    // splitter
    const splitter = initSplitter({
        container: document.getElementById('workspace'),
        handle: document.getElementById('splitter'),
        paneA: document.getElementById('editor-pane'),
        paneB: document.getElementById('console-pane'),
        axis: 'vertical',
        minA: 0,
        minB: 50,
        normal_top: 45,
        normal_bottom: 45,
        initialRatio: 0.5,
        storageKey: 'editor-console',
        onResize: () => {
            try { editor.resize(); } catch {}
            try { refit(); } catch {}
        }
    });

    // Expand buttons
    document.getElementById('expandConsoleBtn')?.addEventListener('click', () => {
        try { splitter.collapseB(); } catch {}
    });
    document.getElementById('expandEditorBtn')?.addEventListener('click', () => {
        try { splitter.collapseA(); } catch {}
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
        themeCtrl,
        modeCtrl
    });

    // run/stop button
    document.querySelector('.btn.run')?.addEventListener('click', () => {
        if (runCtrl.isRunning()) repl.execCommand('stop');
        else repl.execCommand('run');
    });

    // Editor download
    const editorDownload = initEditorDownloads({
        getCode,
        button: document.getElementById('downloadEditorBtn'),
        filenamePrefix: 'code'
    });

    // Console Copy/Download
    const consoleDownloads = initConsoleDownloads({
        terminal,
        copyBtn: document.querySelector('.btn.copy'),
        downloadBtn: document.querySelector('.btn.download'),
        consoleOutput
    });

    // init
    clearBtn.disabled = false;


    // clear
    clearBtn.addEventListener('click', () => {
        consoleOutput.clear();
    });

})();
