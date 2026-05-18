(async function () {
    // import modules
    const { initConsole }       = await import('./src/console/console.js'      );
    const { initConsoleOutput } = await import('./src/console/consoleOutput.js');
    const { initCursor }        = await import('./src/console/cursor.js'       );
    const { initEditor }        = await import('./src/editor/editor.js'        );
    const { initFiles }         = await import('./src/editor/files.js'         );
    const { initFont }          = await import('./src/editor/font.js'          );
    const { initSpacing }       = await import('./src/editor/spacing.js'       );
    const { initFormatter }     = await import('./src/format/format.js'        );
    const { initRun }           = await import('./src/runtime/runCtrl.js'      );
    const { initLayout }        = await import('./src/ui/layout.js'            );
    const { initMode }          = await import('./src/ui/modeCtrl.js'          );
    const { initSettings }      = await import('./src/ui/settings.js'          );
    const { initSplitter }      = await import('./src/ui/splitter.js'          );
    const { initTheme }         = await import('./src/ui/themeCtrl.js'         );
    const { initUI }            = await import('./src/ui/ui.js'                );
    const { initCopy }          = await import('./src/utils/copy.js'           );
    const { initDownload }      = await import('./src/utils/download.js'       );
    const { initExamples }      = await import('./src/utils/examples.js'       );
    const { initUpload }        = await import('./src/utils/upload.js'         );

    const UI = initUI(); // object to access UI elements from

    // editor
    const { aceEditor, editor } = initEditor({
        container: UI.code,
        tabSize: 4,
        theme: 'monokai'
    });
    window.editor = aceEditor;

    // font controls
    const fontCtrl = initFont({
        editor: aceEditor,
        sizeInput:    UI.fontSizeSlider,
        sizeValueEl:  UI.fontSizeValue,
        familySelect: UI.fontFamilySelect,
        min: 6,
        max: 38,
        step: 1,
        defaultSize: 14,
        defaultFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Courier New\', monospace'
    });
    editor.setFontSize = (n) => fontCtrl.setFontSize(n);

    // update editor after fonts finish loading
    document.fonts?.ready?.then(() => {
        try { aceEditor.resize(true); } catch {}
    });

    // format functionality
    initFormatter({
        getCode:    editor.getCode,
        setCode:    editor.setCode,
        getTabSize: editor.getTabSize,
        formatBtn: UI.formatBtn
    });

    // spacing controls
    let spacingCtrl;
    if (UI.tabSpacesSlider && UI.tabSpacesValue && UI.tabSpacesInfo) {

        spacingCtrl = initSpacing({
            aceEditor,
            slider:  UI.tabSpacesSlider,
            valueEl: UI.tabSpacesValue,
            infoEl:  UI.tabSpacesInfo,
            tickSelector: '#tabSpacesSlider + .slider-ticks.tab-ticks .tick'
        });

        // override builtin function
        editor.setTab = (n) => spacingCtrl.setTabSpaces(n);
    }

    // language tools, autocompletion
    const langTools = ace.require('ace/ext/language_tools');
    const completers = [];
    try {
        const LangModule = ace.require('ace/mode/pseudocode');
        if (LangModule && LangModule.langCompleter) {
            completers.push(LangModule.langCompleter);
        }
    } catch {}

    aceEditor.setOptions({
        enableBasicAutocompletion: completers,
        enableLiveAutocompletion:  completers,
        enableSnippets: false,
        highlightActiveLine: false,
        fixedWidthGutter: true
    });

    langTools.setCompleters(completers);
    aceEditor.completers = completers.slice();

    // if mode changes, re-apply completers
    aceEditor.on('changeMode', () => {aceEditor.completers = completers.slice();} );
    aceEditor.focus();

    // ------------------------ Line/Column Info ------------------------

    function updateCursorPos() {
        const pos = aceEditor.getCursorPosition();
        const selText = aceEditor.getSelectedText() || '';
        UI.lineColInfo.textContent =
            `Ln ${pos.row + 1}, Col ${pos.column + 1}` +

            (selText ? ` (${selText.length} selected)` : '');
    }

    function attachCursorListeners() {
        const session = aceEditor.getSession();
        session.selection.on('changeCursor', updateCursorPos);
        session.selection.on('changeSelection', updateCursorPos);
        session.on('change', updateCursorPos);
        updateCursorPos();
    }
    attachCursorListeners();

    // update listeners when files switch
    aceEditor.on('changeSession', () => { attachCursorListeners(); });

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
        container: UI.console,
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        cursorBlink: true,
        cursorStyle: 'block',
        onAwaitingInputChange: () => {
            syncClearBtnDisabled();
        }
    });

    // console output
    const consoleOutput = initConsoleOutput(console);
    consoleOutput.writePrompt();

    // ------------------------ UI Elements ------------------------

    // mode controls
    const modeCtrl = initMode({
        themeCtrl: null,
        modeBtn: UI.modeBtn,
        defaultMode: 'dark',
        page: 'ide'
    });

    // theme controls
    const themeCtrl = initTheme({
        editor: aceEditor,
        console,
        modeCtrl: modeCtrl,
        editorThemeSelect: UI.editorThemeSelect
    });
    themeCtrl.updateConsoleTheme();

    // update modeCtrl with themeCtrl
    modeCtrl.setThemeCtrl(themeCtrl);

    // files
    const files = initFiles({
        codeEl: UI.code,
        filesEl: UI.files,
        onRename: (oldName, newName) => execCommand(`rename ${oldName} ${newName}`)
    });

    // settings panel
    initSettings({
        panelEl:   UI.settingsOverlay,
        openBtn:   UI.settingsBtn,
        closeBtn:  UI.closeSettings,
        overlayEl: UI.settingsOverlay,
        fontCtrl,
        spacingCtrl,
        themeCtrl,
        modeCtrl,
        editor,
        selectors: {
            fontSize:   '#fontSizeSlider',
            fontFamily: '#fontFamilySelect',
            tabSpaces:  '#tabSpacesSlider',
            softWrap:   '#softWrap',
            readOnly:   '#readOnly',
            theme:      '#editorThemeSelect',
            mode:       '#modeSelect'
        }
    });

    // examples panel
    initExamples({
        panelEl:   UI.examplesOverlay,
        openBtn:   UI.examplesBtn,
        closeBtn:  UI.closeExamples,
        overlayEl: UI.examplesOverlay,
        editor,
        files
    });

    // layout controls
    const layoutControls = initLayout({
        workspace: UI.workspace,
        layoutBtn: UI.layoutBtn,
        initialLayout: 'vertical'
    });

    // splitter
    let splitter;
    function reInitSplitter(layout) {
        try { splitter?.destroy?.(); } catch {}

        // percentage of space editor takes up
        let initialRatio = 0.475;
        if (splitter) initialRatio = splitter.getRatio();

        splitter = initSplitter({
            container: UI.workspace,
            handle:    UI.splitter,
            paneA:     UI.editorPane,
            paneB:     UI.consolePane,
            btnA:      UI.editorExpandBtn,
            btnB:      UI.expandConsoleBtn,
            axis: layout,
            minA: 0,
            minB: 0,
            barHeight: 45,
            snapInPx:  35,
            snapOutPx: 50,
            initialRatio,
            onResize: () => {
                try { aceEditor.resize(); } catch {}
                try { refit(); } catch {}
            }
        });
    }
    reInitSplitter(layoutControls.getLayout());

    // reinit splitter when layout changes
    UI.layoutBtn.addEventListener('click', toggleLayout = () => {
        layoutControls.toggleLayout();
        reInitSplitter(layoutControls.getLayout());
    });

    // ------------------------ Runtime ------------------------

    // init cursor
    let cursor;

    const runBtn = UI.runBtn;
    let syncClearBtnDisabled = () => {};
    const runCtrl = initRun({
        cursor,
        consoleOutput,
        console,
        files,
        getline,
        getCode: editor.getCode,
        workerPath: new URL('./src/runtime/runner.js', window.location.href).toString(),
        onInputRequested: () => {
            setAwaitingInput(true);
            cursor?.focus();
        },
        onInputEnd: () => {
            setAwaitingInput(false);
        },
        onStateChange: (running) => {
            if (runBtn) {
                runBtn.textContent = running ? 'Stop' : 'Run';
                runBtn.classList.toggle('run', !running);
                runBtn.classList.toggle('stop', running);
            }
            syncClearBtnDisabled();
        },
        onLoadingChange: (loading) => {
            try {
                UI.consoleLoadingBar?.classList.toggle('loading', !!loading);
                UI.consoleLoadingBar?.setAttribute('aria-hidden', loading ? 'false' : 'true');
            } catch {}
        }
    });

    cursor = initCursor({ console, consoleOutput, isAwaitingInput });
    runCtrl.setCursor(cursor);

    syncClearBtnDisabled = () => {
        if (!UI.clearBtn) return;
        UI.clearBtn.disabled = runCtrl.isRunning() || isAwaitingInput();
    };
    syncClearBtnDisabled();

    // set dependencies for console
    setDeps({ consoleOutput, runCtrl, editor, themeCtrl, modeCtrl, cursor, files });

    // run/stop button
    UI.runBtn.addEventListener('click', () => {
        if (runCtrl.isRunning()) runCtrl.stop();
        else execCommand('run');
    });

    // ------------------------ Editor/Console Utilities ------------------------

    // copy
    initCopy({
        consoleCopyBtn: UI.consoleCopyBtn,
        editorCopyBtn: UI.editorCopyBtn,
        getCode: editor.getCode,
        getConsoleText,
        consoleOutput
    });

    // download
    initDownload({
        consoleDownloadBtn: UI.consoleDownloadBtn,
        editorDownloadBtn: UI.editorDownloadBtn,
        getCode: editor.getCode,
        getConsoleText,
        consoleOutput,
        getActiveFileName: files.getActiveFileName
    });

    // upload
    initUpload({
        uploadBtn: UI.uploadBtn,
        fileInput: UI.fileInput,
        setCode: (text) => {
            // create a new file in files with uploaded content
            const fileName = UI.fileInput.files[0]?.name || 'uploaded';
            files.addFile(fileName);

            // set code on active session
            editor.setCode(text);
        },
        consoleOutput
    });

    // clear button
    UI.clearBtn.addEventListener('click', () => {
        if (UI.clearBtn.disabled) return;
        consoleOutput.clear();
    });

    // info button
    UI.infoBtn.addEventListener('click', () => {
        window.open('rules.pdf', '_blank', 'noopener');
    });

    // signal that UI is ready
    try { window.setAppReady?.(); } catch {}
})();
