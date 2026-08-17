// ------------------------ Shared ------------------------

function mode_toggled({
    mode_toggled_to,
    mode_toggled_page = 'ide'
} = {}) {
    gtag('event', 'mode_toggled', {
        mode_toggled_to,
        mode_toggled_page
    });
}

function font_size_changed({
    font_size_changed_from,
    font_size_changed_to
} = {}) {
    gtag('event', 'font_size_changed', {
        font_size_changed_from,
        font_size_changed_to
    });
}
function font_family_changed({
    font_family_changed_from,
    font_family_changed_to
} = {}) {
    gtag('event', 'font_family_changed', {
        font_family_changed_from,
        font_family_changed_to
    });
}

window.mode_toggled         = mode_toggled;
window.font_size_changed    = font_size_changed;
window.font_family_changed  = font_family_changed;


// ------------------------ Code Editor ------------------------

function code_ran({
    code_ran_method,
    code_ran_runtime,
    code_ran_size,
    code_ran_success
} = {}) {
    gtag('event', 'code_ran', {
        code_ran_method,
        code_ran_runtime: Math.round(code_ran_runtime),
        code_ran_size,
        code_ran_success
    });
}

function theme_changed({
    theme_changed_from,
    theme_changed_from_mode,
    theme_changed_to,
    theme_changed_to_mode
} = {}) {
    gtag('event', 'theme_changed', {
        theme_changed_from,
        theme_changed_from_mode,
        theme_changed_to,
        theme_changed_to_mode
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
    code_formatted_new_size
} = {}) {
    gtag('event', 'code_formatted', {
        code_formatted_old_size,
        code_formatted_new_size
    });
}

function tab_spaces_changed({
    tab_spaces_changed_from,
    tab_spaces_changed_to
} = {}) {
    gtag('event', 'tab_spaces_changed', {
        tab_spaces_changed_from,
        tab_spaces_changed_to
    });
}

window.code_ran           = code_ran;
window.theme_changed      = theme_changed;
window.layout_changed     = layout_changed;
window.code_copied        = code_copied;
window.code_downloaded    = code_downloaded;
window.code_uploaded      = code_uploaded;
window.console_copied     = console_copied;
window.console_downloaded = console_downloaded;
window.code_formatted     = code_formatted;
window.tab_spaces_changed = tab_spaces_changed;


// ------------------------ Flowcharts ------------------------

function flowchart_ran({
    flowchart_ran_method,
    flowchart_ran_runtime,
    flowchart_ran_size,
    flowchart_ran_success
} = {}) {
    gtag('event', 'flowchart_ran', {
        flowchart_ran_method,
        flowchart_ran_runtime: Math.round(flowchart_ran_runtime),
        flowchart_ran_size,
        flowchart_ran_success
    });
}

function flowchart_error({
    flowchart_error_stage,
    flowchart_error_type,
    flowchart_error_reason
} = {}) {
    gtag('event', 'flowchart_error', {
        flowchart_error_stage,
        flowchart_error_type,
        flowchart_error_reason
    });
}

function flowchart_downloaded({ flowchart_downloaded_size } = {}) {
    gtag('event', 'flowchart_downloaded', { flowchart_downloaded_size });
}

function flowchart_arranged({
    flowchart_arranged_size,
    flowchart_arranged_moved
} = {}) {
    gtag('event', 'flowchart_arranged', {
        flowchart_arranged_size,
        flowchart_arranged_moved
    });
}


function trace_table_made({
    trace_table_made_columns,
    trace_table_made_arrays,
    trace_table_made_has_output
} = {}) {
    gtag('event', 'trace_table_made', {
        trace_table_made_columns,
        trace_table_made_arrays,
        trace_table_made_has_output
    });
}

function trace_array_sized({ trace_array_sized_elements } = {}) {
    gtag('event', 'trace_array_sized', { trace_array_sized_elements });
}

window.flowchart_ran        = flowchart_ran;
window.flowchart_downloaded = flowchart_downloaded;
window.flowchart_arranged   = flowchart_arranged;
window.flowchart_error      = flowchart_error;
window.trace_table_made     = trace_table_made;
window.trace_array_sized    = trace_array_sized;
