(async function () {

    // import modules
    const { initEditor }            = await import('./src/editor/editor.js');
    const { initFontControls }      = await import('./src/editor/font.js');
    const { initSpacingControls }   = await import('./src/editor/tab.js');
    const { initThemeControls }     = await import('./src/ui/themeCtrl.js');
    const { initFormatter }         = await import('./src/format/format.js');
    const { initRunCtrl }           = await import('./src/runtime/runCtrl.js');
    const { initConsole }           = await import('./src/console/console.js');
    const { initConsoleOutput }     = await import('./src/console/consoleOutput.js');
    const { initCursor }            = await import('./src/console/cursor.js');
    const { initDownload }          = await import('./src/utils/download.js');
    const { initCopy }              = await import('./src/utils/copy.js');
    const { initUpload }            = await import('./src/utils/upload.js');
    const { initMode }              = await import('./src/ui/modeCtrl.js');
    const { initSettings }          = await import('./src/ui/settings.js');
    const { initExamples }          = await import('./src/ui/examples.js');
    const { initSplitter }          = await import('./src/ui/splitter.js');
    const { initLayoutControls }    = await import('./src/ui/layout.js');
    const { initUI, on }            = await import('./src/utils/ui.js');

    const UI = initUI();

    // ace editor
    const STORAGE_KEY = 'igcse_ide_editor_code'
    const defaultCode = `// Type your code here!

DECLARE Name : STRING

FUNCTION Greet(Name : STRING) RETURNS STRING
    RETURN "Hello, ", Name, "!"
ENDFUNCTION

OUTPUT "Enter your name: "
INPUT Name
OUTPUT Greet(Name)`;

    // load saved code from localStorage 
    const initialCode = localStorage.getItem(STORAGE_KEY) || defaultCode;

    const { editor, editorApis } = initEditor({
        container: UI.codeEl,
        defaultCode: initialCode,
        tabSize: 4,
        theme: 'monokai',
        softWrap: false,
        readOnly: false,
    });
    window.editor = editor;

    // save code to localStorage
    editor.on('change', () => {
        try { localStorage.setItem(STORAGE_KEY, editor.getValue()); }
        catch (error) { globalThis.console.warn('Failed to save editor content to localStorage:', error); }
    });

    // font controls
    const fontCtrl = initFontControls({
        editor,
        sizeInput: UI.fontSizeSlider,
        sizeValueEl: UI.fontSizeValue,
        familySelect: UI.fontFamilySelect,
        min: 6,
        max: 38,
        step: 1,
        defaultSize: 14,
        defaultFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
        STORAGE_KEY: 'igcse_ide_editor_font'
    });
    editorApis.setFontSize = (n) => fontCtrl.setFontSize(n);
    // nudge editor after fonts finish loading
    document.fonts?.ready?.then(() => { 
        try { editor.resize(true); } catch {} 
    });

    // format functionality
    const format = initFormatter({
        editor,
        getCode: editorApis.getCode,
        setCode: editorApis.setCode,
        formatBtn: UI.formatBtn
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

    // language tools, autocompletion
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

    // ------------------------ Console ------------------------

    // initialize console
    const {
        console,
        getline,
        getConsoleText,
        refit,
        execCommand,
        setDeps,
        setAwaitingInput,
        isAwaitingInput
    } = initConsole({
        container: UI.consoleEl,
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block',
    });

    // console output
    const consoleOutput = initConsoleOutput(console);
    consoleOutput.writePrompt();

    //------------------------ UI Elements ------------------------
    
    // mode controls
    const modeCtrl = initMode({
        themeCtrl: null,
        modeBtn: UI.modeBtn,
        defaultMode: 'dark',
        page: 'ide',
        STORAGE_KEY: 'igcse_ide_mode'
    });
    
    // theme controls
    const themeCtrl = initThemeControls({
        editor,
        console,
        modeCtrl: modeCtrl,
        editorThemeSelect: UI.editorThemeSelect,
    });
    themeCtrl.updateConsoleTheme();
    
    // update modeCtrl with themeCtrl
    modeCtrl.setThemeCtrl(themeCtrl);
    
    // settings panel
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
    
    // examples panel
    const examples = initExamples({
        panelEl: UI.examplesOverlay,
        openBtn: UI.examplesBtn,
        closeBtn: UI.closeExamples,
        overlayEl: UI.examplesOverlay,
        editorApis
    });
    
    // layout controls
    const layoutControls = initLayoutControls({
        workspace: UI.workspace,
        layoutBtn: UI.layoutBtn,
        initialLayout: 'vertical',
        STORAGE_KEY: 'igcse_ide_layout'
    });

    // splitter
    let splitter;
    function reInitSplitter(layout) {
        try { splitter?.destroy?.(); } catch {}
        
        // percentage of space editor takes up
        let initialRatio = 0.5;
        if (splitter) initialRatio = splitter.getRatio();

        splitter = initSplitter({
            container: UI.workspace,
            handle: UI.splitter,
            paneA: UI.editorPane,
            paneB: UI.consolePane,
            btnA: UI.editorExpandBtn,
            btnB: UI.expandConsoleBtn,
            axis: layout,
            minA: 0,
            minB: 0,
            barHeight: 45,
            snapInPx: 35,
            snapOutPx: 50,
            initialRatio,
            STORAGE_KEY: 'igcse_ide_splitter_ratio',
            onResize: () => {
                try { editor.resize(); } catch {}
                try { refit(); } catch {}
            }
        });
    }
    reInitSplitter(layoutControls.getLayout());

    // reinit splitter when layout changes
    layoutBtn.addEventListener('click', toggleLayout = () => {
        layoutControls.toggleLayout();
        reInitSplitter(layoutControls.getLayout());
    })

    //------------------------ Runtime ------------------------

    // init cursor
    let cursor;

    const runBtn = UI.runBtn;
    const runCtrl = initRunCtrl({
        cursor,
        consoleOutput,
        console,
        getline,
        getCode: editorApis.getCode,
        workerPath: new URL('./src/runtime/runner.js', window.location.href).toString(),
        onInputRequested: () => {
            setAwaitingInput(true);
            cursor?.focus();
        },
        onStateChange: (running) => {
            if (!runBtn) return;
            runBtn.textContent = running ? 'Stop' : 'Run';
            runBtn.classList.toggle('run', !running);
            runBtn.classList.toggle('stop', running);
        },
        onLoadingChange: (loading) => {
            try {
                UI.consoleLoadingBar?.classList.toggle('loading', !!loading);
                UI.consoleLoadingBar?.setAttribute('aria-hidden', loading ? 'false' : 'true');
            } catch {}
        }
    });
    
    cursor = initCursor({ console, consoleOutput, setAwaitingInput, isAwaitingInput });
    runCtrl.setCursor(cursor);

    // set dependencies for console
    setDeps({ consoleOutput, runCtrl, editorApis, themeCtrl, modeCtrl, cursor });

    // run/stop button
    on(UI.runBtn, 'click', () => {
        if (runCtrl.isRunning()) runCtrl.stop();
        else execCommand('run');
    });

    // ------------------------ Editor/Console Utilities ------------------------

    // copy
    const copies = initCopy({
        consoleCopyBtn: UI.consoleCopyBtn,
        editorCopyBtn: UI.editorCopyBtn,
        getCode: editorApis.getCode,
        getConsoleText,
        consoleOutput
    });

    // download
    const downloads = initDownload({
        consoleDownloadBtn: UI.consoleDownloadBtn,
        editorDownloadBtn: UI.editorDownloadBtn,
        getCode: editorApis.getCode,
        getConsoleText,
        consoleOutput
    });

    // upload
    const uploads = initUpload({
        uploadBtn: UI.uploadBtn,
        fileInput: UI.fileInput,
        setCode: editorApis.setCode,
        consoleOutput
    });

    // clear button
    UI.clearBtn.disabled = false;
    on(UI.clearBtn, 'click', () => {
        consoleOutput.clear();
    });

    // info button
    UI.infoBtn.addEventListener('click', () => {
        window.open('rules.pdf', '_blank', 'noopener');
    });

    // signal that UI is ready
    try { window.setAppReady?.(); } catch {}

})();
