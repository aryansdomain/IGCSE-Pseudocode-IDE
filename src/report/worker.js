export default {
    async fetch(request, env) {

        // read request and headers
        const ct = request.headers.get("Content-Type") || "";
        const url = new URL(request.url);

        const origin = request.headers.get("Origin") || "";
        const allowed = String(env.ALLOWED_ORIGINS).split(",").map(s => s.trim()).filter(Boolean);
        const allow = (origin && allowed.includes(origin)) ? origin : (allowed[0]);

        // which origin is allowed to interact with worker.js?
        const cors = {
            "Access-Control-Allow-Origin": allow,
            "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
        };

        // ------------------------ Methods of Request ------------------------

        // diagnostics check through GitHub
        if (request.method === "GET" && url.pathname === "/__diag") {
            const what = url.searchParams.get("what") || "repo";
            let ghUrl;
            if (what === "user") ghUrl = "https://api.github.com/user";
            else ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;

            // send authentication to GitHub 
            const gh = await fetch(ghUrl, {
                headers: {
                    "Authorization": `Bearer ${env.GITHUB_TOKEN}`, // in wrangler secrets
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "cloudflare-worker",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });
            const raw = await gh.text();

            // return url, HTTP status, and body
            return new Response(JSON.stringify({
                diag: { ghUrl, status: gh.status, statusText: gh.statusText, body: raw }
            }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
        }

        // view file/image after uploaded to R2
        if (request.method === "GET" && url.pathname.startsWith("/issues/")) {
            const key = url.pathname.slice(1);
            
            const obj = await env.BUCKET.get(key);
            if (!obj) return new Response("not found", { status: 404, headers: cors });
            
            // return content type and cache header
            return new Response(obj.body, {
                status: 200,
                headers: {
                    ...cors,

                    // security
                    "X-Content-Type-Options": "nosniff",
                    "X-Frame-Options": "DENY",
                    "Content-Security-Policy": "default-src 'none'",

                    "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
                    "Cache-Control": "public, max-age=31536000, immutable"
                }
            });
        }

        // other GET requests return OK
        if (request.method === "GET")     return new Response("OK", { status: 200, headers: cors });

        // OPTIONS returns empty 204 (browsers call this on startup)
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

        // upload images to R2
        const path = url.pathname.replace(/\/{2,}/g, "/");
        const isUploadPath = path === "/upload" || path === "/upload/" || path.startsWith("/upload?");
        if (request.method === "POST" && isUploadPath) {

            // if the bucket or Workers url is not set
            if (!env.BUCKET || !env.PUBLIC_BASE_URL) {
                return new Response(JSON.stringify({ error: "storage not configured" }), {
                    status: 500, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            // read form data
            let form;
            try {
                form = await request.formData();
            } catch {
                return new Response(JSON.stringify({ error: "use multipart/form-data" }), {
                    status: 415, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            // get all files from form data
            const files = form.getAll("file").filter(f => typeof f !== "string");
            if (!files.length) {
                return new Response(JSON.stringify({ error: "no files" }), {
                    status: 400, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            // do the uploading
            const maxBytes = Number(env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024); // 2 MB
            
            const urls = [];
            for (const file of files) {
                const buf = await file.arrayBuffer();

                // if the file is too large
                if (buf.byteLength > maxBytes) {
                    return new Response(JSON.stringify({ error: "file too large" }), {
                        status: 413, headers: { ...cors, "Content-Type": "application/json" }
                    });
                }
                
                // remove dangerous characters from filename
                const fileName = file.name || "upload";
                const safeName = fileName
                    .replace(/\.\./g, "") // remove chars that move between directories
                    .replace(/[^a-zA-Z0-9._-]/g, "_") // special chars replaced with _
                    .substring(0, 100); // limit length to 100 chars
                
                // make a random key to identify the file
                const key = `issues/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

                // put file in bucket with secret key
                await env.BUCKET.put(key, new Uint8Array(buf), {
                    httpMetadata: { 
                        contentType: file.type || "application/octet-stream",
                        cacheControl: "public, max-age=31536000, immutable"
                    }
                });
                urls.push(`${env.PUBLIC_BASE_URL}/${key}`);
            }

            return new Response(JSON.stringify({ urls }), {
                status: 200, headers: { ...cors, "Content-Type": "application/json" }
            });
        }

        // disallow any other request
        if (request.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

        // create GitHub Issue, POST to GitHub
        try {
            let issue = null;

             // is JSON
            if (ct.includes("application/json") || ct.includes("+json") || ct === "") {
                const target = ct === "" ? request.clone() : request;
                try {
                    issue = await target.json();
                } catch (e) {
                    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
                        status: 400, headers: { ...cors, "Content-Type": "application/json" }
                    });
                }

            // is formData
            } else if (ct.includes("application/x-www-form-urlencoded")) {
                const form = await request.formData();
                issue = {
                    title: form.get("title"),
                    body: form.get("body"),
                    labels: (form.getAll("labels") || ["issue"]).flat()
                };
            } else { // unsupported
                return new Response(JSON.stringify({ error: "unsupported content type", contentType: ct || "unknown" }), {
                    status: 415, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            // get components of issue
            const { title, body, labels = ["issue"], files = [] } = issue || {};

            if (!title || !body) {
                return new Response(JSON.stringify({ error: "title and body required" }), {
                    status: 400, headers: { ...cors, "Content-Type": "application/json" }
                });
            }

            // add file names and urls to body text
            let newBody = body;
            if (Array.isArray(files) && files.length > 0) {
                const list = files.map((item, i) => {
                    const name = (item?.name || `file ${i + 1}`).replace(/\n/g, " ");
                    const url = item?.url || "";
                    return `- [${name}](${url})`;
                }).join("\n");
                newBody += `\n\n### Files\n${list}`;
            }

            // create the GitHub Issue 
            const ghEndpoint = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;
            const gh = await fetch(ghEndpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.GITHUB_TOKEN}`, // in wrangler secrets
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "cloudflare-worker",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title, body: newBody, labels })
            });

            // read response
            const raw = await gh.text();
            let data = null;
            try { data = raw ? JSON.parse(raw) : null; } catch {}

            if (!gh.ok) {
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
            return new Response(JSON.stringify({ error: "server error", details: String(e) }), {
                status: 500, headers: { ...cors, "Content-Type": "application/json" }
            });
        }
    }
}
