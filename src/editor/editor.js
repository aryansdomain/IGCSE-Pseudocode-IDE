import { format } from '../format/format.js';

export function initEditor({
    container,
    tabSize = 4,
    theme = 'monokai',
} = {}) {
    const aceEditor = ace.edit(container);

    // initial editor configuration
    aceEditor.setTheme(`ace/theme/${theme}`);
    aceEditor.session.setMode('ace/mode/pseudocode');
    aceEditor.session.setUseSoftTabs(true);
    aceEditor.session.setTabSize(tabSize);
    aceEditor.setShowPrintMargin(false);
    aceEditor.setReadOnly(false);
    aceEditor.setOption('wrap', false);

    // ------------------------ Helpers ------------------------

    function getCode() { return aceEditor.getValue(); }
    function setCode(src, moveCursorToStart = false) {
        aceEditor.setValue(String(src), moveCursorToStart ? -1 : 1);
    }

    function setTab(n = 4) {
        const size = Math.max(0, parseInt(n, 10) || 4);
        aceEditor.session.setTabSize(size);
    }
    function formatCode() {
        setCode(format(getCode()));
    }

    const editor = { getCode, setCode, setTab, formatCode };
    return { aceEditor, editor };
}
