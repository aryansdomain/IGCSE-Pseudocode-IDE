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

function code_formatted({
    old_code_size,
    new_code_size,
} = {}) {
    gtag('event', 'code_formatted', {
        old_code_size,
        new_code_size,
    });
}

function font_size_changed({
    from_size,
    to_size,
} = {}) {
    gtag('event', 'font_size_changed', {
        from_size,
        to_size,
    });
}
function font_family_changed({
    from_font,
    to_font,
} = {}) {
    gtag('event', 'font_family_changed', {
        from_font,
        to_font,
    });
}

function tab_spaces_changed({
    from_spaces,
    to_spaces,
} = {}) {
    gtag('event', 'tab_spaces_changed', {
        from_spaces,
        to_spaces,
    });
}

window.code_executed        = code_executed;
window.mode_toggled         = mode_toggled
window.theme_changed        = theme_changed;
window.layout_changed       = layout_changed;
window.code_copied          = code_copied;
window.code_downloaded      = code_downloaded;
window.console_copied       = console_copied;
window.console_downloaded   = console_downloaded;
window.code_formatted       = code_formatted;
window.font_size_changed    = font_size_changed;
window.font_family_changed  = font_family_changed;
window.tab_spaces_changed   = tab_spaces_changed; 