const GH_OWNER   = "aryansdomain";
const GH_REPO    = "IGCSE-Pseudocode-IDE";
const WORKER_URL = "https://igcse-issue-worker.aryansdomain.workers.dev"; // same as main page

function qs(key, fallback = "") { // get query string parameter
    const v = new URL(location.href).searchParams.get(key);
    return v == null ? fallback : v;
}
const $ = (id) => document.getElementById(id);

// when submitting to github, bold labels for ease of reading
function boldLabels(text) {

    if (!text) return text;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const LABELS_TO_BOLD = [
            "UA",
            "Last JavaScript Error",
            "Last IDE Error",
            "Type (UI issue, runtime error, formatting bug, etc.)",
            "Steps to reproduce",
            "Expected result",
            "Actual result",
            "Additional information"
        ];

        // bold labels
        for (const L of LABELS_TO_BOLD) {
            const prefix = `${L}:`;
            
            if (line.startsWith(prefix)) {
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

    modeBtn.onclick = () => {
        const isLight = document.documentElement.classList.contains('light');
        const newMode = isLight ? 'dark' : 'light';

        setMode(newMode);
    
        localStorage.setItem('ui.mode', newMode);
    };

    // ------------------------ Buttons ------------------------

    closeBtn.onclick = () => window.close();

    // open github url
    openGh.onclick = () => {
        const gh = new URL(`https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`);
        gh.searchParams.set("title", titleEl.value);

        // bold labels
        gh.searchParams.set("body", boldLabels(bodyEl.value));
        gh.searchParams.set("labels", "issue");

        window.open(gh.toString(), "_blank", "noopener");
    };

    // submit to github
    submit.onclick = async () => {
        submit.disabled = true;
        openGh.disabled = true;
        statusEl.textContent = "Submitting…";
        try {
            // talk to api to post to GitHub
            const res = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },

                // bold labels before sending to worker
                body: JSON.stringify({
                    title: titleEl.value.trim(),
                    body: boldLabels(bodyEl.value),
                    labels: ["issue"]
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Worker error");
            window.close(); // close report page
        } catch (e) {
            statusEl.textContent = "Submit failed. Try 'Open in GitHub' instead.";
            submit.disabled = false;
            openGh.disabled = false;
            console.error(e);
        }
    };
})();
