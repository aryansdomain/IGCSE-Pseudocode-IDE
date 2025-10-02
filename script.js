(async function () {
    // import modules
    const { initEditor } = await import('./src/editor/editor.js');
    const { initFontControls } = await import('./src/editor/font.js');
    const { initSpacingControls } = await import('./src/editor/tab.js');
    const { initThemeControls } = await import('./src/ui/themeCtrl.js');
    const { initFormatter } = await import('./src/format/format.js');
    const { createRunCtrl } = await import('./src/runtime/runCtrl.js');
    const { createConsoleOutput } = await import('./src/terminal/consoleOutput.js');
    const { createRepl } = await import('./src/terminal/repl.js');
    const { initEditorDownloads, initConsoleDownloads } = await import('./src/ui/downloads.js');
    const { initMode } = await import('./src/ui/modeCtrl.js');
    const { initSettings } = await import('./src/ui/settings.js');
    const { initSplitter } = await import('./src/ui/splitter.js');
    const { initDom, on } = await import('./src/utils/dom.js');

    const UI = initDom();

    // ace editor
    const { editor, getCode, setCode, editorApis } = initEditor({
        container: UI.codeEl,
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
        sizeInput: UI.fontSizeSlider,
        familySelect: UI.fontFamilySelect,
        min: 6,
        max: 38,
        step: 1,
        defaultSize: 14
    });

    // set font size
    editorApis.setFontSize = (n) => fontCtrl.setFontSize(n);

    // nudge editor after fonts finish loading
    document.fonts?.ready?.then(() => { 
        try { editor.resize(true); } catch {} 
    });

    // formatter
    const formatBtn = document.getElementById('btn-format');
    const fmt = initFormatter({
        editor,
        getCode,
        setCode,
        formatBtn
    });

    // spacing controls
    let spacingCtrl;
    if (UI.tabSpacesSlider && UI.tabSpacesValue && UI.tabSpacesInfo) {

        // store original function before overriding
        const originalSetTab = editorApis.setTab;
        
        spacingCtrl = initSpacingControls({
            editor,
            editorApis: { ...editorApis, setTab: originalSetTab },
            slider: UI.tabSpacesSlider,
            valueEl: UI.tabSpacesValue,
            infoEl: UI.tabSpacesInfo,
            tickSelector: '#tabSpacesSlider + .slider-ticks.tab-ticks .tick',
        });

        // override builtin function
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
    editor.focus();

    // ------------------------ Line/Column Info ------------------------
    function updateCursorPos() {
        const pos = editor.getCursorPosition();
        const selText = editor.getSelectedText() || '';
        UI.lineColInfo.textContent =
            `Ln ${pos.row + 1}, Col ${pos.column + 1}` +
            
            (selText ? ` (${selText.length} selected)` : '');
    }

    editor.session.selection.on('changeCursor', updateCursorPos);
    editor.session.selection.on('changeSelection', updateCursorPos);
    editor.session.on('change', updateCursorPos);
    updateCursorPos();

    // ---------- Terminal wiring ----------
    const { initTerminal } = await import('./src/terminal/terminal.js');
    
    // initialize terminal
    const { terminal, writePrompt, refit } = initTerminal({
        container: UI.terminalEl,
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block',
    });
    
    // console output
    const consoleOutput = createConsoleOutput(terminal, writePrompt);
    
    const modeCtrl = initMode({
        themeCtrl: null,
        button: UI.modeBtn,
        moonIcon: UI.moonIcon,
        sunIcon: UI.sunIcon,
        defaultMode: 'dark'
    });
    
    // theme controls
    const themeCtrl = initThemeControls({
        editor,
        editorApis,
        terminal,
        modeCtrl: modeCtrl,
        editorThemeSelect: UI.editorThemeSelect,
    });
    
    // update modeCtrl
    modeCtrl.setThemeCtrl(themeCtrl);
    themeCtrl.updateTerminalTheme();
    
    // Settings panel
    const settings = initSettings({
        panelEl: UI.settingsOverlay,
        openBtn: UI.settingsBtn,
        closeBtn: UI.closeSettings,
        overlayEl: UI.settingsOverlay,
        fontCtrl,
        spacingCtrl,
        themeCtrl,
        modeCtrl,
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
    
    // ---- Layout toggle + splitter ----
    const LAYOUT_KEY = 'ui.layout:editor-console';
    const layoutBtn  = document.getElementById('layoutBtn');

    function setWorkspaceClass(layout) {
        UI.workspace.classList.toggle('layout-vertical',   layout === 'vertical');
        UI.workspace.classList.toggle('layout-horizontal', layout === 'horizontal');
    }

    let splitter;

    function initSplitFor(layout) {
        // Tear down previous
        try { splitter?.destroy?.(); } catch {}

        const axis = layout; // 'vertical' or 'horizontal'
        
        // percentage of space editor takes up
        let editorPercentage = 0.5; // default
        if (splitter) {
            editorPercentage = splitter.getRatio();
        } else {
            // on first load
            try {
                const saved = localStorage.getItem('ui.splitter:editor-percentage');
                if (saved) {
                    const parsed = parseFloat(saved);
                    if (!isNaN(parsed) && parsed > 0 && parsed < 1) {
                        editorPercentage = parsed;
                    }
                }
            } catch {}
        }
        try { localStorage.setItem('ui.splitter:editor-percentage', String(editorPercentage)); } catch {}

        splitter = initSplitter({
            container: UI.workspace,
            handle: UI.splitter,
            paneA: UI.editorPane,
            paneB: UI.consolePane,
            axis,
            minA: 0,
            minB: 0,
            normal_top: 45,
            normal_bottom: 45,
            initialRatio: editorPercentage,
            storageKey: 'editor-console',
            onResize: () => {
                try { editor.resize(); } catch {}
                try { refit(); } catch {}
            }
        });
    }

    function updateLayoutButton(layout) {
        if (!layoutBtn) return;
        layoutBtn.querySelector('.to-horizontal')?.toggleAttribute('hidden', layout !== 'vertical');
        layoutBtn.querySelector('.to-vertical')?.toggleAttribute('hidden',   layout !== 'horizontal');
        layoutBtn.setAttribute('aria-pressed', layout === 'horizontal');
        layoutBtn.title = layout === 'vertical' ? 'Side-by-side layout' : 'Top-bottom layout';
    }

    function applyLayout(layout) {
        try { localStorage.setItem(LAYOUT_KEY, layout); } catch {}
        setWorkspaceClass(layout);
        initSplitFor(layout);
        updateLayoutButton(layout);
    }

    // Initial layout on load
    applyLayout((() => { try { return localStorage.getItem(LAYOUT_KEY) || 'vertical'; } catch { return 'vertical'; } })());

    // Toggle on click
    layoutBtn?.addEventListener('click', () => {
        let current = 'vertical';
        try { current = localStorage.getItem(LAYOUT_KEY) || 'vertical'; } catch {}
        const next = current === 'vertical' ? 'horizontal' : 'vertical';
        applyLayout(next);
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

    const runBtn = UI.runBtn;
    const runCtrl = createRunCtrl({
        consoleOutput,
        writePrompt,
        getCode,
        workerPath: new URL('./src/runtime/runner.js', window.location.href).toString(),
        onInputRequested: () => {
            repl?.setAwaitingInput(true);
            repl?.focus();
        },
        onStateChange: (running) => {
            if (!runBtn) return;
            runBtn.textContent = running ? 'Stop' : 'Run';
            runBtn.classList.toggle('run', !running);
            runBtn.classList.toggle('stop', running);
        },
        onLoadingChange: (loading) => {
            try {
                UI.terminalLoadingBar?.classList.toggle('loading', !!loading);
                UI.terminalLoadingBar?.setAttribute('aria-hidden', loading ? 'false' : 'true');
            } catch {}
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
    on(UI.runBtn, 'click', () => {
        if (runCtrl.isRunning()) runCtrl.stop();
        else repl.execCommand('run');
    });

    // Editor download
    const editorDownload = initEditorDownloads({
        getCode,
        button: UI.editorDownloadBtn,
        filenamePrefix: 'code'
    });

    // Console Copy/Download
    const consoleDownloads = initConsoleDownloads({
        terminal,
        copyBtn: UI.copyBtn,
        downloadBtn: UI.downloadBtn,
        consoleOutput
    });

    // init
    UI.clearBtn.disabled = false;

    // clear
    on(UI.clearBtn, 'click', () => {
        consoleOutput.clear();
    });

})();
