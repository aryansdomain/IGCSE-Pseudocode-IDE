export function initRunCtrl({ traceRun, highlightNode, clearHighlight, showError = () => {}, onStateChange = () => {}, workerPath = '../code/runtime/runner.js' } = {}) {

    // ------------------------ Analytics Vars ------------------------

    let flowchart_ran_method = 'button';
    let flowchart_ran_runtime = 0; let startTime = 0;
    let flowchart_ran_size = 0;
    let flowchart_ran_success = false;

    // ------------------------ Runtime State ------------------------

    let worker = null;
    let runId = 0;
    let isRunning  = false;

    function finishRun(localRunId) {
        if (localRunId !== runId) return; // stale run

        isRunning = false;
        onStateChange(false);
        traceRun.finishRun();

        try { worker && worker.terminate(); } catch {}
        worker = null;

        // record analytics
        try {
            window.flowchart_ran && window.flowchart_ran({
                flowchart_ran_method,
                flowchart_ran_runtime,
                flowchart_ran_size,
                flowchart_ran_success
            });
        } catch {}
    }

    // process execution results
    function attachWorkerHandlers(localRunId) {
        worker.onmessage = async (e) => {
            if (localRunId !== runId) return; // stale run
            const msg = e.data || {};

            switch (msg.type) {
                case 'variable':
                    if (!traceRun.setVar(msg.name, msg.value, msg.index)) finishRun(localRunId); // set a variable, if error finish the run
                    break;

                case 'iteration':
                    if (!traceRun.addRunRow()) finishRun(localRunId); // loop boundary: start a new row
                    break;

                case 'output':
                    traceRun.setOutput(String(msg.text));
                    break;

                case 'input': {
                    const line = String(await traceRun.focusInput(msg.name, msg.index));
                    worker.postMessage({ type: 'input', line });
                    break;
                }

                case 'done':
                    // set analytics vars
                    flowchart_ran_runtime = performance.now() - startTime;
                    flowchart_ran_success = true;

                    finishRun(localRunId);
                    break;

                case 'error': {
                    const text = msg.formatted || msg.error || 'Error';

                    // set analytics vars
                    flowchart_ran_runtime = performance.now() - startTime;
                    flowchart_ran_success = false;

                    // only the error type is reported: the message quotes the student's own chart
                    try {
                        window.flowchart_error && window.flowchart_error({
                            flowchart_error_stage:  'runtime',
                            flowchart_error_type:   msg.errorType || 'Error',
                            flowchart_error_reason: ''
                        });
                    } catch {}

                    // highlight the node with the error, or report it on the card when the
                    // error belongs to no node (e.g. thrown while seeding the arrays)
                    if (msg.nodeId) highlightNode(msg.nodeId, text);
                    else            showError(text);

                    finishRun(localRunId);
                    break;
                }
            }
        };

        worker.onerror = (e) => {
            showError(`Worker error: ${e.message || 'unknown'}`);
            finishRun(localRunId);
        };
    }

    // ------------------------ Run/Stop ------------------------

    function run(graph, arraySpecs, method = 'button') {
        if (isRunning) return;
        clearHighlight();

        // set analytics vars
        flowchart_ran_method  = method;
        flowchart_ran_size    = graph.nodes.length;
        flowchart_ran_success = false;
        startTime = performance.now();

        isRunning = true;
        const newRunId = ++runId;
        worker = new Worker(workerPath, { type: 'module' });
        attachWorkerHandlers(newRunId);
        worker.postMessage({ type: 'run', graph, arraySpecs, flowchart: true });
        onStateChange(true);
    }

    function stop() {
        if (!isRunning || !worker) return;
        try { worker.terminate(); } catch {}
        worker = null;
        finishRun(runId);
    }

    return { run, stop, isRunning: () => isRunning };
}
