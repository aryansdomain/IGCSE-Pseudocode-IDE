export function formatJSError(err) {
    if (!err) return "None";
    if (typeof err === "string") return err;
  
    // divide error into seperate parts
    const type  =  err.type      ||  ""; 
    const msg   =  err.message   ||  (err.error && err.error.message)       ||  String(err);
    const file  =  err.filename  ||  (err.error && err.error.fileName)      ||  "";
    const ln    =  err.lineno    ||  (err.error && err.error.lineNumber)    ||  "";
    const col   =  err.colno     ||  (err.error && err.error.columnNumber)  ||  "";
    const loc   =  file ? `${file}${ln != null ? `:${ln}` : ""}${col != null ? `:${col}` : ""}` : "";
  
    // limit error length
    let stack = err.stack || (err.error && err.error.stack) || "";
    stack = String(stack).replace(/data:[^)\n]+/g, "[data-url]").slice(0, 2000);
  
    // format error
    const header = loc ? `${msg} @ ${loc}` : msg;
    return [type.toUpperCase() + ":", header, stack ? `\n${stack}` : ""].join(" ");
}

// record last JS error (uncaught)
(function attachJSErrorListener() {
    if (window.__errorListenerInstalled) return;
    window.__errorListenerInstalled = true;
    window.__lastError = null;
    const setLast = (v) => { try { window.__lastError = v; } catch {} };
  
    // runtime/classic errors
    window.addEventListener(
        "error",
        (e) => {
            if (e instanceof ErrorEvent) {
                setLast({
                    type: "runtime",
                    message: e.message,
                    filename: e.filename,
                    lineno: e.lineno,
                    colno: e.colno,
                    stack: e.error && e.error.stack ? e.error.stack : null,
                    error: e.error || null
                });
            }
        },
        true
    );

    // unhandled promise rejections
    window.addEventListener("unhandledrejection", (e) => {
        const r = e && e.reason;
        setLast({
            type: "unhandledrejection",
            message:
                r && r.message
                    ? String(r.message)
                    : r
                        ? String(r)
                        : "unhandledrejection",
            stack: r && r.stack ? r.stack : null,
            reason: r ?? null
        });
    });
  
    // legacy fallback
    window.onerror = function (message, source, lineno, colno, error) {
        setLast({
            type: "onerror",
            message,
            filename: source,
            lineno,
            colno,
            stack: error && error.stack ? error.stack : null,
            error: error || null
        });
        return false;
    };
})();

// record last IDE console error (from consoleOutput)
(function attachIDEErrorListener() {
    if (window.__ideConsoleListenerInstalled) return;
    const MAX_ERR_LEN = 4000;

    window.addEventListener("ide-console", (e) => {
        try {
            const d = e && (e.detail || {});
            const text = (d.text != null) ? String(d.text) : "";

            // fallback regex
            if (d.type === "error" || /(error|unknown command|exception|traceback)/i.test(text)) {
                window.__lastIDEError = text.slice(0, MAX_ERR_LEN);
            }
        } catch {}
    });
    window.__ideConsoleListenerInstalled = true;
})();
