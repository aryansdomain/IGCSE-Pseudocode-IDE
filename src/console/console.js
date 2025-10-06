export function initConsole({
    container,
    fontSize = 14,
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cursorBlink = true,
    cursorStyle = 'block',
} = {}) {

    const console = new Terminal({ 
        fontSize, 
        fontFamily, 
        cursorBlink, 
        cursorStyle,
        disableStdin: false,
        allowTransparency: false
    });
    
    // fitaddon
    let fitAddon = null;
    try {
        const FitCtor = (window.FitAddon && window.FitAddon.FitAddon) || FitAddon;
        fitAddon = new FitCtor();
    } catch (err) {
        console.warn('FitAddon not available:', err);
    }

    if (fitAddon) console.loadAddon(fitAddon);
    console.open(container);
    
    // Focus the console to ensure it receives key events
    console.focus();

    // initial fit
    queueMicrotask(() => { try { if (fitAddon) fitAddon.fit(); } catch {} });

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

    function refit() { try { if (fitAddon) fitAddon.fit(); } catch {} }
    function dispose() { try { console.dispose(); } catch {} }

    return { console, getline, refit, dispose };
}
