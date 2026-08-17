import { throwErr, findPos, lines } from "./error.js";

export const files = {};

export function initFileHandling() {
    for (const k of Object.keys(files)) delete files[k];
}


// openfile
export async function openFile(name, mode, lineNum) {
    // already open
    if (files[name]) {
        const pos = findPos(lines[lineNum - 1]?.text, `"${name}"`);
        throwErr('FileError',
                 `file is already open`,
                 lineNum, pos.col, pos.len);
    }

    // get lines by posting a message to runCtrl
    self.postMessage({ type: 'file_get_lines', name });
    const fileLines = await new Promise((resolve) => {
        const handler = (e) => {
            if (e.data.type !== 'file_lines') return;
            self.removeEventListener('message', handler);
            resolve(e.data.lines);
        };
        self.addEventListener('message', handler);
    });

    // file doesnt exist
    if (fileLines === null) {
        const pos = findPos(lines[lineNum - 1]?.text, `"${name}"`);
        throwErr('FileError',
                 `file not found`,
                 lineNum, pos.col, pos.len);
    }

    // create file
    if (mode === 'READ') {
        files[name] = { name, mode: 'READ', lines: fileLines, cursor: 0 };
    } else {
        self.postMessage({ type: 'file_clear', name }); // clear
        files[name] = { name, mode: 'WRITE' };
    }
    return name;
}

// closefile
export function closeFile(id, name, lineNum) {
    const file = files[id];

    // file not open
    if (!file) {
        const pos = findPos(lines[lineNum - 1]?.text, `"${name}"`);
        throwErr('FileError',
                 `file is not open`,
                 lineNum, pos.col, pos.len);
    }

    delete files[id]; // destroy file
}

// readfile
export function readFile(id, name, lineNum) {
    const file = files[id];

    // errors
    const pos = findPos(lines[lineNum - 1]?.text, `"${name}"`);
    if (!file) { // not open
        throwErr('FileError',
                 `file is not open`,
                 lineNum, pos.col, pos.len);
    }
    if (file.mode !== 'READ') { // not opened for reading
        throwErr('FileError',
                 `file is not open for reading`,
                 lineNum, pos.col, pos.len);
    }
    if (file.cursor >= file.lines.length) { // reached eof
        throwErr('FileError',
                 `no more lines to read`,
                 lineNum, pos.col, pos.len);
    }

    return file.lines[file.cursor++]; // read
}

// writefile
export async function writeFile(id, name, line, lineNum) {
    const file = files[id];

    // errors
    const pos = findPos(lines[lineNum - 1]?.text, `"${name}"`);
    if (!file) {
        throwErr('FileError',
                 `file is not open`,
                 lineNum, pos.col, pos.len);
    }
    if (file.mode !== 'WRITE') {
        throwErr('FileError',
                 `file is not open for writing`,
                 lineNum, pos.col, pos.len);
    }

    self.postMessage({ type: 'file_write', file: file.name, line }); // write
}
