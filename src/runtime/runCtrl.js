export function initRunCtrl({
    cursor,
    consoleOutput,
    console,
    getline,
    getCode,
    workerPath = 'runner.js',
    onInputRequested = () => {},
    onStateChange = () => {},
    onLoadingChange = () => {},
} = {}) {

    // ------------------------------- Analytics Vars -------------------------------
    let code_executed_method = 'button';
    let startTime = 0; let code_executed_runtime = 0;
    let code_executed_size = 0;
    let code_executed_success = false;

    // ------------------------------- Runtime State -------------------------------
    let worker = null;
    let runId = 0;
    let isRunning = false;

    let __flushedPrefix = '';
    let outputStorage = [];
    let warningStorage = [];
    let hadFlushOutput = false;

    let consoleLocked = false;
    let loadingTimer = null;
    const setLoading = (v) => { try { onLoadingChange(!!v); } catch {} };

    const clearLoadingTimer = () => {
        if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    };

    function finishRun(localRunId) {
        if (localRunId !== runId) return;  // if run is stale

        isRunning = false;
        onStateChange(false);
        clearLoadingTimer();
        setLoading(false);

        try { worker && worker.terminate(); } catch {}
        worker = null;

        consoleOutput.newline();
        consoleOutput.writePrompt();

        // record analytics
        try {
            window.code_executed && window.code_executed({
                code_executed_method,
                code_executed_runtime,
                code_executed_size,
                code_executed_success,
            });
        } catch {}
    }

    // process execution results
    function attachWorkerHandlers(localRunId) {
        worker.onmessage = (e) => {
            const { type } = e.data;

            if (type === 'flush') {

                // flush all output
                const s = String(e.data.output || '');
                const newPart = s.startsWith(__flushedPrefix) ? s.slice(__flushedPrefix.length) : s;
                __flushedPrefix += newPart;
                if (newPart.length) hadFlushOutput = true;
                outputStorage.push(newPart);

            } else if (type === 'warning') {
                const msg = (e.data && (e.data.message ?? e.data.text)) || '';
                if (msg) warningStorage.push(msg);

            } else if (type === 'input_request') {

                // switch to input mode
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // print pending stuff
                if (warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }
                if (outputStorage.length) {
                    const combined = outputStorage.join('');
                    const parts = combined.split('\n');
                    parts.forEach((line, idx) => {
                        if (idx !== parts.length - 1) consoleOutput.println(line);
                        else consoleOutput.print(line);
                    });
                    outputStorage = [];
                }

                // after waiting a frame, set input start column
                const defer = (fn) =>
                    (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(fn) : setTimeout(fn, 0);
                defer(() => {
                    const col = console?.buffer?.active?.cursorX || 0;
                    try { cursor?.setInputStartCol(col); } catch {}
                });

                onInputRequested();

            } else if (type === 'done') {
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // print warnings
                if (warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }

                const combinedFromFlush = outputStorage.join('');
                const combined = combinedFromFlush.length
                    ? combinedFromFlush
                    : String(e.data.output || '');
                outputStorage = [];

                if (combined.length) {
                    const parts = combined.split('\n');
                    parts.forEach(line => consoleOutput.println(line));
                }

                // set analytics vars
                code_executed_runtime = performance.now() - startTime;
                code_executed_success = true;

                finishRun(localRunId);

            } else if (type === 'stopped') {
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // set analytics vars
                code_executed_runtime = performance.now() - startTime;
                code_executed_success = false;

                finishRun(localRunId);

            } else if (type === 'error') {
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // set analytics vars
                code_executed_runtime = performance.now() - startTime;
                code_executed_success = false;

                // output error
                let line = getline().replace(/\s+$/, '');
                if (line.length > 0) consoleOutput.newline();
                consoleOutput.errln(String(e.data.error || 'Unknown error'));

                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            consoleLocked = false;
            clearLoadingTimer();
            setLoading(false);
            
            // set analytics vars
            code_executed_runtime = performance.now() - startTime;
            code_executed_success = false;
            
            consoleOutput.errln(`Worker error: ${e.message || e.filename || 'unknown'}`);
            consoleOutput.errln(`Please reload the page.`);
            finishRun(localRunId);
        };
    }

    function run(method = 'button') {
        if (isRunning) return;
        isRunning = true;
        consoleLocked = true;

        // set analytics vars
        code_executed_method = method
        startTime = performance.now(); code_executed_runtime = 0;
        code_executed_size = (typeof getCode === 'function' ? (getCode() || '').length : 0);
        code_executed_success = false;

        const localRunId = ++runId;

        __flushedPrefix = '';
        outputStorage = [];
        warningStorage = [];
        hadFlushOutput = false;

        worker = new Worker(workerPath);
        attachWorkerHandlers(localRunId);

        worker.postMessage({ type: 'run', code: getCode() });
        
        // change run button to "Stop" after a delay
        setTimeout(() => {
            if (isRunning && localRunId === runId) {
                onStateChange(true);
            }
        }, 100);
        
        // show loading bar after a delay
        loadingTimer = setTimeout(() => {
            if (isRunning && localRunId === runId && !hadFlushOutput) {
                setLoading(true);
            }
        }, 100);
    }

    function stop() {
        if (!isRunning || !worker) {
            consoleOutput.errln('No running execution to stop');
            return;
        }

        let line = getline().replace(/\s+$/, '');
        if (line.length > 0) consoleOutput.newline();
        consoleOutput.errln('Execution stopped');

        try { worker.postMessage({ type: 'stop' }); } catch {}
        try { worker.terminate(); } catch {}
        worker = null;
        consoleLocked = false;
        clearLoadingTimer();
        setLoading(false);
        cursor.reset();

        finishRun(runId);
    }

    function provideInput(line) {
        consoleLocked = true; // lock while program runs

        worker.postMessage({ type: 'input_response', data: String(line) });
        
        // show loading bar after a delay after input
        loadingTimer = setTimeout(() => {
            if (isRunning) setLoading(true);
        }, 75);
    }

    window.runCtrlProvideInput = provideInput;
    function setCursor(newCursor) { cursor = newCursor; }

    return { run, stop, provideInput, isRunning: () => isRunning, isConsoleLocked: () => consoleLocked, setCursor };
}