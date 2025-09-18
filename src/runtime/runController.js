export function createRunController({
    consoleOutput,
    writePrompt,
    getCode,
    workerPath = 'runner.js',
    onInputRequested = () => {},
    onStateChange = () => {},
} = {}) {
    // --- state ---
    let worker = null;
    let runId = 0;
    let isRunning = false;

    let __flushedPrefix = '';
    let outputStorage = [];
    let warningStorage = [];
    let hadFlushOutput = false;

    function rearmDots(delay = 75) {
        if (runningTimer) clearTimeout(runningTimer);
        hadFlushOutput = false;
        runningTimer = setTimeout(() => {
            if (isRunning && !indicatorShown && !hadFlushOutput) startDots();
        }, delay);
    }

    // dots
    let indicatorShown = false;
    let runningTimer = null;
    let dotTimer = null;
    let dotPhase = 0;

    const startDots = () => {
        if (indicatorShown) return;
        indicatorShown = true;

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
        if (indicatorShown) {
            consoleOutput.clearline(); // clear dots
            indicatorShown = false;
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

    function attachWorkerHandlers(localRunId) {
        worker.onmessage = (e) => {
            const { type } = e.data || {};

            if (type === 'flush') {
                // interpreter flushed an in-progress OUTPUT
                const s = String(e.data.output || '');
                const newPart = s.startsWith(__flushedPrefix) ? s.slice(__flushedPrefix.length) : s;
                __flushedPrefix += newPart;
                if (newPart.length) hadFlushOutput = true;
                outputStorage.push(newPart);

            } else if (type === 'warning') {
                const msg = (e.data && (e.data.message ?? e.data.text)) || '';
                if (msg) warningStorage.push(msg);

            } else if (type === 'input_request') {
                // Before switching to input mode, show warnings and flushed prompt text
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
                const hadInd = indicatorShown;
                clearDots();

                // if no dots ever showed, print queued warnings now (once)
                if (!hadInd && warningStorage.length) {
                    warningStorage.forEach(msg => consoleOutput.warnln(msg));
                    warningStorage = [];
                }

                // Dump buffered output
                if (outputStorage.length) {
                    const combined = outputStorage.join('');
                    const parts = combined.split('\n');

                    if (!hadInd) consoleOutput.newline();
                    parts.slice(1).forEach(line => consoleOutput.println(line));
                    outputStorage = [];
                }

                finishRun(localRunId);

            } else if (type === 'stopped') {
                clearDots();
                consoleOutput.lnerrln('Execution stopped');
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
            finishRun(localRunId);
        };
    }

    function run() {
        if (isRunning) return;
        isRunning = true;
        onStateChange(true);

        const localRunId = ++runId;

        __flushedPrefix = '';
        outputStorage = [];
        warningStorage = [];
        hadFlushOutput = false;

        // Start worker and schedule dots (only if still silent after 75ms)
        worker = new Worker(workerPath);
        attachWorkerHandlers(localRunId);

        worker.postMessage({ type: 'run', code: getCode() });

        runningTimer = setTimeout(() => {
            if (isRunning && localRunId === runId && !hadFlushOutput) startDots();
        }, 75);
    }

    function stop() {
        if (!isRunning || !worker) {
            consoleOutput.errln('No running execution to stop');
            return;
        }
        try { worker.postMessage({ type: 'stop' }); } catch {}
        // Force-stop fallback
        setTimeout(() => {
            if (!worker) return;
            try { worker.terminate(); } catch {}
            worker = null;
            clearDots();

            consoleOutput.lnerrln('Execution stopped');

            finishRun(runId);
        }, 600);
    }

    function sendUserInput(text) {
        worker.postMessage({ type: 'input_response', value: text });

        rearmDots();
    }

    return { run, stop, sendUserInput, isRunning: () => isRunning };
}
