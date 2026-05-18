self.window = self;

import { interpret } from './interpreter/interpreter.js';

let currentResolve = null;
self.readInput = () => {
    // await a Promise - set the resolve function (finishes the Promise) to currentResolve
    self.postMessage({ type: 'input' });                                            //
    return new Promise((resolve) => { currentResolve = resolve; });              //
};                                                                            //
                                                                            //
self.onmessage = async (e) => {                                          //
    const msg = e.data || {};                                         //
                                                                    //
    // response to input request                                 //
    // call the resolve function for that Promise, sending the readInput back
    if (msg.type === 'input' && msg.line != null && currentResolve) {
        const resolve = currentResolve;
        currentResolve = null;
        resolve(String(msg.line));
        return;
    }

    // run
    if (msg.type === 'run') {
        try {
            await interpret(msg.code);
            self.postMessage({ type: 'done' });
        } catch (e) {
            if (e.formatted) {
                self.postMessage({
                    type:      'error',
                    formatted: e.formatted,
                    lineNum:   e.lineNum,
                    column:    e.col,
                    len:       e.len,
                    errorType: e.type,
                    code:      e.code
                });
            } else { // JS error
                self.postMessage({
                    type: 'error',
                    error: `${e?.message || String(e)}\nThis error is not properly formatted. Please report this bug.`
                });
            }
        }
    }
};
