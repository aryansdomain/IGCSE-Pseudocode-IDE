export function createRunCtrl({
    consoleOutput,
    writePrompt,
    getCode,
    workerPath = 'runner.js',
    onInputRequested = () => {},
    onStateChange = () => {},
} = {}) {

    // states
    let worker = null;
    let runId = 0;
    let isRunning = false;

    let __flushedPrefix = '';
    let outputStorage = [];
    let warningStorage = [];
    let hadFlushOutput = false;


    // -------------------------------- RUNNING DOTS --------------------------------
    let dotsShown = false;
    let runningTimer = null;
    let dotTimer = null;
    let dotPhase = 0;
    let terminalLocked = false;

    const startDots = () => {
        if (dotsShown) return;
        dotsShown = true;
        terminalLocked = true;

        // print warnings above dots
        if (warningStorage.length) {
            warningStorage.forEach(msg => consoleOutput.warnln(msg));
            warningStorage = [];
            consoleOutput.newline();
        }

        consoleOutput.newline();

        dotPhase = 0;
        dotTimer = setInterval(() => {
            dotPhase = (dotPhase + 1) % 4;
            consoleOutput.clearline();
            consoleOutput.print('\x1b[32m' + '.'.repeat(dotPhase));
            consoleOutput.print('\x1b[0m'); // reset
        }, 300);
    };

    const clearDots = () => {
        if (runningTimer) { clearTimeout(runningTimer); runningTimer = null; }
        if (dotTimer)     { clearInterval(dotTimer);   dotTimer = null; }
        if (dotsShown) {
            consoleOutput.clearline(); // clear dots
            dotsShown = false;
            terminalLocked = false;
        }
    };


    function finishRun(localRunId) {
        if (localRunId !== runId) return;  // stale
        isRunning = false;
        onStateChange(false);

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

                // before switching to input mode, show any warnings/output
                clearDots();

                if (warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }

                if (outputStorage.length) {
                    const combined = outputStorage.join('');
                    const parts = combined.split('\n');

                    parts.slice(1).forEach(line => consoleOutput.lnprint(line));
                    outputStorage = [];
                }

                onInputRequested();

            } else if (type === 'done') {
                const hadDots = dotsShown;
                clearDots();

                // if no dots showed, print warnings now
                if (!hadDots && warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }

                // output stored output
                if (outputStorage.length) {
                    const combined = outputStorage.join('');
                    const parts = combined.split('\n');

                    if (!hadDots) consoleOutput.newline();
                    parts.slice(1).forEach(line => consoleOutput.println(line));
                    outputStorage = [];
                }

                finishRun(localRunId);

            } else if (type === 'stopped') {
                clearDots();
                finishRun(localRunId);

            } else if (type === 'error') {
                clearDots();
                const msg = String(e.data.error || 'Unknown error');
                consoleOutput.lnerrln(msg);

                finishRun(localRunId);
            }
        };

        worker.onerror = (e) => {
            clearDots();
            consoleOutput.clearline();
            consoleOutput.errln(`Worker error: ${e.message || e.filename || 'unknown'}`);
            consoleOutput.errln(`Please reload the page.`);
            finishRun(localRunId);
        };
    }

    function run() {
        if (isRunning) return;
        isRunning = true;

        const localRunId = ++runId;

        __flushedPrefix = '';
        outputStorage = [];
        warningStorage = [];
        hadFlushOutput = false;

        worker = new Worker(workerPath);
        attachWorkerHandlers(localRunId);

        worker.postMessage({ type: 'run', code: getCode() });

        // transition to stop button and show dots (after timeout)
        setTimeout(() => {
            if (isRunning && localRunId === runId) {
                onStateChange(true);
                if (!hadFlushOutput) startDots();
            }
        }, 100);
    }

    function stop() {

        if (!isRunning || !worker) {
            consoleOutput.errln('No running execution to stop');
            return;
        }

        try { worker.postMessage({ type: 'stop' }); } catch {}

        clearDots();
        consoleOutput.errln('Execution stopped');

        // force-stop fallback
        setTimeout(() => {
            if (!worker) return;
            try { worker.terminate(); } catch {}
            worker = null;
            clearDots();

            finishRun(runId);
        }, 600);
    }

    function sendUserInput(text) {
        worker.postMessage({ type: 'input_response', value: text });

        if (runningTimer) clearTimeout(runningTimer);
        hadFlushOutput = false;
        runningTimer = setTimeout(() => {
            if (isRunning && !dotsShown && !hadFlushOutput) startDots();
        }, 75);
    }

    return { run, stop, sendUserInput, isRunning: () => isRunning, isTerminalLocked: () => terminalLocked };
}
