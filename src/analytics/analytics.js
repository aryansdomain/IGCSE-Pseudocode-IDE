function initAnalytics() { window.dataLayer = window.dataLayer || []; }

function code_executed({
    run_method = 'button',
    run_time = 0,
    run_code_size = 0,
    run_success = true,
    run_error = ''
} = {}) {
    initAnalytics();

    window.dataLayer.push({
        event: 'code_executed',
        run_method,                                  // 'button' or 'console'
        run_time: Math.round(run_time),              // time taken to execute code
        run_code_size,                               // size of code (in chars)
        run_success,                                 // true if code executed successfully, false if not
        run_error: String(run_error).slice(0, 100),  // console error
    });

    window.code_executed = code_executed;
}

window.code_executed = window.code_executed || code_executed;
