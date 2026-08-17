import { files, initFileHandling } from './fileHandling.js';
import { runCode, removeComments } from './execute.js';
import { globalScope, initScope }  from './scope.js';
import { initError, throwErr }     from './error.js';
import { getStringInputs }         from '../../../shared/infer.js';
import { getProcFuncs }            from './procsFuncs.js';

export async function interpret(code) {
    // init
    const linesWithComments = code
        .split(/\r?\n/)                                                                // split by newlines
        .map((text, i) => ({ lineNum: i + 1, text: text.trim() }));                    // add line number
    const lines = linesWithComments.filter(({ text }) => removeComments(text).trim()); // do not consider only commented/empty lines

    initError(linesWithComments); // error.js
    initScope();                  // scope.js
    initFileHandling()            // fileHandling.js

    // run
    getProcFuncs(lines); // extract proc/func bodies

    // pre-declare string inputted variables
    const stringInputs = getStringInputs(lines.map(({ text }) => removeComments(text)));
    if (stringInputs.length) {
        const declares = stringInputs.map((name, i) => ({ lineNum: 0, text: `DECLARE ${name} : STRING` }));
        await runCode(globalScope, declares, false);
    }

    // run
    await runCode(globalScope, lines, false);

    // check for unclosed files
    for (const file of Object.values(files)) {
        const lastLine = linesWithComments.length;
        throwErr('FileError',
                 `file ${file.name} was not closed`);
    }
}
