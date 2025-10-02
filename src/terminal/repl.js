export function createRepl({ terminal, consoleOutput, writePrompt, runCtrl, editorApis, themeCtrl, modeCtrl }) {
  
    let hist = []; // history of commands
    let hIdx = -1; // -1 = live buffer
    let awaitingProgramInput = false;
    let inputStartCol = 0; // column where program input begins
    let currentLine = ''; // current line content
    let cursorPos = 0; // cursor position in current command

    // ------------------------ UTILITIES ------------------------
    function setCurrentLine(line) {
        currentLine = line;
        redrawLine();

        cursorPos = Math.min(cursorPos, line.length);
    }

    function redrawLine() {
        consoleOutput.hideCursor();
        
        if (awaitingProgramInput) {
            consoleOutput.moveCursorTo(inputStartCol + 1); // jump to the start of the input region
            consoleOutput.clearToLineEnd();
            consoleOutput.print(currentLine);
            consoleOutput.moveCursorTo(inputStartCol + cursorPos + 1);
        } else {
            consoleOutput.clearLineProtectPrompt();
            consoleOutput.print(currentLine);
            const back = currentLine.length - cursorPos;
            if (back > 0) consoleOutput.moveCursorLeft(back);
        }
        
        consoleOutput.showCursor();
    }

    function insertChar(char) {
        const before = currentLine.slice(0, cursorPos);
        const after = currentLine.slice(cursorPos);

        setCurrentLine(before + char + after);
        moveCursorRight();
    }

    function deleteChar() {
        if (cursorPos <= 0) return; // cant delete further

        const before = currentLine.slice(0, cursorPos - 1);
        const after = currentLine.slice(cursorPos);

        setCurrentLine(before + after);
        if (after.length > 0) moveCursorLeft();
        if (awaitingProgramInput && after.length === 0) consoleOutput.moveCursorLeft();
    }

    function moveCursorLeft(n = 1) {
        if (cursorPos === 0) return; // cant move left further

        cursorPos -= n;
        consoleOutput.moveCursorLeft(n);
    }
    function moveCursorRight(n = 1) {

        if (cursorPos >= currentLine.length) return; // cant move right further

        cursorPos += n;
        consoleOutput.moveCursorRight(n);
    }

    // ------------------------ COMMAND EXECUTION ------------------------
    function execCommand(line) {
        const raw = String(line || '').trim();
        const [cmd, ...rest] = raw.split(/\s+/);
        const c = (cmd || '').toLowerCase();
        const arg = rest.join(' ');

        consoleOutput.hideCursor();
        consoleOutput.clearLineProtectPrompt();
        consoleOutput.print('\x1b[32m');    // green color
        consoleOutput.print(`${c} ${arg}`);
        consoleOutput.println('\x1b[0m');     // reset color
        consoleOutput.showCursor();
    
        switch (c) {
            case 'help': {
                const output =
                    'run                  Execute the code currently in the editor. If the program needs input, type and press Enter.\r\n' +
                    'clear                Clear console\r\n' +
                    'format               Format the editor code\r\n' +
                    'tab <n>              Set editor tab size (0-8 spaces)\r\n' +
                    'font <px>            Set editor font size (6-38 px)\r\n' +
                    'mode <light|dark>    Switch overall UI between light and dark modes\r\n' +
                    'theme <name>         Change the editor color theme\r\n' +
                    'help                 Print this dialog\r\n\r\n';
                consoleOutput.println('\x1b[1mCommands:\x1b[0m'); // bold
                consoleOutput.println(output);
                break;
            }
    
            case 'run':
                consoleOutput.newline();
                runCtrl.run();
                return;
    
            case 'clear':
                consoleOutput.clear();
                break;
    
            case 'format': {
                try { editorApis.format(); } catch {}
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
                    if (themeCtrl.hasTheme(t).ok) consoleOutput.errln(`Did you mean 'theme ${t}'?`);

                }
                break;
            }
    
            case 'theme': {
                const name = (arg || '').trim().toLowerCase();
                if (!name) {
                    consoleOutput.errln('Usage: theme <name>');
                    break;
                }

                // get name of theme
                const themeResult = themeCtrl.hasTheme(name);
                if (!themeResult.ok) {
                    consoleOutput.errln('Error: Invalid theme');
                    if (name === 'light' || name === 'dark') consoleOutput.errln(`Did you mean 'mode ${name}'?`);
                    break;
                }

                themeCtrl.setEditorTheme(themeResult.bare);
                consoleOutput.println(`Theme: ${themeResult.name}`);

                break;
            }
    
            case '':
                // no output
                break;
            default:
                consoleOutput.errln(`Unknown command: ${cmd}`);
                break;
        }
        
        writePrompt();
    }
    
    // ------------------------ KEYBOARD INPUT ------------------------
    terminal.onData((data) => {

        // ignore all input except ctrl-c (stops program) when terminal is locked
        if (runCtrl.isTerminalLocked() && data !== '\u0003') return;

        if (awaitingProgramInput) {

            // INPUT mode
                   if (data === '\r') {                        // enter, submit input to program
                awaitingProgramInput = false;
                consoleOutput.newline();
                
                window.runCtrlProvideInput(currentLine);

                // reset everything
                setCurrentLine('');
                hIdx = -1;

            } else if (data === '\u0003') {                    // ctrl-c, abort program
                consoleOutput.newline();
                runCtrl.stop();
                awaitingProgramInput = false;

            } else if (data === '\u007F') deleteChar();        // backspace
              else if (data === '\u001b[C') moveCursorRight(); // right arrow
              else if (data === '\u001b[D') moveCursorLeft();  // left arrow
              else if (data.length === 1 && data >= ' ') {     // printable characters
                insertChar(data);      // data >= ' ' ensures the ASCII value is >= 32
            }
        } else {

            // shell mode
                   if (data === '\r') {                         // enter, execute command
                const line = currentLine
                if (line.trim()) hist.push(line);

                hIdx = -1;
                setCurrentLine('');

                execCommand(line);

            } else if (data === '\u0003') {                     // ctrl-c, abort program
                if (runCtrl.isRunning()) {
                    consoleOutput.newline();
                    runCtrl.stop();
                } else {
                    consoleOutput.hideCursor();
                    consoleOutput.newline();
                    writePrompt();
                    consoleOutput.showCursor();
                }
            } else if (data === '\u007F') deleteChar();         // backspace
              else if (data === '\u001b[A') {                   // up arrow
                if (!hist.length) return;
                if (hIdx === -1) hIdx = hist.length - 1; else hIdx = Math.max(0, hIdx - 1);
                const line = hist[hIdx] || '';
                setCurrentLine(line);
                cursorPos = line.length;
                redrawLine();

            } else if (data === '\u001b[B') {                   // down arrow
                if (!hist.length) return;

                if (hIdx === -1) {
                    setCurrentLine('');
                    cursorPos = 0;
                    redrawLine();
                    return;
                }

                hIdx = Math.min(hist.length, hIdx + 1);
                const line = (hIdx === hist.length) ? '' : (hist[hIdx] || '');

                setCurrentLine(line);
                redrawLine();

            } else if (data === '\u001b[C') moveCursorRight();  // right arrow
              else if (data === '\u001b[D') moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {      // printable characters
                insertChar(data);        // data >= ' ' ensures the ASCII value is >= 32
            }
        }

    });

    // ------------------------ GETTERS & SETTERS ------------------------
    async function setAwaitingInput(v) {
        awaitingProgramInput = !!v;

        if (awaitingProgramInput) {

            // record start of input region
            const buf = terminal?.buffer?.active;
            await new Promise(resolve => setTimeout(resolve, 5)); // delay since printing takes time
            inputStartCol = (buf && typeof buf.cursorX === 'number') ? buf.cursorX : 0;

            // start fresh editable buffer
            currentLine = '';
            cursorPos = 0;

            // ensure caret is placed after the inline prompt and buffer area is clean
            redrawLine();
        }
    }
    function isAwaitingInput() { return awaitingProgramInput; }
    function focus() { terminal.focus(); }

    return { setAwaitingInput, isAwaitingInput, focus, execCommand };
}
  