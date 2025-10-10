import { code_executed } from '../analytics/analytics.js';

export function initRunCtrl({
    consoleOutput,
    getline,
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

    // ------------------------------- Analytics Vars -------------------------------
    let startTime = 0;
    let run_time = 0;
    let run_success = false;
    let run_error = '';
    let run_method = 'button';
    let run_code_size = 0;

    // ------------------------------- Runtime State -------------------------------
    let consoleLocked = false;
    let awaitingInput = false;
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
            code_executed({
                run_method,
                run_time,
                run_code_size,
                run_success,
                run_error,
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
                awaitingInput = true;
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

                onInputRequested();

            } else if (type === 'done') {
                awaitingInput = false;
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
                run_time = performance.now() - startTime;
                run_success = true;
                run_error = '';

                finishRun(localRunId);

            } else if (type === 'stopped') {

                awaitingInput = false;
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // set analytics vars
                run_time = performance.now() - startTime;
                run_success = false;
                run_error = 'Execution stopped by user';

                finishRun(localRunId);

            } else if (type === 'error') {
                awaitingInput = false;
                consoleLocked = false;
                clearLoadingTimer();
                setLoading(false);

                // set analytics vars
                run_time = performance.now() - startTime;
                run_success = false;
                run_error = String(e.data.error || 'Unknown error');

                // output error
                let line = getline().replace(/\s+$/, '');
                if (line.length > 0) consoleOutput.newline();
                consoleOutput.errln(run_error);

                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            consoleLocked = false;
            clearLoadingTimer();
            setLoading(false);
            
            // set analytics vars
            run_time = performance.now() - startTime;
            run_success = false;
            run_error = `Worker error: ${e.message || e.filename || 'unknown'}`;
            
            consoleOutput.errln(run_error);
            consoleOutput.errln(`Please reload the page.`);
            finishRun(localRunId);
        };
    }

    function run(method = 'button') {
        if (isRunning) return;
        isRunning = true;
        awaitingInput = false;
        consoleLocked = true;

        // set analytics vars
        startTime = performance.now();

        run_method = method;
        run_time = 0;
        run_code_size = (typeof getCode === 'function' ? (getCode() || '').length : 0);
        run_success = false;
        run_error = '';

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

        finishRun(runId);
    }

    function provideInput(line) {

        // lock again while program runs
        awaitingInput = false;
        consoleLocked = true;
        worker.postMessage({ type: 'input_response', data: String(line) });
        
        // show loading bar after a delay after input
        loadingTimer = setTimeout(() => {
            if (isRunning) setLoading(true);
        }, 75);
    }

    window.runCtrlProvideInput = provideInput;

    return { run, stop, provideInput, isRunning: () => isRunning, isConsoleLocked: () => consoleLocked };
}
