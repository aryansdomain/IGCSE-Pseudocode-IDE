import { runCode, removeComments } from './execute.js';
import { globalScope, initScope }  from './scope.js';
import { getProcFuncs }            from './procsFuncs.js';
import { initError }               from './error.js';

export async function interpret(code) {

    // ------------------------ Init ------------------------

    const linesWithComments = code
        .split(/\r?\n/)                                                                // split by newlines
        .map((text, i) => ({ lineNum: i + 1, text: text.trim() }));                    // add line number
    const lines = linesWithComments.filter(({ text }) => removeComments(text).trim()); // do not consider only commented/empty lines

    initError(linesWithComments); // error.js
    initScope();                  // scope.js

    // ------------------------ Execute ------------------------

    getProcFuncs(lines); // extract proc/func bodies
    await runCode(globalScope, lines, false);
}
