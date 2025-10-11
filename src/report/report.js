const { initMode } = await import('../ui/modeCtrl.js');

// API vars
const GH_OWNER   = "aryansdomain";
const GH_REPO    = "IGCSE-Pseudocode-IDE";
const WORKER_URL = "https://igcse-issue-worker.aryansdomain.workers.dev";

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
            "Type (UI issue, runtime error, formatting bug, etc.):",
            "Steps to reproduce:",
            "Expected result:",
            "Actual result:",
            "Additional information:",
            "------------------------ PREFILLED INFORMATION ------------------------",
            "UA:",
            "Last JavaScript Error:",
            "Last IDE Error:",
        ];

        // bold labels
        for (const L of LABELS_TO_BOLD) {
            const prefix = `${L}`;
            
            if (line.startsWith(prefix)) {
                lines[i] = `**${L}** ` + line.slice(prefix.length).trimStart();
                break;
            }
        }
        
    }
    return lines.join("\n");
}

(function init() {
    const title      = $("br-title");
    const body       = $("br-body");
    const errorText  = $("errorText");
    const submitBtn  = $("submit");
    const openGHBtn  = $("openGithub");
    const closeBtn   = $("closeBtn");
    const modeBtn    = $("mode");

    // prefill title and body
    title.value = qs("title", "[Issue] ");
    body.value  = qs("body");

    // set mode
    const modeCtrl = initMode({
        themeCtrl: null,
        modeBtn: modeBtn,
        defaultMode: qs("mode") || 'dark',
        page: 'report'
    });

    // ------------------------ Buttons ------------------------
    closeBtn.onclick = () => window.close();

    // open github url
    openGHBtn.onclick = () => {
        errorText.textContent = "";

        const gh = new URL(`https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`);
        gh.searchParams.set("title", title.value);

        // bold labels
        gh.searchParams.set("body", boldLabels(body.value));
        gh.searchParams.set("labels", "issue");

        window.open(gh.toString(), "_blank", "noopener");
    };

    // submit to github
    submitBtn.onclick = async () => {
        submitBtn.disabled = true;
        openGHBtn.disabled = true;
        submitBtn.textContent = "Submitting…";
        errorText.textContent = "";

        try {
            // talk to api to post to GitHub
            const res = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },

                // bold labels before sending to worker
                body: JSON.stringify({
                    title: title.value.trim(),
                    body: boldLabels(body.value),
                    labels: ["issue"]
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Worker error");
            window.close(); // close report page
        } catch (e) {
            submitBtn.textContent = "Submit anonymously"; // reset button text
            errorText.textContent = `Submit failed: ${e.message}. Try reloading the page or clicking 'Open in GitHub' instead.`;
            submitBtn.disabled = false;
            openGHBtn.disabled = false;
            console.error(e);
        }
    };
})();
