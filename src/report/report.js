const GH_OWNER   = "aryansdomain";
const GH_REPO    = "IGCSE-Pseudocode-IDE";
const WORKER_URL = "https://igcse-issue-worker.aryansdomain.workers.dev"; // same as main page

function qs(key, fallback = "") { // get query string parameter
    const v = new URL(location.href).searchParams.get(key);
    return v == null ? fallback : v;
}

const $ = (id) => document.getElementById(id);

// when submitting to github, bold labels for ease of reading
function boldLabelsOnly(text) {

    const LABELS_TO_BOLD = [
        "Type (UI issue, runtime error, formatting bug, etc.): ",
        "Page",
        "UA",
        "Last JavaScript Error (uncaught)",
        "Last Console Error",
        "Last IDE Error",
        "Steps to reproduce",
        "Expected result",
        "Actual result",
        "Additional information"
    ];

    if (!text) return text;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const L of LABELS_TO_BOLD) {
            const prefix = `${L}:`;
            
            // Only bold if the line starts with the plain label (avoid double-bold)
            if (line.startsWith(prefix)) {
                // Bold only the label + colon, then add a space before the user text
                lines[i] = `**${L}:** ` + line.slice(prefix.length).trimStart();
                break;
            }
        }
    }
    return lines.join("\n");
}

(function init() {
    const titleEl    = $("br-title");
    const bodyEl     = $("br-body");
    const statusEl   = $("status");
    const submit     = $("submit");
    const openGh     = $("openGithub");
    const closeBtn   = $("closeBtn");
    const modeBtn    = $("mode");

    // prefill title and body
    titleEl.value = qs("title", "[Issue] ");
    bodyEl.value  = qs("body");

    // ------------------------ Set Mode ------------------------
    function setMode(mode) {
        if (mode === 'light') {
            document.documentElement.classList.add('light');
            modeBtn.querySelector('i').className = 'fas fa-moon';
        } else {
            document.documentElement.classList.remove('light');
            modeBtn.querySelector('i').className = 'fas fa-sun';
        }
    }
    setMode(qs("mode"));
    console.log("mode is: " + qs("mode"));

    modeBtn.onclick = () => {
        const isLight = document.documentElement.classList.contains('light');
        const newMode = isLight ? 'dark' : 'light';

        setMode(newMode);
    
        localStorage.setItem('ui.mode', newMode);
    };

    closeBtn.onclick = () => window.close();

    openGh.onclick = () => {
        const gh = new URL(`https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`);
        gh.searchParams.set("title", titleEl.value);

        // bold labels before sending to GitHub
        gh.searchParams.set("body", boldLabelsOnly(bodyEl.value));
        gh.searchParams.set("labels", "issue");

        window.open(gh.toString(), "_blank", "noopener");
    };

    submit.onclick = async () => {
        submit.disabled = true;
        openGh.disabled = true;
        statusEl.textContent = "Submitting…";
        try {
            const res = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },

                // bold labels before sending to worker
                body: JSON.stringify({
                    title: titleEl.value.trim(),
                    body: boldLabelsOnly(bodyEl.value),
                    labels: ["issue"]
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Worker error");
            window.close(); // close the dialog
        } catch (e) {
            statusEl.textContent = "Submit failed. Try 'Open in GitHub' instead.";
            submit.disabled = false;
            openGh.disabled = false;
            console.error(e);
        }
    };
})();
