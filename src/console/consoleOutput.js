export function initConsoleOutput(console) {

    const write = (text, color = null) => {
        if (color) console.write(`\x1b[${color}m${text}\x1b[0m`);
        else       console.write(text);
    };
    const writePrompt = () => {
        write('% ', document.documentElement.classList.contains('light') ? '90' : '38;5;248');
    };

    // on event - notify catchError.js
    const setLastIdeError = (text) => {
        try { window.__lastIDEError = String(text); } catch {}
        try { window.dispatchEvent(new CustomEvent("ide-console", { detail: { type: 'error', text } })); } catch {}
    };
    const setLastIDEWarning = (text) => {
        try { window.__lastIDEWarning = String(text); } catch {}
        try { window.dispatchEvent(new CustomEvent("ide-console", { detail: { type: 'warning', text } })); } catch {}
    };

    // functions
    return {

        newline: () => write('\r\n'),

        // print
        print:     (t = '', color = null) => write(t, color),
        println:   (t = '', color = null) => write(`${t}\r\n`, color),
        lnprint:   (t = '', color = null) => write(`\r\n${t}`, color),
        lnprintln: (t = '', color = null) => write(`\r\n${t}\r\n`, color),

        // error (red)
        err:       (t = '') => { setLastIdeError(t);   write(t,              '31'); },
        errln:     (t = '') => { setLastIdeError(t);   write(`${t}\r\n`,     '31'); },
        lnerr:     (t = '') => { setLastIdeError(t);   write(`\r\n${t}`,     '31'); },
        lnerrln:   (t = '') => { setLastIdeError(t);   write(`\r\n${t}\r\n`, '31'); },

        // warning (italics + yellow)
        warn:      (t = '') => { setLastIDEWarning(t); write(t,              '3;33'); },
        warnln:    (t = '') => { setLastIDEWarning(t); write(`${t}\r\n`,     '3;33'); },
        lnwarn:    (t = '') => { setLastIDEWarning(t); write(`\r\n${t}`,     '3;33'); },
        lnwarnln:  (t = '') => { setLastIDEWarning(t); write(`\r\n${t}\r\n`, '3;33'); },

        // clear line
        clear:          () => console.clear(),
        clearline:      () => write('\x1b[2K\r'),
        clearToLineEnd: () => write('\x1b[K'), // clears everything from cursor position to end of the line

        // cursor
        hideCursor:      ()      => write('\x1b[?25l'),
        showCursor:      ()      => write('\x1b[?25h'),
        moveCursorRight: (n = 1) => write('\x1b[' + n + 'C'),
        moveCursorLeft:  (n = 1) => write('\x1b[' + n + 'D'),
        moveCursorTo:    (n)     => {
            const cursorPos = console?.buffer?.active.cursorX;

                 if (cursorPos < n) write('\x1b[' + (n - cursorPos) + 'C');
            else if (cursorPos > n) write('\x1b[' + (cursorPos - n) + 'D');
        },

        writePrompt,
    };
}
