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

// when mode is toggled
function mode_toggled({
    to,
    page = 'ide'
} = {}) {
    gtag('event', 'mode_toggled', {
        to,
        page
    });
}

// when theme is changed
function theme_changed({
    from,
    from_mode,
    to,
    to_mode,
} = {}) {
    gtag('event', 'theme_changed', {
        from,
        from_mode,
        to,
        to_mode,
    });
}

// when layout orientation is changed
function layout_changed({ to } = {}) {
    gtag('event', 'layout_changed', { to });
}

window.code_executed = code_executed;
window.mode_toggled = mode_toggled;
window.theme_changed = theme_changed;
window.layout_changed = layout_changed;
