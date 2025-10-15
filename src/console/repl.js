export function initRepl({ console, consoleOutput, runCtrl, editorApis, themeCtrl, modeCtrl, openReportPage }) {
    let hist = [];               // history of commands
    let hIdx = -1;               // -1 = live buffer
    let awaitingInput = false;   // user prompted to enter input?
    let inputStartCol = 0;       // column where program input begins
    let line = '';               // current line content
    let cursorPos = 0;           // cursor position in line. DOES NOT ACCOUNT FOR PROMPT

    // ------------------------ Utilities ------------------------
    async function setLine(newLine) {
        line = newLine;

        consoleOutput.hideCursor();

        if (awaitingInput) {
            const origPos = cursorPos;
            
            moveCursorTo(0);
            consoleOutput.clearToLineEnd(); consoleOutput.print(line);

            await new Promise(resolve => setTimeout(resolve, 5)); // delay for printing

            moveCursorTo(origPos);
        } else {
            consoleOutput.clearline();
            consoleOutput.writePrompt();
            consoleOutput.print(line);
        }
        
        consoleOutput.showCursor();
    }

    async function insertChar(char) {
        const before = line.slice(0, cursorPos);
        const after  = line.slice(cursorPos);

        await setLine(before + char + after);

        // fix cursor pos
        if (awaitingInput) moveCursorRight();
        else {
            cursorPos++;
            if (after.length > 0) consoleOutput.moveCursorLeft(after.length);
        }
    }
    async function deleteChar() {
        if (cursorPos <= 0) return; // cant delete further

        const before = line.slice(0, cursorPos - 1);
        const after  = line.slice(cursorPos);

        await setLine(before + after);

        if (awaitingInput) moveCursorLeft();
        else {
            cursorPos--;
            if (after.length > 0) consoleOutput.moveCursorLeft(after.length);
        }
    }

    // cursor functions
    function moveCursorLeft(n = 1) {
        cursorPos -= n;
        consoleOutput.moveCursorLeft(n);
    }
    function moveCursorRight(n = 1) {
        cursorPos += n;
        consoleOutput.moveCursorRight(n);
    }
    function moveCursorTo(n) {
        cursorPos = n;
        if (awaitingInput) consoleOutput.moveCursorTo(inputStartCol + n);
        else               consoleOutput.moveCursorTo(n + 2);
    }

    // ------------------------ Command Execution ------------------------
    function execCommand(line) {
        const raw = String(line || '').trim();
        const [cmd, ...rest] = raw.split(/\s+/);
        const c = (cmd || '').toLowerCase();
        const arg = rest.join(' ');

        consoleOutput.hideCursor();
        consoleOutput.clearline();
        consoleOutput.writePrompt();
        consoleOutput.print('\x1b[32m');    // green color
        consoleOutput.print(`${c} ${arg}`);
        consoleOutput.println('\x1b[0m');     // reset color
        consoleOutput.showCursor();
    
        switch (c) {
            case 'help': {
                const output =
                    'help                 Print this dialog\r\n' +
                    'run                  Execute the code currently in the editor. If the program needs input, type and press Enter.\r\n' +
                    'clear                Clear console\r\n' +
                    'format               Format the editor code\r\n' +
                    'tab <n>              Set editor tab size (0-8 spaces)\r\n' +
                    'font <px>            Set editor font size (6-38 px)\r\n' +
                    'mode <light|dark>    Switch overall UI between light and dark modes\r\n' +
                    'theme <name>         Change the editor color theme\r\n' +
                    'report               Open the report page to report an issue\r\n\r\n';
                consoleOutput.println('\x1b[1m\nCommands:\x1b[0m'); // bold
                consoleOutput.print(output);
                break;
            }
    
            case 'run':
                consoleOutput.newline();
                runCtrl.run('console');
                return;
    
            case 'clear':
                consoleOutput.clear();
                break;
    
            case 'format': {
                editorApis.formatCode();
                consoleOutput.println('Formatted.');
                break;
            }
    
            case 'tab': {
                const n = parseInt(arg, 10);
                if (!arg || Number.isNaN(n) || n < 0 || n > 8) {
                    consoleOutput.errln('Usage: tab <0-8 spaces>');
                    break;
                }
                editorApis?.setTab?.(n);
                
                consoleOutput.println(`Tab spaces: ${n}`)
                if (n === 0) {
                    consoleOutput.warnln('Warning: setting tab spacing to another value will not work.');
                    consoleOutput.warnln('Press Cmd/Ctrl+Z to undo.');
                }
                break;
            }
    
            case 'font': {
                const n = parseInt(arg, 10);
                if (!arg || Number.isNaN(n) || n < 6 || n > 38) {
                    consoleOutput.errln('Usage: font <6-38>');
                    break;
                }

                editorApis?.setFontSize?.(n);
                consoleOutput.println(`Font size: ${n}`)
                break;
            }
    
            case 'mode': {
                const t = (arg || '').toLowerCase();
                if (t === 'light' || t === 'dark') {
                    if (modeCtrl && typeof modeCtrl.setMode === 'function') modeCtrl.setMode(t);
                    else if (editorApis?.setMode) editorApis.setMode(t);

                    consoleOutput.println(`Mode: ${t}`);
                } else {
                    
                    consoleOutput.errln('Usage: mode <light|dark>')
                    if (themeCtrl.themeInfo(t).ok) consoleOutput.errln(`Did you mean 'theme ${t}'?`);

                }
                break;
            }
    
            case 'theme': {
                const name = (arg || '').trim().toLowerCase();
                if (!name) {
                    consoleOutput.errln('Usage: theme <name>');
                    break;
                }

                // get theme name
                const themeResult = themeCtrl.themeInfo(name);
                if (!themeResult.ok) {
                    consoleOutput.errln('Error: Invalid theme');
                    if (name === 'light' || name === 'dark') consoleOutput.errln(`Did you mean 'mode ${name}'?`);
                    break;
                }

                themeCtrl.setTheme(themeResult.bare);
                consoleOutput.println(`Theme: ${themeResult.name}`);

                break;
            }

            case 'report': {
                consoleOutput.println('Page opened.');
                openReportPage();
                break;
            }
    
            case '':
                // no output
                break;
                
            default:
                consoleOutput.errln(`Unknown command: ${cmd}`);
                break;
        }
        
        consoleOutput.writePrompt();
    }
    
    // ------------------------ Keyboard Input ------------------------
    console.onData(async (data) => {

        // ignore all input except ctrl-c (stops program) when console is locked
        if (runCtrl.isConsoleLocked() && data !== '\u0003') return;

        if (awaitingInput) {

            // INPUT
            if (data === '\r') {                                // enter, submit input to program
                awaitingInput = false;
                consoleOutput.newline();
                
                window.runCtrlProvideInput(line);

                // reset everything
                line = '';
                hIdx = -1;

            } else if (data === '\u0003') {                     // ctrl-c, abort program
                setLine('');
                runCtrl.stop();
                awaitingInput = false;

            } else if (data === '\u007F') await deleteChar();         // backspace
              else if (data === '\u001b[C') {                   // right arrow
                if (cursorPos < line.length) moveCursorRight();
            } else if (data === '\u001b[D') {                   // left arrow
                if (cursorPos > 0) moveCursorLeft(); 
            } else if (data.length === 1 && data >= ' ') {      // printable characters
                await insertChar(data);      // data >= ' ' ensures the ASCII value is >= 32
            }
        } else {

            // regular console
            if (data === '\r') {                                // enter, execute command
                const origLine = line;
                if (origLine.trim()) hist.push(origLine);

                hIdx = -1;
                setLine('');

                execCommand(origLine);

            } else if (data === '\u0003') {                     // ctrl-c, abort program
                if (runCtrl.isRunning()) {
                    consoleOutput.newline();
                    runCtrl.stop();
                } else {
                    consoleOutput.hideCursor();
                    consoleOutput.newline();
                    consoleOutput.writePrompt();
                    consoleOutput.showCursor();
                }
            } else if (data === '\u007F') deleteChar();         // backspace
              else if (data === '\u001b[A') {                   // up arrow
                if (!hist.length) return;

                if (hIdx === -1) hIdx = hist.length - 1;
                else hIdx = Math.max(0, hIdx - 1);
                const prevCmd = hist[hIdx] || '';

                setLine(prevCmd);
                moveCursorTo(prevCmd.length + 3); // account for prompt length
                cursorPos = prevCmd.length; // cursorPos doesn't account for prompt

            } else if (data === '\u001b[B') {                   // down arrow
                if (!hist.length) return;
                if (hIdx === -1) { // reset everything
                    setLine('');
                    cursorPos = 0;
                    return;
                }

                hIdx = Math.min(hist.length, hIdx + 1);
                const nextCmd = (hIdx === hist.length) ? '' : (hist[hIdx] || '');

                setLine(nextCmd);
            } else if (data === '\u001b[C') {                   // right arrow
                if (cursorPos < line.length) moveCursorRight();
            } else if (data === '\u001b[D') {                   // left arrow
                if (cursorPos > 0) moveCursorLeft(); 
            } else if (data.length === 1 && data >= ' ') {      // printable characters
                insertChar(data);        // data >= ' ' ensures the ASCII value is >= 32
            }
        }

    });

    // ------------------------ Getters & Setters ------------------------
    async function setAwaitingInput(v) {
        awaitingInput = !!v;

        if (awaitingInput) {
            // record start of input region
            const buf = console?.buffer?.active;
            await new Promise(resolve => setTimeout(resolve, 5)); // delay to get buffer
            inputStartCol = (buf && typeof buf.cursorX === 'number') ? buf.cursorX : 0;

            // start fresh buffer
            line = '';
            moveCursorTo(0);
            cursorPos = 0;
        }
    }
    function isAwaitingInput() { return awaitingInput; }
    function focus() { console.focus(); }

    // reset state
    function reset() {
        awaitingInput = false;
        inputStartCol = 0;
        cursorPos = 0;
        line = '';
    }

    return { setAwaitingInput, isAwaitingInput, setLine, focus, execCommand, reset };
}
  