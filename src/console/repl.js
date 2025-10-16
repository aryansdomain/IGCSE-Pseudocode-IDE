export function initRepl({ console, consoleOutput, runCtrl, editorApis, themeCtrl, modeCtrl }) {

    let hist = [];                     // history of commands
    let hIdx = -1;                     // -1 = live buffer
    let awaitingProgramInput = false;  // user prompted to enter input?
    let inputStartCol = 0;             // column where program input begins
    let line = '';              // current line content
    let cursorPos = 0;                 // cursor position in line, does not account for propmt

    // ------------------------ Utilities ------------------------
    async function setLine(newLine) {
        line = newLine;

        consoleOutput.hideCursor();

        if (awaitingProgramInput) {
            consoleOutput.moveCursorTo(inputStartCol); // go to start of input region
            consoleOutput.clearToLineEnd();
            consoleOutput.print(line);
            await new Promise(resolve => setTimeout(resolve, 5)); // delay for printing
            consoleOutput.moveCursorTo(inputStartCol + cursorPos);
        } else {
            consoleOutput.clearline();
            consoleOutput.writePrompt();
            consoleOutput.print(line);

            cursorPos = Math.min(cursorPos, line.length);
            const back = line.length - cursorPos;
            if (back > 0) consoleOutput.moveCursorLeft(back);
        }
        
        consoleOutput.showCursor();
    }

    async function insertChar(char) {
        const before = line.slice(0, cursorPos);
        const after  = line.slice(cursorPos);

        await setLine(before + char + after);
        moveCursorRight();
    }
    async function deleteChar() {
        if (cursorPos <= 0) return; // cant delete further

        const before = line.slice(0, cursorPos - 1);
        const after  = line.slice(cursorPos);

        await setLine(before + after);
        if (after.length > 0) moveCursorLeft();
        else if (awaitingProgramInput) moveCursorLeft();
    }

    function moveCursorLeft(n = 1) {
        if (cursorPos <= 0 || n === 0) return; // cant move left further

        cursorPos -= n;
        consoleOutput.moveCursorLeft(n);
    }
    function moveCursorRight(n = 1) {
        if (cursorPos >= line.length || n == 0) return; // cant move right further

        cursorPos += n;
        consoleOutput.moveCursorRight(n);
    }

    // ------------------------ Command Execution ------------------------
    function execCommand(line) {
        const raw = String(line || '').trim();
        const [cmd, ...rest] = raw.split(/\s+/);
        const c = (cmd || '').toLowerCase();
        const arg = rest.join(' ');

        // add to history
        if (raw) hist.push(raw);

        consoleOutput.hideCursor();
        consoleOutput.clearline();
        consoleOutput.writePrompt();
        consoleOutput.println(`${c} ${arg}`, 32); // green color
        consoleOutput.showCursor();
    
        switch (c) {
            case 'help': {
                const output =
                    'run                  Execute the code in the editor. If the program needs input, type and press Enter.\r\n' +
                    'clear                Clear console\r\n' +
                    'format               Format the editor code\r\n' +
                    'tab <n>              Set editor tab size (0-8 spaces)\r\n' +
                    'font <px>            Set editor font size (6-38 px)\r\n' +
                    'mode <light|dark>    Switch overall UI between light and dark modes\r\n' +
                    'theme <name>         Change the editor color theme\r\n' +
                    'help                 Print this dialog\r\n';
                consoleOutput.lnprintln('Commands:', 1); // bold
                consoleOutput.println(output);
                break;
            }
    
            case 'run': {
                consoleOutput.newline();
                runCtrl.run('console');
                return;
            }
    
            case 'clear': {
                consoleOutput.clear();
                break;
            }
    
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
                
            default: {
                if (c != '') consoleOutput.errln(`Unknown command: ${cmd}`);
                break;
            }
        }
        
        consoleOutput.writePrompt();
    }
    
    // ------------------------ Keyboard Input ------------------------
    console.onData (async (data) => {

        // ignore all input except ctrl-c (stops program) when console is locked
        if (runCtrl.isConsoleLocked() && data !== '\u0003') return;

        if (awaitingProgramInput) {

            // INPUT mode
            if (data === '\r') {                        // enter, submit input to program
                awaitingProgramInput = false;
                consoleOutput.newline();
                
                window.runCtrlProvideInput(line);

                // reset
                line = '';
                cursorPos = 0;
                hIdx = -1;

            } else if (data === '\u0003') {                    // ctrl-c, abort program
                consoleOutput.newline();
                runCtrl.stop();

            } else if (data === '\u007F') deleteChar();        // backspace
              else if (data === '\u001b[C') moveCursorRight(); // right arrow
              else if (data === '\u001b[D') moveCursorLeft();  // left arrow
              else if (data.length === 1 && data >= ' ') {     // printable characters
                insertChar(data);      // data >= ' ' ensures the ASCII value is >= 32
            }
        } else {

            // shell mode
            if (data === '\r') {                         // enter, execute command
                const origLine = line;

                hIdx = -1;
                await setLine('');

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
                if (hIdx === -1) hIdx = hist.length - 1; else hIdx = Math.max(0, hIdx - 1);
                const line = hist[hIdx] || '';

                await setLine(line);
                moveCursorRight(line.length - cursorPos);

            } else if (data === '\u001b[B') {                   // down arrow
                if (!hist.length) return;

                if (hIdx === -1) {
                    await setLine('');
                    cursorPos = 0;
                    return;
                }

                hIdx = Math.min(hist.length, hIdx + 1);
                const line = (hIdx === hist.length) ? '' : (hist[hIdx] || '');

                await setLine(line);
                moveCursorRight(line.length - cursorPos);

            } else if (data === '\u001b[C') moveCursorRight();  // right arrow
              else if (data === '\u001b[D') moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {      // printable characters
                insertChar(data);        // data >= ' ' ensures the ASCII value is >= 32
            }
        }
    });

    // ------------------------ Getters & Setters ------------------------
    async function setAwaitingInput(v) {
        awaitingProgramInput = !!v;

        if (awaitingProgramInput) {

            // record start of input region
            const buf = console?.buffer?.active;
            await new Promise(resolve => setTimeout(resolve, 5)); // delay since printing takes time
            inputStartCol = (buf && typeof buf.cursorX === 'number') ? buf.cursorX : 0;

            // start fresh editable buffer
            line = '';
            cursorPos = 0;
        }
    }
    function isAwaitingInput() { return awaitingProgramInput; }
    function focus() { console.focus(); }

    // reset everything
    function reset() {
        awaitingProgramInput = false;
        inputStartCol = 0;
        cursorPos = 0;
        line = '';
        hIdx = -1;
    }

    return { setAwaitingInput, isAwaitingInput, setLine, focus, execCommand, reset };
}
