import { isLightMode } from '../ui/modeCtrl.js';
import { formatJSError } from './catchError.js';

// open issue report page
function wireIssueButton() {
    const el = document.getElementById("issue-report-btn");
    if (!el) return;

    el.addEventListener("click", (e) => {
        e.preventDefault();
        
        // build report.html URL and fill data
        const reportPath = "/src/report/report.html";
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
