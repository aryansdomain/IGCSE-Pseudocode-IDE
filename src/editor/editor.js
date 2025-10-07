import { format } from '../format/format.js';

export function initEditor({
    container,
    defaultCode = '',
    tabSize = 4,
    theme = 'monokai',
    softWrap = false,
    readOnly = false,

} = {}) {
    const editor = ace.edit(container);

    // initial editor configuration
    editor.setTheme(`ace/theme/${theme}`);
    editor.session.setMode('ace/mode/lang');
    editor.setValue(defaultCode, -1);          // -1 = keep cursor at start
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(tabSize);
    editor.setShowPrintMargin(false);
    editor.setReadOnly(!!readOnly);
    editor.setOption('wrap', softWrap ? 'free' : false);

    // TODO: add custom backspace command that uses this logic:
    // When  there is a code like this ( tab = 4 spaces, cursor shown by | )

    // IF x < 0
    //   THEN
    //     OUTPUT x
    //     |

    // and the user presses backspace, the cursor should move to same level as THEN (2 spaces after IF)
    // same with CASE

    function getCode() { return editor.getValue(); }
    function setCode(src, moveCursorToStart = false) {
        editor.setValue(String(src ?? ''), moveCursorToStart ? -1 : 1);
    }

    function setTab(n = 4) {
        const size = Math.max(0, parseInt(n, 10) || 4);
        editor.session.setTabSize(size);
    }
    function setTheme(name = 'monokai') {
        editor.setTheme(`ace/theme/${name}`);
    }   
    function formatCode() {
        setCode(format(getCode()));
    }

    const editorApis = {
        getCode,
        setCode,
        setTab,
        setTheme,
        formatCode,
    };

    return { editor, editorApis };
}
