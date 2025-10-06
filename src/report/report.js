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
    const openGhBtn  = $("openGithub");
    const closeBtn   = $("closeBtn");
    const modeBtn    = $("mode");

    // prefill title and body
    title.value = qs("title", "[Issue] ");
    body.value  = qs("body");

    // ------------------------ Set Mode ------------------------
    function setMode(mode) {
        // disable transitions during switch
        document.documentElement.classList.add('mode-switching');
        
        if (mode === 'light') {
            document.documentElement.classList.add('light');
            modeBtn.querySelector('i').className = 'fas fa-moon';
        } else {
            document.documentElement.classList.remove('light');
            modeBtn.querySelector('i').className = 'fas fa-sun';
        }
        
        // re-enable transitions
        setTimeout(() => {
            document.documentElement.classList.remove('mode-switching');
        }, 10);
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
    openGhBtn.onclick = () => {
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
        openGhBtn.disabled = true;
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
            openGhBtn.disabled = false;
            console.error(e);
        }
    };
})();
