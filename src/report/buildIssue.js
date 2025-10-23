import { isLightMode } from '../ui/modeCtrl.js';
import { formatJSError } from './catchError.js';

// config
const GH_OWNER = "aryansdomain";
const GH_REPO  = "IGCSE-Pseudocode-IDE";

// create Git Issues URL with error template
function buildIssueURL() {
    const base = `https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`;
    const params = new URLSearchParams({
        //template: "issue_report.yml",
        labels: "issue",
        title: "",
    });

    // context
    const ua  = navigator.userAgent;
    const ver = window.__APP_VERSION ? `\nApp: ${window.__APP_VERSION}` : "";
    const lastJSError = formatJSError(window.__lastError);
    const lastIDEError = window.__lastIDEError || "None";

    // base template
    const body = [
        "Type (UI issue, runtime error, formatting bug, etc.): ",
        "",
        "Steps to reproduce:",
        "1. ",
        "2. ",
        "3. ",
        "",
        "Expected result:",
        "",
        "",
        "",
        "Actual result:",
        "",
        "",
        "",
        "Additional information:",
        "",
        "",
        "",
        "------------------------ PREFILLED INFORMATION ------------------------",
        "",
        `UA: ${ua}\n`,
        ver ? `Version: ${ver}\n\n` : "",
        "Last JavaScript Error:",
        "",
        lastJSError,
        "",
        "Last IDE Error:",
        "",
        lastIDEError,
    ].join("\n");

    params.set("body", body);
    return `${base}?${params.toString()}`;
}

// open issue report page
function wireIssueButton() {
    const el = document.getElementById("issue-report-btn");
    if (!el) return;

    el.addEventListener("click", (e) => {
        e.preventDefault();
        
        // build report.html URL and fill data
        let reportPath = "";

        const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isLocalHost) reportPath = `${GH_REPO}`;
        reportPath += "/src/report/report.html";
        
        const url = new URL(reportPath, location.origin);
        
        // pass info to url
        const lastJSError = formatJSError(window.__lastError);
        const lastIDEError = window.__lastIDEError || "None";
        
        if (lastJSError && lastJSError !== "None") {
            url.searchParams.set("jsError", lastJSError);
        }
        if (lastIDEError && lastIDEError !== "None") {
            url.searchParams.set("ideError", lastIDEError);
        }
        
        // detect IDE mode
        const ideMode = isLightMode() ? 'light' : 'dark';
        url.searchParams.set("mode", ideMode);

        // open report page
        window.open(url.toString(), "_blank", "noopener");
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireIssueButton);
else wireIssueButton();
