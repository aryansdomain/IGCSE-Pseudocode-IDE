import { format } from '../format/format.js';

export function initEditor({
    container,
    tabSize = 4,
    theme = 'monokai'
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

    function getCode()     { return aceEditor.getValue();                 }
    function setCode(code) {        aceEditor.setValue(String(code), -1); }

    function setTab(n = 4) {
        const size = Math.max(0, parseInt(n, 10) || 4);
        aceEditor.session.setTabSize(size);
    }
    function getTabSize() {
        return aceEditor.session.getTabSize();
    }

    function formatCode() {
        setCode(format(getCode(), getTabSize()));
    }

    // override backspace command
    // on a whitespace-only line, backspace moves cursor to previous indent level
    aceEditor.commands.addCommand({
        name: 'backspace',
        bindKey: { win: 'Backspace', mac: 'Backspace' },
        exec(ed) {
            const session = ed.getSession();
            const cursor  = ed.getCursorPosition();
            const line = session.getLine(cursor.row);

            if (line.length > 0 && /^\s+$/.test(line)) { // only whitespace
                const currentIndent = line.length;
 
                // find last indent
                for (let i = cursor.row - 1; i >= 0; i--) {
                    const prevLine = session.getLine(i);
                    if (/^\s*$/.test(prevLine)) continue; // only whitespace

                    const prevIndent = prevLine.match(/^ */)[0].length; // indent level
                    if (prevIndent < currentIndent) {
                        // move to previous indent
                        const Range = ace.require('ace/range').Range;
                        const startToCursor = new Range(cursor.row, 0, cursor.row, currentIndent);
                        session.replace(startToCursor, ' '.repeat(prevIndent));

                        ed.moveCursorTo(cursor.row, prevIndent);
                        return;
                    }
                }
            }
            ed.remove('left');
        }
    });

    const editor = { getCode, setCode, setTab, getTabSize, formatCode };
    return { aceEditor, editor };
}
