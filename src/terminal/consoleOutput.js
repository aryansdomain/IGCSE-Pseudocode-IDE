export function createConsoleOutput(terminal, getline) {
    
    const write = (text, color = null) => {
        if (color) terminal.write(`\x1b[${color}m${text}\x1b[0m`);
              else terminal.write(text);
    };

    // on event - notify issueReport.js
    const notify = (type, text) => {
        try {
            window.dispatchEvent(new CustomEvent("ide-console", { detail: { type, text } }));
        } catch {}
    };
    const setLastIdeError = (text) => {
        try { window.__lastIDEError = String(text); } catch {}
    };
    const setLastIDEWarning = (text) => {
        try { window.__lastIDEWarning = String(text); } catch {}
    };

    return {

        newline: () => write('\r\n'),

        // print
        print:     (t = '', c = null) => write(t, c),
        println:   (t = '', c = null) => write(`${t}\r\n`, c),
        lnprint:   (t = '', c = null) => write(`\r\n${t}`, c),
        lnprintln: (t = '', c = null) => write(`\r\n${t}\r\n`, c),

        // error (red)
        err:     (t = '') => { setLastIdeError(t); notify('error', t); write(t, '31'); },
        errln:   (t = '') => { setLastIdeError(t); notify('error', t); write(`${t}\r\n`, '31'); },
        lnerr:   (t = '') => { setLastIdeError(t); notify('error', t); write(`\r\n${t}`, '31'); },
        lnerrln: (t = '') => { setLastIdeError(t); notify('error', t); write(`\r\n${t}\r\n`, '31'); },

        // warning (italics + yellow)
        warn:     (t = '') => { setLastIDEWarning(t); notify('warning', t); write(`\x1b[3m\x1b[33m${t}\x1b[0m`); },
        warnln:   (t = '') => { setLastIDEWarning(t); notify('warning', t); write(`\x1b[3m\x1b[33m${t}\x1b[0m\r\n`); },
        lnwarn:   (t = '') => { setLastIDEWarning(t); notify('warning', t); write(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m`); },
        lnwarnln: (t = '') => { setLastIDEWarning(t); notify('warning', t); write(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m\r\n`); },

        // clear line
        clear:          () => terminal.clear(),
        clearline:      () => write('\x1b[2K\r'),
        clearToLineEnd: () => write('\x1b[K'), // clears everything from cursor position to end of the line

        // TODO: fix this bug
        // if the code is just "INPUT x" without any output
        // then input will be asked for from an empty line
        // then user can type "% " and therefore the line will start with "% "
        // so it will stop deleting at the user-typed "% "
        clearLineProtectPrompt: () => {
            try {
                if (!terminal?.buffer?.active) { write('\x1b[2K\r'); return; }
                
                const hadPrompt = getline().startsWith('%');

                write('\x1b[2K\r'); // clear line
                if (hadPrompt) write('% ', '90'); // if line had prompt, restore it
            } catch {
                write('\x1b[2K\r');
            }
        },

        // cursor utilities
        hideCursor:      ()      => write('\x1b[?25l'),
        showCursor:      ()      => write('\x1b[?25h'),
        moveCursorRight: (n = 1) => write('\x1b[' + n + 'C'),
        moveCursorLeft:  (n = 1) => write('\x1b[' + n + 'D'),
        moveCursorTo:    (n) =>     write('\x1b[' + n + 'G'),

        writePrompt: () => write('% ', '90')

    };
}
