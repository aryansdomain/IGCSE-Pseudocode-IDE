function initAnalytics() {
    if (window.gtag) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }

    window.gtag = gtag; // make gtag available to other scripts

    gtag('js', new Date());
    gtag('config', 'G-V2QHS6XEKF');
}

function code_executed({
    run_method = 'button',
    runtime_ms = 0,
    code_size = 0,
    success = true,
    error_msg = ''
} = {}) {
    if (!window.gtag) return;

    window.gtag('event', 'code_executed', {
        run_method,                                     // 'button' or 'console'
        runtime_ms: Math.round(runtime_ms),         // time taken to execute code
        code_size,                                  // size of code (in chars)
        success,                                    // true if code executed successfully, false if not
        error_msg: String(error_msg).slice(0, 100)  // console error
    });
}

initAnalytics();

window.code_executed = window.code_executed || code_executed;
