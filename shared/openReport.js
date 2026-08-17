import { formatJSError } from './catchError.js';
import { isLightMode }   from './modeCtrl.js';

// open issue report page
function wireIssueButton() {
    const el = document.getElementById('issueReportBtn');
    if (!el) return;

    el.addEventListener('click', (e) => {
        e.preventDefault();

        // build report.html URL and fill data
        const reportPath = '../report/report.html';
        const url = new URL(reportPath, location.origin);

        // pass info to url
        const lastJSError = formatJSError(window.__lastError);
        const lastIDEError = window.__lastIDEError || 'None';

        if (lastJSError && lastJSError !== 'None') {
            url.searchParams.set('jsError', lastJSError);
        }
        if (lastIDEError && lastIDEError !== 'None') {
            url.searchParams.set('ideError', lastIDEError);
        }

        // detect IDE mode
        const ideMode = isLightMode() ? 'light' : 'dark';
        url.searchParams.set('mode', ideMode);

        // page context: the editor's code, or the active flowchart (pages with a
        // canvas expose __reportChart). the chart is capped so the URL stays usable.
        const chart = window.__reportChart?.() || '';
        url.searchParams.set('page', chart ? 'flowcharts' : 'code');
        url.searchParams.set('code', window.editor?.getValue?.() || '');
        if (chart) url.searchParams.set('chart', chart.slice(0, 4000));

        // open report page
        window.open(url.toString(), '_blank');
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireIssueButton);
else wireIssueButton();
