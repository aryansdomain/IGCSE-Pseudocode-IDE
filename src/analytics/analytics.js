// when user code is ran
export function code_executed({
    run_method,
    run_time,
    run_code_size,
    run_success,
    run_error = ''
} = {}) {
    gtag('event', 'code_executed', {
        run_method,
        run_time: Math.round(run_time),
        run_code_size,
        run_success,
        run_error: String(run_error).slice(0, 100),
        debug_mode: true
    });
}
