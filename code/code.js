import { setAppReady } from '../shared/loading.js';

// import modules
const { initConsole       } = await import('./console/console.js'      );
const { initConsoleOutput } = await import('./console/consoleOutput.js');
const { initCursor        } = await import('./console/cursor.js'       );
const { initEditor        } = await import('./editor/editor.js'        );
const { initFiles         } = await import('./editor/files.js'         );
const { initFont          } = await import('./editor/font.js'          );
const { initSpacing       } = await import('./editor/spacing.js'       );
const { format            } = await import('./editor/format.js'        );
const { initRunCtrl       } = await import('./runtime/runCtrl.js'      );
const { initLayout        } = await import('./ui/layout.js'            );
const { initModeCtrl      } = await import('../shared/modeCtrl.js'     );
const { initSettings      } = await import('./ui/settings.js'          );
const { initSplitter      } = await import('./ui/splitter.js'          );
const { initThemeCtrl     } = await import('./editor/themeCtrl.js'     );
const { initUI            } = await import('./ui/ui.js'                );
const { initCopy          } = await import('./editor/copy.js'          );
const { initDownload      } = await import('./editor/download.js'      );
const { initExamples      } = await import('./editor/examples.js'      );
const { initUpload        } = await import('./editor/upload.js'        );

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
UI.formatBtn?.addEventListener('click', () => {
    const before = editor.getCode();
    const after  = format(before, editor.getTabSize());
    editor.setCode(after);

    try {
        window.code_formatted && window.code_formatted({
            code_formatted_old_size: before.length,
            code_formatted_new_size: after.length
        });
    } catch {}
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
const modeCtrl = initModeCtrl({
    themeCtrl: null,
    modeBtn: UI.modeBtn,
    defaultMode: 'dark',
    page: 'code'
});

// theme controls
const themeCtrl = initThemeCtrl({
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

// settings
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
const toggleLayout = () => {
    layoutControls.toggleLayout();
    reInitSplitter(layoutControls.getLayout());
};
UI.layoutBtn.addEventListener('click', toggleLayout);

// ------------------------ Runtime ------------------------

// init cursor
let cursor;

const runBtn = UI.runBtn;
let syncClearBtnDisabled = () => {};
const runCtrl = initRunCtrl({
    consoleOutput,
    console,
    files,
    getline,
    getCode: editor.getCode,
    workerPath: new URL('./runtime/runner.js', window.location.href).toString(),
    onInputRequested: () => {
        setAwaitingInput(true);
        cursor?.focus();
    },
    onInputEnd: () => {
        setAwaitingInput(false);
    },
    onStateChange: (running) => {
        runBtn.innerHTML = running
            ? '<i class="fas fa-stop"></i> Stop'
            : '<i class="fas fa-play"></i> Run';
        runBtn.classList.toggle('run', !running);
        runBtn.classList.toggle('stop', running);
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
    window.open('code.pdf', '_blank', 'noopener');
});

// signal that UI is ready
setAppReady();
