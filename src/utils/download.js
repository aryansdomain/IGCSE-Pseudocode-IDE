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

function formatISO(date = new Date(), { compact = false } = {}) {
    const d = (date instanceof Date) ? date : new Date(date);
    const iso = d.toISOString(); // e.g. 2025-09-20T12:34:56.789Z
    if (!compact) return iso;
    // compact: 2025-09-20_12-34-56
    return iso.slice(0, 19).replace('T', '_').replaceAll(':', '-');
}

export function initDownload({consoleDownloadBtn, editorDownloadBtn, getCode, getConsoleText, consoleOutput }) {

    // download console content
    const downloadConsole = async () => {
        try {
            const text = getConsoleText();
            const filename = `console_${formatISO(new Date(), { compact: true })}.txt`;
            await saveTextAsFile(filename, text);
            
            // track console download analytics
            try {
                window.console_downloaded && window.console_downloaded({
                    file_format: 'txt',
                    console_size: text.length
                });
            } catch {}
        } catch (err) {
            consoleOutput.errln('Failed to download console content: ' + err + '. Please reload the page or report this issue.');
        }
    };

    // download editor content
    const downloadEditor = async () => {
        try {
            const code = getCode();
            const filename = `code_${formatISO(new Date(), { compact: true })}.txt`;
            await saveTextAsFile(filename, code);
            
            // track code download analytics
            try {
                window.code_downloaded && window.code_downloaded({
                    file_format: 'txt',
                    code_size: code.length
                });
            } catch {}
        } catch (err) {
            consoleOutput.errln('Failed to download editor content: ' + err + '. Please reload the page or report this issue.');
        }
    };

    // wire buttons
    consoleDownloadBtn.disabled = false;
    consoleDownloadBtn.addEventListener('click', downloadConsole);

    editorDownloadBtn.disabled = false;
    editorDownloadBtn.addEventListener('click', downloadEditor);

    return { downloadConsole, downloadEditor, };
}
