// when user code is ran
function code_executed({
    run_method,
    run_time,
    run_code_size,
    run_success,
} = {}) {
    gtag('event', 'code_executed', {
        run_method,
        run_time: Math.round(run_time),
        run_code_size,
        run_success,
    });
}

window.code_executed = code_executed;
