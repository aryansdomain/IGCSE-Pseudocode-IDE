export function createConsoleOutput(terminal) {
    const write = (text, color = null) => {
        if (color) terminal.write(`\x1b[${color}m${text}\x1b[0m`);
        else terminal.write(text);
    };

    return {

        // print
        print:     (t = '', c = null) => write(t, c),
        println:   (t = '', c = null) => write(`${t}\r\n`, c),
        lnprint:   (t = '', c = null) => write(`\r\n${t}`, c),
        lnprintln: (t = '', c = null) => write(`\r\n${t}\r\n`, c),

        // errors (red)
        err:     (t = '') => write(t, '31'),
        errln:   (t = '') => write(`${t}\r\n`, '31'),
        lnerr:   (t = '') => write(`\r\n${t}`, '31'),
        lnerrln: (t = '') => write(`\r\n${t}\r\n`, '31'),

        // warnings (italics + yellow)
        warn:     (t = '') => write(`\x1b[3m\x1b[33m${t}\x1b[0m`),
        warnln:   (t = '') => write(`\x1b[3m\x1b[33m${t}\x1b[0m\r\n`),
        lnwarn:   (t = '') => write(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m`),
        lnwarnln: (t = '') => write(`\r\n\x1b[3m\x1b[33m${t}\x1b[0m\r\n`),

        // utilities
        clear:      () => terminal.clear(),
        clearline:  () => write('\x1b[2K\r'),
        newline:    () => write('\r\n'),

        hideCursor: () => write('\x1b[?25l'),
        showCursor: () => write('\x1b[?25h'),
        
    };
}  