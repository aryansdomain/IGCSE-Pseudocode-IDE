const { initMode }        = await import('../ui/modeCtrl.js');
const { initFileUpload }  = await import('./fileUpload.js');

// API vars
const GH_OWNER   = "aryansdomain";
const GH_REPO    = "IGCSE-Pseudocode-IDE";
const WORKER_URL = "https://igcse-issue-worker.aryansdomain.workers.dev";

(function init() {

    // ------------------------ Init ------------------------
    const $ = (id) => document.getElementById(id);
    const errorDialog = $("errorDialog");
    const title       = $("br-title");
    const body        = $("br-body");

    // ------------------------ Utilities ------------------------

    // query string parameter
    function qs(key) {
        const v = new URL(location.href).searchParams.get(key);
        return v || "";
    }

    // when making body, bold labels for ease of reading
    function boldLabels(text) {
        if (!text) return text;

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
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i++) {
            if (LABELS_TO_BOLD.includes(lines[i])) {
                lines[i] = `**${lines[i]}** `;
            }
        }
        return lines.join("\n").trim();
    }

    // show an error in the error dialog
    function showError(message, duration = 3000) {
        errorDialog.textContent = message;
        void errorDialog.offsetHeight;
        errorDialog.classList.add('visible');
        
        // hide after duration
        let errorTimeout;
        errorTimeout = setTimeout(() => {
            errorDialog.classList.remove('visible');
            setTimeout(() => { errorDialog.textContent = ""; }, 300); 
            errorTimeout = null;
        }, duration);
    }
    
    // upload files and append to body
    async function uploadFiles(body) {
        let uploads = [];
        try { 
            uploads = await fileUpload.uploadSelected(); 
        } catch (e) { 
            showError(`Upload failed: ${e.message}`); 
            throw e;
        }
        
        if (uploads.length === 0) return body;
        
        const filesList = uploads.map((u, idx) => {
            const name = (u.name || `file ${idx + 1}`).replace(/\n/g, " ");
            const url = u.url || "";
            return `- [${name}](${url})`;
        }).join("\n");
        
        return body + `\n\n### Files\n${filesList}`;
    }

    // set button state
    function setButtonState({ reset, submitBtnText = "Submit anonymously", gHBtnText = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open in GitHub (requires account)' }) {
        submitBtn.disabled = !reset;
        openGHBtn.disabled = !reset;

        if (reset) {
            submitBtn.textContent = "Submit anonymously";
            openGHBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open in GitHub (requires account)';
        } else {
            submitBtn.textContent = submitBtnText;
            openGHBtn.innerHTML = gHBtnText;
        }
    }

    // ------------------------ Init ------------------------

    // init file upload
    const fileUpload = initFileUpload({
        files: $("br-files"),
        previewContainer: $("filePreviewContainer"),
        attachBtn: $("attachBtn"),
        textareaWrap: body.closest('.textarea-wrap'),
        showError,
        workerUrl: WORKER_URL,
    });

    // init mode control
    const modeCtrl = initMode({
        themeCtrl: null,
        modeBtn: $("mode"),
        defaultMode: qs("mode") || 'dark',
        page: 'report'
    });
    
    // generate template
    body.value =
        "Type (UI issue, runtime error, formatting bug, etc.): \n\n" + 
        "Steps to reproduce:\n" +
        "1. \n" +
        "2. \n" +
        "3. \n\n" +
        "Expected result:\n\n\n\n" + 
        "Actual result:\n\n\n\n" +
        "Additional information:\n\n\n\n" + 
        "------------------------ PREFILLED INFORMATION ------------------------\n\n" +
        `UA: ${navigator.userAgent}\n\n\n` +
        "Last JavaScript Error:\n\n" +
        (qs("jsError") || "None") + "\n\n" +
        "Last IDE Error:\n\n" +
        (qs("ideError") || "None");

    // ------------------------ Buttons ------------------------
    const closeBtn = $("closeBtn");
    const openGHBtn = $("openGithub");
    const submitBtn = $("submit");

    closeBtn.onclick = () => window.close();

    // open in github
    openGHBtn.onclick = async () => {
        setButtonState({ reset: false, gHBtnText: "Opening..." });

        try {
            const gh = new URL(`https://github.com/${GH_OWNER}/${GH_REPO}/issues/new`);
            gh.searchParams.set("title", title.value);
            gh.searchParams.set("labels", "issue");

            // add files to issue message
            let newBody = await uploadFiles(boldLabels(body.value));
            gh.searchParams.set("body", newBody);

            // open the page
            const opened = window.open(gh.toString(), "_blank", "noopener");
            if (!opened) {
                showError("Popup blocked. Please allow popups for this site.");
                setButtonState({ reset: true });
                return;
            }
        } catch (e) {
            showError(`Error: ${e.message}`);
        }

        // reset
        setButtonState({ reset: true });
    };

    // submit anonymously
    submitBtn.onclick = async () => {
        setButtonState({ reset: false, submitBtnText: "Submitting..." });

        try {
            // make sure title, body are present
            if (!title.value.trim() || !body.value.trim()) {
                showError("Submit failed: title and body required");
                setButtonState({ reset: true });
                return;
            }

            // add files to issue message
            let newBody = await uploadFiles(boldLabels(body.value));

            // talk to api to post to GitHub
            const res = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.value,
                    body: newBody,
                    labels: ["issue"],
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Worker error");
            window.close(); // close report page
        } catch (e) {
            showError(`Submit failed: ${e.message}.`);
        }

        // reset
        setButtonState({ reset: true });
    };
})();
