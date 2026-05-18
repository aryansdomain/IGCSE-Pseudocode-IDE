export function initRun({
    console, consoleOutput, cursor,
    getline, getCode,
    workerPath = 'runner.js',
    files = null,
    onInputRequested = () => {},
    onInputEnd       = () => {},
    onStateChange    = () => {},
    onLoadingChange  = () => {}
} = {}) {

    // ------------------------ Analytics Vars ------------------------

    let code_executed_method = 'button';
    let code_executed_runtime = 0; let startTime = 0;
    let code_executed_size = 0;
    let code_executed_success = false;

    // ------------------------ Runtime State ------------------------

    let worker = null;
    let runId = 0;
    let isRunning = false;

    let consoleLocked = false;
    let loadingTimer = null;
    let alreadyOutput = false;

    function setLoading(v) {
        try { onLoadingChange(!!v); } catch {}
    };
    function clearLoadingTimer() {
        if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    };

    function finishRun(localRunId) {
        if (localRunId !== runId) return;  // if run is stale

        isRunning = false;
        consoleLocked = false;
        onStateChange(false);
        clearLoadingTimer();
        setLoading(false);
        onInputEnd();
        cursor.reset();

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
                code_executed_success
            });
        } catch {}
    }

    function outputError(formatted) {
        let line = getline().replace(/\s+$/, '');
        if (line.length > 0) consoleOutput.newline();

        const lines = String(formatted).trimEnd().split('\n');
        lines.forEach((line, index) => {
            if (index !== lines.length - 1) consoleOutput.errln(line);
            else                            consoleOutput.err(line);
        });

        try { window.__lastIDEError = String(formatted).trimEnd(); } catch {}
    }

    // process execution results
    function attachWorkerHandlers(localRunId) {
        worker.onmessage = async (e) => {
            const { type } = e.data;

                   if (type === 'output') {
                alreadyOutput = true;

                const s = String(e.data.text ?? '');
                const parts = s.split('\n');
                parts.forEach(line => consoleOutput.lnprint(line));

            } else if (type === 'input') {
                if (!alreadyOutput) consoleOutput.println();

                // switch to input mode
                clearLoadingTimer();
                setLoading(false);
                onInputRequested();

                await Promise.race([
                    new Promise((resolve) => {
                        const d = console.onWriteParsed(() => { d.dispose(); resolve(); }); // give console a chance to update
                    }),
                    new Promise((resolve) => setTimeout(resolve, 0)) // advance after one timer tick
                ]);
                const col = console.buffer.active.cursorX || 0;
                cursor.setInputStartCol(col);

                consoleLocked = false;

            } else if (type === 'file_get_lines') {
                worker.postMessage({ type: 'file_lines', lines: files.getLines(e.data.name) });

            } else if (type === 'file_clear') {
                files.clearFile(e.data.name);

            } else if (type === 'file_write') {
                files.addLine(e.data.file, e.data.line);

            // stops the program
            } else if (type === 'done' || type === 'error') {
                consoleOutput.newline();

                // set analytics vars
                code_executed_runtime = performance.now() - startTime;
                code_executed_success = (type === 'done'); // mark as fail if error

                // output error
                if (type === 'error') {
                    outputError(e.data.formatted || e.data.error || 'Unknown error');
                    consoleOutput.newline();
                }

                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            // set analytics vars
            code_executed_runtime = performance.now() - startTime;
            code_executed_success = false;

            consoleOutput.lnerrln(`Worker error: ${e.message || e.filename || 'unknown'}`);
            consoleOutput.errln(`Please reload the page, or report this bug.`);
            finishRun(localRunId);
        };
    }

    function run(method = 'button') {
        if (isRunning) return;
        isRunning = true;
        consoleLocked = true;

        // set analytics vars
        code_executed_method = method;
        startTime = performance.now(); code_executed_runtime = 0;
        code_executed_size = getCode().length;
        code_executed_success = false;
        alreadyOutput = false;

        // make worker
        const newRunId = ++runId;
        worker = new Worker(workerPath, { type: 'module' });
        attachWorkerHandlers(newRunId);

        worker.postMessage({ type: 'run', code: getCode() });

        onStateChange(true);

        // change run button to 'Stop' and show loading bar after 100ms
        loadingTimer = setTimeout(() => {
            if (isRunning && newRunId === runId) setLoading(true);
        }, 100);
    }
    function stop() {
        if (!isRunning || !worker) return;

        outputError('Execution stopped');
        consoleOutput.newline();

        // stop worker
        try { worker.terminate(); } catch {}
        worker = null;

        // set analytics vars
        code_executed_runtime = performance.now() - startTime;
        code_executed_success = false;

        finishRun(runId);
    }

    function provideInput(line) {
        consoleLocked = true;

        worker.postMessage({ type: 'input', line: String(line) });

        // change run button to 'Stop' and show loading bar after input
        loadingTimer = setTimeout(() => {
            if (isRunning) setLoading(true);
        }, 100);
    }

    window.runCtrlProvideInput = provideInput;

    return { run, stop, provideInput, isRunning: () => isRunning,
             isConsoleLocked: () => consoleLocked, setCursor: (newCursor) => cursor = newCursor };
}
