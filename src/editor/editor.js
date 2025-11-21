import { format } from '../format/format.js';

export function initEditor({
    container,
    tabSize = 4,
    theme = 'monokai',
} = {}) {
    const editor = ace.edit(container);

    // initial editor configuration
    editor.setTheme(`ace/theme/${theme}`);
    editor.session.setMode('ace/mode/pseudocode');
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(tabSize);
    editor.setShowPrintMargin(false);
    editor.setReadOnly(false);
    editor.setOption('wrap', false);

    // ------------------------ Helpers ------------------------
    function getCode() { return editor.getValue(); }
    function setCode(src, moveCursorToStart = false) {
        editor.setValue(String(src ?? ''), moveCursorToStart ? -1 : 1);
    }

    function setTab(n = 4) {
        const size = Math.max(0, parseInt(n, 10) || 4);
        editor.session.setTabSize(size);
    }
    function formatCode() {
        setCode(format(getCode()));
    }

    const editorApis = {
        getCode,
        setCode,
        setTab,
        formatCode,
    };

    return { editor, editorApis };
}
