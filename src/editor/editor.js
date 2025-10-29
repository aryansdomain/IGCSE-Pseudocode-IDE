import { format } from '../format/format.js';

const STORAGE_KEY = 'igcse_ide_editor_code';
const DEFAULT_CODE = `// Type your code here!

DECLARE Name : STRING

FUNCTION Greet(Name : STRING) RETURNS STRING
    RETURN "Hello, ", Name, "!"
ENDFUNCTION

OUTPUT "Enter your name: "
INPUT Name
OUTPUT Greet(Name)
`;

export function initEditor({
    container,
    tabSize = 4,
    theme = 'monokai',
    softWrap = false,
    readOnly = false,
} = {}) {
    const editor = ace.edit(container);

    // initial editor configuration
    editor.setTheme(`ace/theme/${theme}`);
    editor.session.setMode('ace/mode/lang');
    editor.setValue(localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE, -1); // load from localstorage
    editor.session.setUseSoftTabs(true);
    editor.session.setTabSize(tabSize);
    editor.setShowPrintMargin(false);
    editor.setReadOnly(!!readOnly);
    editor.setOption('wrap', softWrap ? 'free' : false);

    // save code to localStorage
    editor.on('change', () => {
        try { localStorage.setItem(STORAGE_KEY, editor.getValue()); }
        catch (error) { globalThis.console.warn('Failed to save editor content to localStorage:', error); }
    });

    // TODO: add custom backspace command that uses this logic:
    // When  there is a code like this ( tab = 4 spaces, cursor shown by | )

    // IF x < 0
    //   THEN
    //     OUTPUT x
    //     |

    // and the user presses backspace, the cursor should move to same level as THEN (2 spaces after IF)
    // same with CASE

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
