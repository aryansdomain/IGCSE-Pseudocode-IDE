function initAnalytics() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }

    window.gtag = gtag; // make gtag available to other scripts

    gtag('js', new Date());
    gtag('config', 'G-V2QHS6XEKF');
}

function code_executed({
    method = 'run_button',
    runtime_ms = 0,
    code_size = 0,
    success = true,
    error_msg = ''
} = {}) {
    if (!window.gtag) return;

    window.gtag('event', 'code_executed', {
        method,                              // 'button' or 'console'
        runtime_ms: Math.round(runtime_ms),  // time taken to execute code
        code_size,                           // size of code executed
        success: success ? 1 : 0,            // 1 if code executed successfully, 0 if not
        ...(error_msg ? { error_msg: String(error_msg).slice(0, 100) } : {})  // console error
    });
}

initAnalytics();

