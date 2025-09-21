export function createRepl({ terminal, consoleOutput, writePrompt, runCtrl, editorApis, themeCtrl, modeCtrl }) {
    if (!terminal || !consoleOutput || !writePrompt || !runCtrl) {
        throw new Error('createRepl: terminal, consoleOutput, writePrompt, runCtrl required');
    }
  
    // ---- shell state ----
    let buf = '';
    let hist = [];
    let hIdx = -1; // -1 = live buffer
    let awaitingProgramInput = false;
    let cursorPos = 0; // cursor position in current command
  
    // ---- utilities ----
    function redrawLine() {
        consoleOutput.hideCursor();
        consoleOutput.clearline();
        writePrompt();
        consoleOutput.print(buf);

        // Move cursor to correct position
        if (cursorPos < buf.length) {
            consoleOutput.print('\x1b[' + (buf.length - cursorPos) + 'D');
        }
        
        consoleOutput.showCursor();
    }
  
    function setAwaitingInput(v) {
        awaitingProgramInput = !!v;
    }

    function moveCursorLeft() {
        if (cursorPos > 0) {
            cursorPos--;
            consoleOutput.print('\x1b[D');
        }
    }

    function moveCursorRight() {
        if (cursorPos < buf.length) {
            cursorPos++;
            consoleOutput.print('\x1b[C');
        }
    }
  
    // command execution
    function execCommand(line) {
        const raw = String(line || '').trim();
        const [cmd, ...rest] = raw.split(/\s+/);
        const c = (cmd || '').toLowerCase();
        const arg = rest.join(' ');

        consoleOutput.hideCursor();
        consoleOutput.clearline();
        writePrompt();
        consoleOutput.print('\x1b[32m');    // green color
        consoleOutput.print(`${c} ${arg}`);
        consoleOutput.println('\x1b[0m');   // reset color
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
                consoleOutput.println('\x1b[1mCommands:\x1b[0m');
                consoleOutput.println(output);
                break;
            }
    
            case 'run':
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
                    consoleOutput.println('Usage: theme <name>');
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
                consoleOutput.println(`Unknown command: ${cmd}`);
                break;
        }
    
        // For non-run commands, immediately show a fresh prompt
        writePrompt();
    }
    
    // keyboard input
    terminal.onData((data) => {

        // INPUT mode
        if (awaitingProgramInput) {
            if (data === '\r') {                 // submit input to program
                runCtrl.sendUserInput(buf);

                buf = '';
                hIdx = -1;
                cursorPos = 0;  // reset buffer, history index, and cursor
                
                setAwaitingInput(false);
            } else if (data === '\u0003') {      // ctrl-c, abort program
                runCtrl.stop();
                setAwaitingInput(false);
            } else if (data === '\u007F') {      // backspace
                if (cursorPos > 0) {
                    buf = buf.slice(0, cursorPos - 1) + buf.slice(cursorPos);
                    cursorPos--;
                    redrawLine();
                }
            } else if (data === '\u001b[D') {   // left arrow
                moveCursorLeft();
            } else if (data === '\u001b[C') {    // right arrow
                moveCursorRight();
            } else if (data.length === 1 && data >= ' ') { // printable characters
                buf = buf.slice(0, cursorPos) + data + buf.slice(cursorPos);
                cursorPos++;
                if (cursorPos === buf.length) {
                    consoleOutput.print(data);
                } else {
                    redrawLine();
                }
            }
            return;
        }

        // SHELL mode
        if (data === '\r') {                   // enter, submit command
            const line = buf;
            if (line.trim()) hist.push(line);

            hIdx = -1;
            buf = '';
            cursorPos = 0;

            execCommand(line);

        } else if (data === '\u007F') {        // backspace
            if (cursorPos > 0) {
                buf = buf.slice(0, cursorPos - 1) + buf.slice(cursorPos);
                cursorPos--;
                redrawLine();
            }

        } else if (data === '\u001b[A') {      // up
            if (!hist.length) return;
            if (hIdx === -1) hIdx = hist.length - 1; else hIdx = Math.max(0, hIdx - 1);
            buf = hist[hIdx] || '';
            cursorPos = buf.length;
            redrawLine();

        } else if (data === '\u001b[B') {      // down
            if (!hist.length) return;
            if (hIdx === -1) { buf = ''; cursorPos = 0; redrawLine(); return; }
            hIdx = Math.min(hist.length, hIdx + 1);
            buf = (hIdx === hist.length) ? '' : (hist[hIdx] || '');
            cursorPos = buf.length;
            redrawLine();

        } else if (data === '\u001b[D') {      // left arrow
            moveCursorLeft();

        } else if (data === '\u001b[C') {      // right arrow
            moveCursorRight();

        } else if (data === '\u0003') {        // ctrl-c
            if (runCtrl.isRunning()) {
                runCtrl.stop();
            } else {
                consoleOutput.newline();
                writePrompt();
            }

        } else if (data.length === 1 && data >= ' ') { // printable characters
            buf = buf.slice(0, cursorPos) + data + buf.slice(cursorPos);
            cursorPos++;
            if (cursorPos === buf.length) {
                consoleOutput.print(data);
            } else {
                redrawLine();
            }
        }
    });

    return { setAwaitingInput, execCommand };
}
  