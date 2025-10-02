export function createRunCtrl({
    consoleOutput,
    writePrompt,
    getCode,
    workerPath = 'runner.js',
    onInputRequested = () => {},
    onStateChange = () => {},
    onLoadingChange = () => {},
} = {}) {

    // states
    let worker = null;
    let runId = 0;
    let isRunning = false;

    let __flushedPrefix = '';
    let outputStorage = [];
    let warningStorage = [];
    let hadFlushOutput = false;

    // ------------------------------- RUNTIME STATE -------------------------------
    let terminalLocked = false;
    let awaitingInput = false;
    let loadingTimer = null;
    const setLoading = (v) => { try { onLoadingChange(!!v); } catch {} };

    const clearLoadingTimer = () => {
        if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    };

    function finishRun(localRunId) {
        if (localRunId !== runId) return;  // stale
        isRunning = false;
        onStateChange(false);
        clearLoadingTimer();
        setLoading(false);

        try { worker && worker.terminate(); } catch {}
        worker = null;

        consoleOutput.newline();
        writePrompt();
    }

    // attach event handlers to the worker for processing execution results
    function attachWorkerHandlers(localRunId) {
        worker.onmessage = (e) => {
            const { type } = e.data || {};

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
                awaitingInput = true;
                terminalLocked = false;
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

                onInputRequested();

            } else if (type === 'done') {
                awaitingInput = false;
                terminalLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // print warnings
                if (warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }

                // output stored output
                const combinedFromFlush = outputStorage.join('');
                const combined = combinedFromFlush.length ? combinedFromFlush : String(e.data.output || '');
                const parts = combined ? combined.split('\n') : [];

                if (parts.length) {
                    parts.forEach((line, idx) => { 
                        if (idx === 0) {
                            if (parts.length === 1) consoleOutput.println(line);
                        } else consoleOutput.println(line);
                    });
                }
                outputStorage = [];

                finishRun(localRunId);

            } else if (type === 'stopped') {
                awaitingInput = false;
                terminalLocked = false;
                clearLoadingTimer();
                setLoading(false);
                finishRun(localRunId);

            } else if (type === 'error') {
                awaitingInput = false;
                terminalLocked = false;
                clearLoadingTimer();
                setLoading(false);
                const msg = String(e.data.error || 'Unknown error');
                consoleOutput.lnerrln(msg);

                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            terminalLocked = false;
            clearLoadingTimer();
            setLoading(false);
            consoleOutput.errln(`Worker error: ${e.message || e.filename || 'unknown'}`);
            consoleOutput.errln(`Please reload the page.`);
            finishRun(localRunId);
        };
    }

    function run() {
        if (isRunning) return;
        isRunning = true;
        awaitingInput = false;
        terminalLocked = true;

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

        try { worker.postMessage({ type: 'stop' }); } catch {}

        consoleOutput.lnerrln('Execution stopped');

        try { worker.terminate(); } catch {}
        worker = null;
        terminalLocked = false;
        clearLoadingTimer();
        setLoading(false);

        finishRun(runId);
    }

    function provideInput(line) {

        // lock again while program runs
        awaitingInput = false;
        terminalLocked = true;
        worker.postMessage({ type: 'input_response', data: String(line) });
        
        // Show loading bar after a delay for program input
        loadingTimer = setTimeout(() => {
            if (isRunning) {
                setLoading(true);
            }
        }, 75);
    }

    window.runCtrlProvideInput = provideInput;

    return { run, stop, provideInput, isRunning: () => isRunning, isTerminalLocked: () => terminalLocked };
}
