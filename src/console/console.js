export function initConsole({
    container,
    fontSize = 14,
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cursorBlink = true,
    cursorStyle = 'block',
    onAwaitingInputChange = () => {}
} = {}) {

    // initialize xterm
    const xterm = new Terminal({
        fontSize,
        fontFamily,
        cursorBlink,
        cursorStyle,
        disableStdin: false,
        allowTransparency: false,
        scrollback: 1000,
        wordWrap: true
    });
    xterm.open(container);
    xterm.focus();

    // dependencies provided later
    let deps = {
        consoleOutput: undefined,
        runCtrl:       undefined,
        editor:        undefined,
        themeCtrl:     undefined,
        modeCtrl:      undefined,
        cursor:        undefined,
        files:         undefined
    };
    function setDeps(next) { deps = { ...deps, ...next }; }

    // awaiting input
    let awaitingInput = false;
    function setAwaitingInput(v) {
        awaitingInput = v;
        try { onAwaitingInputChange(awaitingInput); } catch {}
    }
    function isAwaitingInput() { return awaitingInput; }

    // fit terminal to container size
    const FitCtor = window.FitAddon && window.FitAddon.FitAddon;
    let fitAddon = new FitCtor();
    if (fitAddon) xterm.loadAddon(fitAddon);
    queueMicrotask(() => { // delay to ensure everything is applied to
        try { if (fitAddon) fitAddon.fit(); }
        catch {}
    });

    // ------------------------ Command Execution ------------------------

    async function execCommand(line) {
        const { consoleOutput, runCtrl, editor, themeCtrl, modeCtrl, files } = deps;
        if (!consoleOutput) return; // not ready yet

        if (!line || !line.trim()) return; // no content
        const [cmdCS, ...other] = line.split(/\s+/);
        const cmd = cmdCS.toLowerCase();
        const arg = other.join(' ');
        hist.push(line); // add to history

        if (cmd !== 'clear') {
            consoleOutput.hideCursor();
            consoleOutput.clearline();
            consoleOutput.writePrompt();
            consoleOutput.println(`${cmd} ${arg}`, 32); // green color
            consoleOutput.showCursor();
        }

        switch (cmd) {
            case 'help': {
                const output =
                    '\x1b[32mrun               \x1b[0m  Execute the code in the editor. If the program needs input, type and press Enter.\r\n' +
                    '\x1b[32mclear             \x1b[0m  Clear console                                                                    \r\n' +
                    '\x1b[32mformat            \x1b[0m  Format the editor code                                                           \r\n' +
                    '\x1b[32mtab <n>           \x1b[0m  Set editor tab size (0-8 spaces)                                                 \r\n' +
                    '\x1b[32mfont <px>         \x1b[0m  Set editor font size (6-38 px)                                                   \r\n' +
                    '\x1b[32mmode <light|dark> \x1b[0m  Switch overall UI between light and dark modes                                   \r\n' +
                    '\x1b[32mtheme <name>      \x1b[0m  Change the editor color theme                                                    \r\n' +
                    '\x1b[32mrename <old> <new>\x1b[0m  Rename a file                                                                    \r\n' +
                    '\x1b[32mhelp              \x1b[0m  Print this list                                                                  \r\n';
                consoleOutput.lnprintln('Commands:', 1); // bold
                consoleOutput.println(output);
                break;
            }

            case 'run': {
                runCtrl.run('console');
                return;
            }

            case 'clear': {
                consoleOutput.clear();
                break;
            }

            case 'format': {
                editor.formatCode();
                consoleOutput.println('Formatted.');
                break;
            }

            case 'tab': {
                const n = parseInt(arg, 10);
                if (!arg || Number.isNaN(n) || n < 0 || n > 8) {
                    consoleOutput.errln('Usage: tab <0-8 spaces>');
                    break;
                }

                editor?.setTab?.(n);
                consoleOutput.println(`Tab spaces: ${n}`);

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

                editor?.setFontSize?.(n);
                consoleOutput.println(`Font size: ${n}`);
                break;
            }

            case 'mode': {
                const mode = arg.toLowerCase();
                if (mode === 'light' || mode === 'dark') {
                    if (modeCtrl && typeof modeCtrl.setMode === 'function') modeCtrl.setMode(mode);
                    else if (editor?.setMode) editor.setMode(mode);
                } else {
                    consoleOutput.errln('Usage: mode <light|dark>');
                    if (themeCtrl.themeInfo(mode).ok) consoleOutput.errln(`Did you mean 'theme ${mode}'?`);
                }
                break;
            }

            case 'theme': {
                const theme = arg.trim().toLowerCase();
                if (!theme) { consoleOutput.errln('Usage: theme <name>'); break; }

                // get theme name
                const themeResult = themeCtrl.themeInfo(theme);
                if (!themeResult.ok) {
                    consoleOutput.errln('Error: Invalid theme');
                    if (theme === 'light' || theme === 'dark') consoleOutput.errln(`Did you mean 'mode ${theme}'?`);
                    break;
                }

                await themeCtrl.setTheme(themeResult.bare);
                break;
            }

            case 'rename': {
                const parts = arg.split(/\s+/);
                if (parts.length !== 2) {
                    consoleOutput.errln('Usage: rename <old> <new>');
                    break;
                }

                const result = files?.renameFile(parts[0], parts[1]); // rename
                if (!result.ok) { consoleOutput.errln(result.error); break; } // error
                break;
            }

            default: {
                if (cmd !== '') consoleOutput.errln(`Unknown command: ${cmd}`);
                break;
            }
        }

        if (cmd !== 'clear') consoleOutput.writePrompt();
    }

    // ------------------------ Keyboard Input ------------------------

    let hist = [];
    let histLoc = -1;

    xterm.onData (async (data) => {
        const { runCtrl, cursor, consoleOutput } = deps;
        if (!consoleOutput) return; // not ready yet

        // ignore all input except ctrl-c (stops program) when console is locked
        if (runCtrl.isConsoleLocked() && data !== '\u0003') return;


        if (awaitingInput) {
            // input mode
            if (data === '\r') {                                       // enter, submit input
                setAwaitingInput(false);

                window.runCtrlProvideInput(cursor.getLine());

                // reset
                cursor.reset();
                histLoc = -1;

            } else if (data === '\u0003') {                            // ctrl-c, stop program
                consoleOutput.ln();
                runCtrl.stop();
            } else if (data === '\u007F') cursor.deleteChar();         // backspace
              else if (data === '\u001b[C') cursor.moveCursorRight();  // right arrow
              else if (data === '\u001b[D') cursor.moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {             // printable characters
                cursor.insertChar(data); // data >= ' ' ensures ASCII value is >= 32
            }
        } else {
            // shell mode
            if (data === '\r') {                                       // enter, execute command
                const origLine = cursor.getLine();

                histLoc = -1;
                await cursor.setLine('');

                await execCommand(origLine);
            } else if (data === '\u0003') {                            // ctrl-c, stop program
                if (runCtrl.isRunning()) {
                    consoleOutput.ln();
                    runCtrl.stop();
                } else {
                    consoleOutput.hideCursor();
                    consoleOutput.ln();
                    consoleOutput.writePrompt();
                    consoleOutput.showCursor();
                }
            } else if (data === '\u007F') cursor.deleteChar();         // backspace
              else if (data === '\u001b[A') {                          // up arrow
                if (!hist.length) return;

                if (histLoc === -1) histLoc = hist.length - 1;
                else               histLoc = Math.max(0, histLoc - 1);

                const line = hist[histLoc] || '';

                await cursor.setLine(line);
                cursor.moveCursorRight(line.length - cursor.getCursorPos());

            } else if (data === '\u001b[B') {                          // down arrow
                if (!hist.length) return;

                if (histLoc === -1) { await cursor.setLine(''); return; }

                histLoc = Math.min(hist.length, histLoc + 1);
                const line = (histLoc === hist.length) ? '' : (hist[histLoc] || '');

                await cursor.setLine(line);
                cursor.moveCursorRight(line.length - cursor.getCursorPos());

            } else if (data === '\u001b[C') cursor.moveCursorRight();  // right arrow
              else if (data === '\u001b[D') cursor.moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {             // printable characters
                cursor.insertChar(data);  // ^^^^^^^^^^^ ensures ASCII value >= 32
            }
        }
    });

    // ------------------------ Helpers/Utilities ------------------------

    const getline = () => {
        try {
            const buffer = xterm?.buffer?.active;
            if (!buffer) return '';

            const line = buffer.getLine(buffer.cursorY)?.translateToString(false) ?? '';
            return line;
        } catch {
            return '';
        }
    };

    const getConsoleText = ({ trim = true } = {}) => {
        const buffer = xterm?.buffer?.active;
        if (!buffer) return '';

        const lines = [];
        for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (!line) continue;

            // remove right padding
            const s = line.translateToString(true, 0, xterm.cols);
            lines.push(s);
        }

        const text = lines.join('\n');
        return trim ? text.trimEnd() : text;
    };

    return {
        console: xterm,
        getline, getConsoleText,
        refit: () => { if (fitAddon) fitAddon.fit(); },
        execCommand,
        setDeps,
        setAwaitingInput, isAwaitingInput
    };
}
