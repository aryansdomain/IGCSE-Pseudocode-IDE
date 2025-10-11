function showCopySuccess(button) {
    const icon = button.querySelector('i');
    if (!icon) return;
    
    const originalClass = icon.className;
    
    // scale down, transform into checkmark, scale back ups
    icon.style.transform = 'scale(0.6)';
    setTimeout(() => {
        icon.className = 'fa-solid fa-check';
        icon.style.transform = 'scale(1)';
    }, 150);
    
    // animate back to original after 2 seconds
    setTimeout(() => {
        icon.style.transform = 'scale(0.8)';
        
        setTimeout(() => {
            icon.className = originalClass;
            icon.style.transform = 'scale(1)';
        }, 150);

    }, 2000);
}

export function initCopy({ consoleCopyBtn, editorCopyBtn, getCode, getConsoleText, consoleOutput }) {

    // copy console content
    const copyConsole = async () => {
        try {
            const text = getConsoleText({ trim: true });
            await navigator.clipboard.writeText(text);
            console.log('text: ');
            console.log(text);

            // show success checkmark
            showCopySuccess(consoleCopyBtn);

            // track copy analytics
            window.console_copied && window.console_copied({ console_size: text.length });

        } catch (err) {
            consoleOutput.newline();
            consoleOutput.lnerrln('Failed to copy console content: ' + err + '. Please reload the page or report this issue.');
            consoleOutput.newline();
            consoleOutput.writePrompt();
        }
    };

    // copy editor content
    const copyEditor = async () => {
        try {
            const code = getCode();
            if (!code.trim()) return; // ignore empty files
            await navigator.clipboard.writeText(code);

            // show success checkmark
            showCopySuccess(editorCopyBtn);

            // track copy analytics
            window.code_copied && window.code_copied({ code_size: code.length });

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
