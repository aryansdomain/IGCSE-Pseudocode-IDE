// config
const GH_OWNER = "aryansdomain";
const GH_REPO  = "IGCSE-Pseudocode-IDE";

// record last JS error (uncaught)
(function attachGlobalErrorTap() {
    if (window.__errorTapInstalled) return;
    window.__lastError = null;

    // fallback for early errors
    window.onerror = function (message, source, lineno, colno, error) {
        try {
            const where = `${source}:${lineno}:${colno}`;
            const stack = error && error.stack ? `\n${error.stack}` : "";
            window.__lastError = `${message} @ ${where}${stack}`;
        } catch {}
    };

    window.addEventListener("error", (e) => {
        try {
            const where = `${e.filename}:${e.lineno}:${e.colno}`;
            const stack = e.error && e.error.stack ? `\n${e.error.stack}` : "";
            window.__lastError = `${e.message} @ ${where}${stack}`;
        } catch {}
    });
    window.addEventListener("unhandledrejection", (e) => {
        try {
            const r = e && e.reason;
            const reason = r
                ? (r.stack || (r.message ? `${r.name || "Error"}: ${r.message}` : String(r)))
                : "unhandledrejection";
            window.__lastError = reason;
        } catch {}
    });
    window.__errorTapInstalled = true;
})();

// record last console error (caught, from console.error)
(function attachConsoleErrorTap() {
    if (window.__consoleTapInstalled) return;

    const origError = console.error.bind(console);
    window.__lastConsoleError = null;

    function getCircularReplacer() {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            return value;
        };
    }

    function formatArg(arg) {
        if (arg instanceof Error) {
            const stack = arg.stack ? `\n${arg.stack}` : "";
            return `${arg.name}: ${arg.message}${stack}`;
        }
        if (typeof arg === "string") return arg;
        try {
            return JSON.stringify(arg, getCircularReplacer(), 2);
        } catch {
            return String(arg);
        }
    }

    console.error = function (...args) {
        try {
            const formatted = args.map(formatArg).join(" ");
            window.__lastConsoleError = formatted;
        } catch {}

        origError(...args);
    };

    window.__consoleTapInstalled = true;
})();

// record last IDE terminal error (from consoleOutput)
(function attachIDETerminalTap() {
        if (window.__terminalTapInstalled) return;
        window.__lastIDEError = null;

        function getCircularReplacer() {
            const seen = new WeakSet();
            return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            return value;
        };
        }
        function fmt(arg) {
            if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
            if (typeof arg === "string") return arg;
            try { return JSON.stringify(arg, getCircularReplacer(), 2); } catch { return String(arg); }
        }
        function patch(obj) {
            if (!obj) return false;
            ["err","errln","lnerr","lnerrln"].forEach(m => {
                if (typeof obj[m] !== "function") return;
                const orig = obj[m].bind(obj);
                obj[m] = (...args) => {
                    try { window.__lastIDEError = args.map(fmt).join(" "); } catch {}
                    return orig(...args);
                };
            });
            return true;
        }
        // try immediately, then retry until consoleOutput exists
        if (!patch(window.consoleOutput)) {
            const t = setInterval(() => {
                if (patch(window.consoleOutput)) clearInterval(t);
            }, 100);
            // stop retrying after ~10s to avoid leaks
            setTimeout(() => clearInterval(t), 10000);
        }
        window.__terminalTapInstalled = true;
    })();

// create the Git Issues URL with error template
function buildIssueURL() {
    const base = `https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`;
    const params = new URLSearchParams({
        //template: "bug_report.yml",
        labels: "bug",
        title: "[Bug] ",
    });

    // context
    const page = window.location.href;
    const ua   = navigator.userAgent;
    const ver  = window.__APP_VERSION ? `\nApp: ${window.__APP_VERSION}` : "";
    const lastJSError = window.__lastError || "None";
    const lastConsoleError = window.__lastConsoleError || "None";
    const lastIDEError = window.__lastIDEError || "None";

    // base template
    const body = [
        `**Type _(UI bug, runtime error, etc.)_:** `,
        `**Page:** ${page}`,
        `**UA:** ${ua}${ver}`,
        "",
        `**Last JavaScript Error (uncaught):** ${lastJSError}`,
        `**Last Console Error:** ${lastConsoleError}`,
        `**Last IDE Error:** ${lastIDEError}`,
        "",
        "**Steps to reproduce:**",
        "_1._",
        "_2._",
        "_3._",
        "",
        "**Expected result:**",
        "",
        "**Actual result:**",
        "",
        "**Additional information:**",
        ""
    ].join("\n");

    params.set("body", body);
    return `${base}?${params.toString()}`;
}

// listen for bug button click
function wireBugButton() {
    const el = document.getElementById("bug-report-btn");
    if (!el) return;

    // immediately set href
    el.href = buildIssueURL();

    el.addEventListener("click", (e) => {
        el.href = buildIssueURL(); // build fresh URL
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireBugButton);
} else {
    wireBugButton();
}
