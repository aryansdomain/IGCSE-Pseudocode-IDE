async function saveTextAsFile(filename, text) {
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

export function initDownload({
    consoleDownloadBtn,
    editorDownloadBtn,
    getCode,
    getConsoleText,
    consoleOutput,
    getActiveFileName
} = {}) {

    // download editor content
    const downloadEditor = async () => {
        try {
            const code = getCode();
            const filename = getActiveFileName();
            await saveTextAsFile(filename, code);
            
            // track code download analytics
            try {
                window.code_downloaded && window.code_downloaded({ code_downloaded_size: code.length });
            } catch {}
        } catch (err) {
            consoleOutput.lnerrln('Failed to download console content: ' + err + '. Please reload the page or report this issue.');
            consoleOutput.writePrompt();
        }
    };

    // download console content
    const downloadConsole = async () => {
        try {
            const text = getConsoleText();
            const filename = `console.txt`;
            await saveTextAsFile(filename, text);
            
            // track console download analytics
            try {
                window.console_downloaded && window.console_downloaded({ console_downloaded_size: text.length });
            } catch {}
        } catch (err) {
            consoleOutput.lnerrln('Failed to download console content: ' + err + '. Please reload the page or report this issue.');
            consoleOutput.writePrompt();
        }
    };

    // setup buttons
    consoleDownloadBtn.disabled = false;
    consoleDownloadBtn.addEventListener('click', downloadConsole);

    editorDownloadBtn.disabled = false;
    editorDownloadBtn.addEventListener('click', downloadEditor);

    return { downloadConsole, downloadEditor, };
}
