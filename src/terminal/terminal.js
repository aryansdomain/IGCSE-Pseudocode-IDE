export function initTerminal({
    container,
    fontSize = 14,
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cursorBlink = true,
    cursorStyle = 'block',
} = {}) {
    if (!container) throw new Error('initTerminal: container is required');

    const terminal = new Terminal({ 
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

    if (fitAddon) {
        terminal.loadAddon(fitAddon);
    }
    terminal.open(container);
    
    // Focus the terminal to ensure it receives key events
    terminal.focus();

    // initial fit
    queueMicrotask(() => { try { if (fitAddon) fitAddon.fit(); } catch {} });

    const writePrompt = () => terminal.write('\x1b[90m% \x1b[0m'); // muted gray "% "

    function refit() { try { if (fitAddon) fitAddon.fit(); } catch {} }
    function dispose() { try { terminal.dispose(); } catch {} }

    return { terminal, writePrompt, refit, dispose };
}
