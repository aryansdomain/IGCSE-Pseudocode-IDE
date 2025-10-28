function code_executed({
    code_executed_method,
    code_executed_runtime,
    code_executed_size,
    code_executed_success,
} = {}) {
    gtag('event', 'code_executed', {
        code_executed_method,
        code_executed_runtime: Math.round(code_executed_runtime),
        code_executed_size,
        code_executed_success,
    });
}

function mode_toggled({
    mode_toggled_to,
    mode_toggled_page = 'ide'
} = {}) {
    gtag('event', 'mode_toggled', {
        mode_toggled_to,
        mode_toggled_page
    });
}
function theme_changed({
    theme_changed_from,
    theme_changed_from_mode,
    theme_changed_to,
    theme_changed_to_mode,
} = {}) {
    gtag('event', 'theme_changed', {
        theme_changed_from,
        theme_changed_from_mode,
        theme_changed_to,
        theme_changed_to_mode,
    });
}

function layout_changed({ layout_changed_to } = {}) {
    gtag('event', 'layout_changed', { layout_changed_to });
}

function code_copied({ code_copied_size } = {}) {
    gtag('event', 'code_copied', { code_copied_size });
}
function code_downloaded({ code_downloaded_size } = {}) {
    gtag('event', 'code_downloaded', { code_downloaded_size });
}
function code_uploaded({ code_uploaded_size } = {}) {
    gtag('event', 'code_uploaded', { code_uploaded_size });
}

function console_copied({ console_copied_size } = {}) {
    gtag('event', 'console_copied', { console_copied_size });
}
function console_downloaded({ console_downloaded_size } = {}) {
    gtag('event', 'console_downloaded', { console_downloaded_size });
}

function code_formatted({
    code_formatted_old_size,
    code_formatted_new_size,
} = {}) {
    gtag('event', 'code_formatted', {
        code_formatted_old_size,
        code_formatted_new_size,
    });
}

function font_size_changed({
    font_size_changed_from,
    font_size_changed_to,
} = {}) {
    gtag('event', 'font_size_changed', {
        font_size_changed_from,
        font_size_changed_to,
    });
}
function font_family_changed({
    font_family_changed_from,
    font_family_changed_to,
} = {}) {
    gtag('event', 'font_family_changed', {
        font_family_changed_from,
        font_family_changed_to,
    });
}

function tab_spaces_changed({
    tab_spaces_changed_from,
    tab_spaces_changed_to,
} = {}) {
    gtag('event', 'tab_spaces_changed', {
        tab_spaces_changed_from,
        tab_spaces_changed_to,
    });
}

window.code_executed        = code_executed;
window.mode_toggled         = mode_toggled;
window.theme_changed        = theme_changed;
window.layout_changed       = layout_changed;
window.code_copied          = code_copied;
window.code_downloaded      = code_downloaded;
window.code_uploaded        = code_uploaded;
window.console_copied       = console_copied;
window.console_downloaded   = console_downloaded;
window.code_formatted       = code_formatted;
window.font_size_changed    = font_size_changed;
window.font_family_changed  = font_family_changed;
window.tab_spaces_changed   = tab_spaces_changed;
