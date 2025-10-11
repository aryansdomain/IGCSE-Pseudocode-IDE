function code_executed({
    method,
    runtime,
    code_size,
    success,
} = {}) {
    gtag('event', 'code_executed', {
        method,
        runtime: Math.round(runtime),
        code_size,
        success,
    });
}

function mode_toggled({
    to,
    page = 'ide'
} = {}) {
    gtag('event', 'mode_toggled', {
        to,
        page
    });
}

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

function layout_changed({ to } = {}) {
    gtag('event', 'layout_changed', { to });
}

function code_copied({ code_size } = {}) {
    gtag('event', 'code_copied', { code_size });
}
function code_downloaded({ code_size } = {}) {
    gtag('event', 'code_downloaded', { code_size });
}

function console_copied({ console_size } = {}) {
    gtag('event', 'console_copied', { console_size });
}
function console_downloaded({ console_size } = {}) {
    gtag('event', 'console_downloaded', { console_size });
}

window.code_executed   = code_executed;
window.mode_toggled    = mode_toggled
window.theme_changed   = theme_changed;
window.layout_changed  = layout_changed;
window.code_copied     = code_copied;
window.code_downloaded = code_downloaded;
window.console_copied  = console_copied;
window.console_downloaded = console_downloaded;
