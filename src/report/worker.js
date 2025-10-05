export default {
    async fetch(request, env) {

        const ct = request.headers.get("Content-Type") || "";
        const url = new URL(request.url);

        // --- CORS ---
        const origin = request.headers.get("Origin") || "";
        // Parse allowed origins from env (CSV), fall back to single ALLOWED_ORIGIN, else echo origin
        const allowed = (env.ALLOWED_ORIGINS
            ? String(env.ALLOWED_ORIGINS).split(",").map(s => s.trim()).filter(Boolean)
            : (env.ALLOWED_ORIGIN ? [env.ALLOWED_ORIGIN] : []) );
        const allow =
            (origin && allowed.includes(origin)) ? origin :
            (allowed[0] || origin);

        const cors = {
            "Access-Control-Allow-Origin": allow,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
        };

        if (request.method === "GET" && url.pathname === "/__diag") {
            const what = url.searchParams.get("what") || "repo";
            let ghUrl;
            if (what === "user") ghUrl = "https://api.github.com/user";
            else ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

            const gh = await fetch(ghUrl, {
                headers: {
                    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "cloudflare-worker",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });
            const raw = await gh.text(); // read once
            return new Response(JSON.stringify({
                diag: { ghUrl, status: gh.status, statusText: gh.statusText, body: raw }
            }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
        }


        // methods of request
        if (request.method === "GET") return new Response("OK", { status: 200, headers: cors });
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });

        try {
            let payload = null;
            if (ct.includes("application/json")) {

                try {
                    payload = await request.json();
                } catch (e) {
                    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
                        status: 400, headers: { ...cors, "Content-Type": "application/json" }
                    });
                }

            } else if (ct.includes("application/x-www-form-urlencoded")) {

                const form = await request.formData();
                payload = {
                    title: form.get("title"),
                    body: form.get("body"),
                    labels: (form.getAll("labels") || ["bug"]).flat()
                };
                
            } else {
                return new Response(JSON.stringify({ error: "unsupported content-type", contentType: ct }), {
                status: 415, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            const { title, body, labels = ["bug"] } = payload || {};
            if (!title || !body) {
                return new Response(JSON.stringify({ error: "title and body required" }), {
                    status: 400, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            const ghEndpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;
            const gh = await fetch(ghEndpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "cloudflare-worker",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title, body, labels })
            });

            const raw = await gh.text();
            let data = null;
            try { data = raw ? JSON.parse(raw) : null; } catch {}

            if (!gh.ok) {
                console.error("github error", {
                    status: gh.status,
                    statusText: gh.statusText,
                    body: data ?? raw
                });
                return new Response(JSON.stringify({
                    error: (data && data.message) || "github error",
                    status: gh.status,
                    statusText: gh.statusText,
                    body: data ?? raw,
                    endpoint: ghEndpoint
                }), { status: gh.status, headers: { ...cors, "Content-Type": "application/json" } });
            }
            return new Response(JSON.stringify({ html_url: data?.html_url, number: data?.number }), {
                status: 201, headers: { ...cors, "Content-Type": "application/json" }
            });
        } catch (e) {
            console.error("worker exception", e);
            return new Response(JSON.stringify({ error: "server error", details: String(e) }), {
                status: 500, headers: { ...cors, "Content-Type": "application/json" }
            });
        }
    }
}
  