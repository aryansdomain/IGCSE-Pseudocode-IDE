export function initConsole({
    container,
    fontSize = 14,
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cursorBlink = true,
    cursorStyle = 'block',
} = {}) {

    // initialize xterm
    const console = new Terminal({ 
        fontSize,
        fontFamily,
        cursorBlink,
        cursorStyle,
        disableStdin: false,
        allowTransparency: false
    });
    
    // fit terminal to container size
    const FitCtor = window.FitAddon && window.FitAddon.FitAddon
    let fitAddon = new FitCtor();

    if (fitAddon) console.loadAddon(fitAddon);
    console.open(container);
    queueMicrotask(() => { // delay to ensure everything is applied to
        try { if (fitAddon) fitAddon.fit(); }
        catch {}
    });
    
    // ensure console receives key events
    console.focus();


    // ------------------------ Helpers/API ------------------------
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
    
    function dispose() { try { console.dispose(); } catch {} }

    return { console, getline, getConsoleText, refit, dispose };
}
