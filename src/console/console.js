export function initConsole({
    container,
    fontSize = 14,
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cursorBlink = true,
    cursorStyle = 'block',
} = {}) {

    // initialize xterm
    const xterm = new Terminal({ 
        fontSize,
        fontFamily,
        cursorBlink,
        cursorStyle,
        disableStdin: false,
        allowTransparency: false
    });
    xterm.open(container);
    xterm.focus();

    // dependencies provided later
    let deps = {
        consoleOutput: undefined,
        runCtrl: undefined,
        editorApis: undefined,
        themeCtrl: undefined,
        modeCtrl: undefined,
        cursor: undefined,
    };
    function setDeps(next) { deps = { ...deps, ...next }; }

    // awaiting input
    let awaitingInput = false;
    function setAwaitingInput(v) { awaitingInput = !!v; }
    function isAwaitingInput() { return awaitingInput; }

    // fit terminal to container size
    const FitCtor = window.FitAddon && window.FitAddon.FitAddon
    let fitAddon = new FitCtor();
    if (fitAddon) xterm.loadAddon(fitAddon);
    queueMicrotask(() => { // delay to ensure everything is applied to
        try { if (fitAddon) fitAddon.fit(); }
        catch {}
    });

    // ------------------------ Command Execution ------------------------
    async function execCommand(line) {
        const { consoleOutput, runCtrl, editorApis, themeCtrl, modeCtrl } = deps;
        if (!consoleOutput) return; // not ready yet

        const raw = String(line || '').trim();
        const [cmd, ...rest] = raw.split(/\s+/);
        const c = (cmd || '').toLowerCase();
        const arg = rest.join(' ');
        if (raw) hist.push(raw); // add to history

        if (c != 'clear') {
            consoleOutput.hideCursor();
            consoleOutput.clearline();
            consoleOutput.writePrompt();
            consoleOutput.println(`${c} ${arg}`, 32); // green color
            consoleOutput.showCursor();
        }
    
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
                if (!name) { consoleOutput.errln('Usage: theme <name>'); break; }

                // get theme name
                const themeResult = themeCtrl.themeInfo(name);
                if (!themeResult.ok) {
                    consoleOutput.errln('Error: Invalid theme');
                    if (name === 'light' || name === 'dark') consoleOutput.errln(`Did you mean 'mode ${name}'?`);
                    break;
                }

                await themeCtrl.setTheme(themeResult.bare);
                consoleOutput.println(`Theme: ${themeResult.name}`);
                break;
            }
                
            default: {
                if (c != '') consoleOutput.errln(`Unknown command: ${cmd}`);
                break;
            }
        }
        
        if (c != 'clear') consoleOutput.writePrompt();
    }

    // ------------------------ Keyboard Input ------------------------
    let hist = [];
    let hIdx = -1;
    
    xterm.onData (async (data) => {
        const { runCtrl, cursor, consoleOutput } = deps;
        if (!consoleOutput) return; // not ready yet

        // ignore all input except ctrl-c (stops program) when console is locked
        if (runCtrl.isConsoleLocked() && data !== '\u0003') return;

        if (awaitingInput) {   
            // INPUT mode
            if (data === '\r') {                                     // enter, submit input
                setAwaitingInput(false);
                consoleOutput.newline();
                
                window.runCtrlProvideInput(cursor.getLine());

                // reset
                cursor.reset();
                hIdx = -1;

            } else if (data === '\u0003') {                          // ctrl-c, abort program
                consoleOutput.newline();
                runCtrl.stop();
            } else if (data === '\u007F') cursor.deleteChar();         // backspace
              else if (data === '\u001b[C') cursor.moveCursorRight();  // right arrow
              else if (data === '\u001b[D') cursor.moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {           // printable characters
                cursor.insertChar(data);   // data >= ' ' ensures ASCII value is >= 32
            }
        } else {
            // shell mode
            if (data === '\r') {                                     // enter, execute command
                const origLine = cursor.getLine();

                hIdx = -1;
                await cursor.setLine('');

                execCommand(origLine);

            } else if (data === '\u0003') {                          // ctrl-c, abort program
                if (runCtrl.isRunning()) {
                    consoleOutput.newline();
                    runCtrl.stop();
                } else {
                    consoleOutput.hideCursor();
                    consoleOutput.newline();
                    consoleOutput.writePrompt();
                    consoleOutput.showCursor();
                }
            } else if (data === '\u007F') cursor.deleteChar();         // backspace
              else if (data === '\u001b[A') {                        // up arrow
                if (!hist.length) return;

                if (hIdx === -1) hIdx = hist.length - 1;
                else             hIdx = Math.max(0, hIdx - 1);

                const line = hist[hIdx] || '';

                await cursor.setLine(line);
                cursor.moveCursorRight(line.length - cursor.getCursorPos());

            } else if (data === '\u001b[B') {                        // down arrow
                if (!hist.length) return;

                if (hIdx === -1) { await cursor.setLine(''); return; }

                hIdx = Math.min(hist.length, hIdx + 1);
                const line = (hIdx === hist.length) ? '' : (hist[hIdx] || '');

                await cursor.setLine(line);
                cursor.moveCursorRight(line.length - cursor.getCursorPos());

            } else if (data === '\u001b[C') cursor.moveCursorRight();  // right arrow
              else if (data === '\u001b[D') cursor.moveCursorLeft();   // left arrow
              else if (data.length === 1 && data >= ' ') {           // printable characters
                cursor.insertChar(data);        // data >= ' ' ensures the ASCII value is >= 32
            }
        }
    });

    // ------------------------ Helpers/Utilities ------------------------
    const getline = () => {
        try {
            const buf = console?.buffer?.active;
            if (!buf) return '';
            
            const line = buf.getLine(buf.cursorY)?.translateToString(false) ?? '';
            return line;
        } catch {
            return '';
        }
    };

    const getConsoleText = ({ trim = true } = {}) => {
        const buf = console?.buffer?.active;
        if (!buf) return '';
      
        const lines = [];
        for (let i = 0; i < buf.length; i++) {
            const line = buf.getLine(i);
            if (!line) continue;
        
            // remove right padding
            const s = line.translateToString(true, 0, console.cols);
            lines.push(s);
        }
      
        const text = lines.join('\n');
        return trim ? text.trimEnd() : text;
    };

    function refit() { try { if (fitAddon) fitAddon.fit(); } catch {} }
    function dispose() { try { xterm.dispose(); } catch {} }

    return {
        console: xterm,
        getline,
        getConsoleText,
        refit,
        dispose,
        execCommand,
        setDeps,
        setAwaitingInput,
        isAwaitingInput,
        history: { get: () => hist.slice(), clear() { hist = []; hIdx = -1; } }
    };
}
