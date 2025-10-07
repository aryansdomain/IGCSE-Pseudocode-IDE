export function initCopy({ console, consoleCopyBtn, editorCopyBtn, getCode, getConsoleText, consoleOutput }) {

    // copy console content
    const copyConsole = async () => {
        try {
            const text = getConsoleText(console, { trim: true });
            await navigator.clipboard.writeText(text);

            // animate to finished state
            consoleCopyBtn.style.transition = 'background 0.3s, color 0.3s';
            consoleCopyBtn.style.background = 'var(--green-accent)';
            consoleCopyBtn.style.color = 'white';
            setTimeout(() => { consoleCopyBtn.style.background = ''; consoleCopyBtn.style.color = ''; }, 750);

        } catch (err) {
            consoleOutput.errln('Failed to copy console content: ' + err + '. Please reload the page or report this issue.');
        }
    };

    // copy editor content
    const copyEditor = async () => {
        try {
            const code = getCode();
            if (!code.trim()) return; // ignore empty files
            await navigator.clipboard.writeText(code);

            // animate to finished state
            editorCopyBtn.style.transition = 'background 0.3s, color 0.3s';
            editorCopyBtn.style.background = 'var(--green-accent)';
            editorCopyBtn.style.color = 'white';
            setTimeout(() => { editorCopyBtn.style.background = ''; editorCopyBtn.style.color = ''; }, 750);

        } catch (err) {
            consoleOutput.errln('Failed to copy editor content: ' + err + '. Please reload the page or report this issue.');
        }
    };

    // wire buttons
    consoleCopyBtn.disabled = false;
    consoleCopyBtn.addEventListener('click', copyConsole);

    editorCopyBtn.disabled = false;
    editorCopyBtn.addEventListener('click', copyEditor);

    return { copyConsole, copyEditor };
}
