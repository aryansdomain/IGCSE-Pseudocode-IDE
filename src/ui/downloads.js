export async function saveTextAsFile(filename, text) {

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();
    a.remove();
    URL.revokeObjectURL(url);

}

export function readTerminalText(terminal, { trim = false } = {}) {
    let out = '';
    const buf = terminal?.buffer?.active;
    if (!buf) return out;
    for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i)?.translateToString() ?? '';
        out += line + '\n';
    }
    return trim ? out.trim() : out;
}

// download editor contents
export function initEditorDownloads({ getCode, button, filenamePrefix = 'code' }) {
    if (!button || typeof getCode !== 'function') return { destroy(){} };

    const onClick = async () => {
        const code = getCode();
        if (!code.trim()) return; // ignore empty files
        const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `${filenamePrefix}_${ts}.txt`;
        await saveTextAsFile(filename, code);
    };
    button.disabled = false;
    button.addEventListener('click', onClick);

    return { destroy: () => button.removeEventListener('click', onClick) };
}

// copy OR download the visible console buffer
export function initConsoleDownloads({ terminal, copyBtn, downloadBtn, consoleOutput }) {
    const handlers = [];

    if (copyBtn) {
        const onCopy = async () => {
            try {
                const text = readTerminalText(terminal, { trim: true });
                await navigator.clipboard.writeText(text);

                // animate to finished state
                copyBtn.style.transition = 'background 0.3s, color 0.3s';
                copyBtn.style.background = 'var(--green-accent)';
                copyBtn.style.color = 'white';
                setTimeout(() => { copyBtn.style.background = ''; copyBtn.style.color = ''; }, 750);

            } catch (err) {
                consoleOutput?.errln?.('Failed to copy to clipboard. ' + err);
            }
        };
        copyBtn.disabled = false;
        copyBtn.addEventListener('click', onCopy);
        handlers.push(() => copyBtn.removeEventListener('click', onCopy));
    }

    if (downloadBtn) {
        const onDownload = async () => {
            const text = readTerminalText(terminal);
            const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `console_${ts}.txt`;
            await saveTextAsFile(filename, text);
        };
        downloadBtn.disabled = false;
        downloadBtn.addEventListener('click', onDownload);
        handlers.push(() => downloadBtn.removeEventListener('click', onDownload));
    }

    return { destroy: () => handlers.forEach(fn => fn()) };
}
