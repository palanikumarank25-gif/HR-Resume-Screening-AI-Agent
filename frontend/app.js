// window.onerror = function(msg, url, line, col, error) { alert("GLOBAL ERROR: " + msg + "\nAt: " + line + ":" + col); return false; };
// alert("DEBUG: app.js loaded version 1.0.4. If you see this, you have the latest code.");

const API_BASE = "http://127.0.0.1:8000/api";
const TOKEN_KEY = "nexxora_token";
const USER_KEY = "nexxora_user";

const STATE = {
    user: null,
    jobs: [],
    buckets: [],
    matches: [],
    campaigns: [],
    screeningRunId: null,
    screeningMatches: [],
    screeningJobMatchesByCandidate: {},
    campaignPlan: null,
    previewObjectUrl: null,
    ingestionPollTimer: null,
    backendOnline: true,
};

function toJsonSafe(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value ?? "");
}

function uiMessage(id, message, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "#b91c1c" : "#475569";
}

function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
}

function shortId(value, size = 8) {
    if (!value) return "-";
    return `${String(value).slice(0, size)}...`;
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
}

function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function getStoredUser() {
    return toJsonSafe(localStorage.getItem(USER_KEY) || "null");
}

async function apiRequest(path, options = {}) {
    const { method = "GET", body, auth = true, isForm = false, timeout = 10000 } = options;
    const headers = {};
    if (!isForm) headers["Content-Type"] = "application/json";
    if (auth && getToken()) headers.Authorization = `Token ${getToken()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    console.log(`[API] ${method} ${path}`, body || "");

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
            signal: controller.signal,
        });
        clearTimeout(timer);

        const text = await response.text();
        const data = toJsonSafe(text) ?? { raw: text };

        if (!response.ok) {
            console.error(`[API ERROR] ${method} ${path}`, data);
            if (response.status === 401 && location.pathname.toLowerCase().includes("app.html")) {
                clearSession();
                location.href = "auth.html";
            }
            const msg = data?.error || data?.detail || data?.message || `Error ${response.status}: ${response.statusText || 'Request failed'}`;
            throw new Error(msg);
        }
        updateBackendStatus(true);
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[API TIMEOUT] ${method} ${path}`);
            throw new Error(`Request timed out after ${timeout}ms (${path}). The server is taking too long.`);
        }
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            updateBackendStatus(false);
            throw new Error("Cannot connect to backend server. Please ensure the Django backend is running at " + API_BASE);
        }
        throw error;
    }
}

function updateBackendStatus(online) {
    STATE.backendOnline = online;
    const indicator = document.getElementById("backend-status-indicator");
    if (indicator) {
        indicator.className = `status-dot ${online ? 'online' : 'offline'}`;
        indicator.title = online ? 'Backend Connected' : 'Backend Disconnected - Run OneClick_Start.bat';
    }
    
    const messageEl = document.getElementById("backend-connection-warning");
    if (!online) {
        if (!messageEl) {
            const warning = document.createElement("div");
            warning.id = "backend-connection-warning";
            warning.innerHTML = `
                <div style="background: #fee2e2; color: #991b1b; padding: 10px 20px; border-bottom: 2px solid #ef4444; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 9999;">
                    <span>⚠️ <b>Backend Disconnected:</b> Please ensure the Django server is running. 
                    <small style="display:block; opacity: 0.8;">Run <code>OneClick_Start.bat</code> in the project root.</small></span>
                    <button onclick="checkBackendStatus()" class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;">Retry Connection</button>
                </div>`;
            document.body.prepend(warning);
        }
    } else if (messageEl) {
        messageEl.remove();
    }
}

async function checkBackendStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        await fetch(`${API_BASE}/auth/login/`, { 
            method: "OPTIONS",
            signal: controller.signal,
            mode: 'cors'
        });
        clearTimeout(timeoutId);
        updateBackendStatus(true);
    } catch (err) {
        console.error("Backend status check failed:", err);
        updateBackendStatus(false);
    }
}


function parseCsvIds(raw) {
    return (raw || "")
        .split(/[\s,]+/g)
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseHolidays(raw) {
    return (raw || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function getViewFromHash() {
    const raw = (window.location.hash || "").replace("#", "").trim().toLowerCase();
    const aliases = {
        dashboard: "overview",
        jobs: "jdstudio",
        "job-configs": "jdstudio",
        upload: "ingestion",
        email: "interviews",
    };
    return aliases[raw] || raw || "overview";
}

function updateIngestionSdkSnippet() {
    const code = document.getElementById("ingest-sdk-python");
    if (!code) return;
    const token = getToken() || "<YOUR_TOKEN>";
    code.textContent = `# pip install requests
import requests
from pathlib import Path

API_BASE = "http://127.0.0.1:8000/api"
TOKEN = "${token}"
HEADERS = {"Authorization": f"Token {TOKEN}"}

# Dump path ingestion (recommended for 10,000+ resumes)
requests.post(f"{API_BASE}/ingest/path/", json={
    "source_path": r"C:\\\\Users\\\\palan\\\\Documents\\\\Resumes PDF",
    "run_async": True
}, headers=HEADERS, timeout=120)

# File-by-file upload API
for p in Path(r"C:\\\\Users\\\\palan\\\\Documents\\\\Resumes PDF").rglob("*"):
    if p.suffix.lower() in {".pdf", ".docx", ".doc", ".txt"}:
        with p.open("rb") as f:
            requests.post(f"{API_BASE}/upload-resume/", headers=HEADERS, files={"resume": (p.name, f)})`;
}

async function initAuthPage() {
    const token = getToken();
    if (token) {
        try {
            await apiRequest("/auth/me/");
            location.href = "app.html#overview";
            return;
        } catch {
            clearSession();
        }
    }

    const loginTab = document.querySelector('.tab-btn[data-tab="login"]');
    const signupTab = document.querySelector('.tab-btn[data-tab="signup"]');
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");

    function showTab(tab) {
        const loginActive = tab === "login";
        loginTab?.classList.toggle("active", loginActive);
        signupTab?.classList.toggle("active", !loginActive);
        if (loginForm) loginForm.style.display = loginActive ? "grid" : "none";
        if (signupForm) signupForm.style.display = loginActive ? "none" : "grid";
        uiMessage("auth-message", "");
    }

    loginTab?.addEventListener("click", () => showTab("login"));
    signupTab?.addEventListener("click", () => showTab("signup"));

    loginForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        uiMessage("auth-message", "Signing in...");
        try {
            const payload = {
                email: document.getElementById("login-email")?.value?.trim(),
                password: document.getElementById("login-password")?.value,
            };
            const data = await apiRequest("/auth/login/", { method: "POST", body: payload, auth: false });
            setSession(data.token, data.user);
            location.href = "app.html#overview";
        } catch (error) {
            uiMessage("auth-message", error.message, true);
        }
    });

    signupForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        uiMessage("auth-message", "Creating account...");
        try {
            const payload = {
                name: document.getElementById("signup-name")?.value?.trim(),
                email: document.getElementById("signup-email")?.value?.trim(),
                password: document.getElementById("signup-password")?.value,
            };
            const data = await apiRequest("/auth/signup/", { method: "POST", body: payload, auth: false });
            setSession(data.token, data.user);
            location.href = "app.html#overview";
        } catch (error) {
            uiMessage("auth-message", error.message, true);
        }
    });
}

async function ensureAppAuth() {
    if (!getToken()) {
        location.href = "auth.html";
        return false;
    }
    try {
        STATE.user = await apiRequest("/auth/me/");
        setText("topbar-user-chip", `${STATE.user.name || "User"} | ${STATE.user.email || ""}`);
        return true;
    } catch {
        clearSession();
        location.href = "auth.html";
        return false;
    }
}

function bindNavigation() {
    document.querySelectorAll(".app-nav button").forEach((btn) => {
        btn.addEventListener("click", () => {
            const view = btn.getAttribute("data-view");
            if (!view) return;
            window.location.hash = view;
            activateView(view);
        });
    });
    window.addEventListener("hashchange", () => activateView(getViewFromHash()));
}

async function activateView(viewName) {
    const known = new Set([
        "overview",
        "ingestion",
        "buckets",
        "jdstudio",
        "screening",
        "candidates",
        "interviews",
        "analytics",
        "settings",
    ]);
    const view = known.has(viewName) ? viewName : "overview";
    if (view !== "ingestion" && STATE.ingestionPollTimer) {
        clearInterval(STATE.ingestionPollTimer);
        STATE.ingestionPollTimer = null;
    }
    document.querySelectorAll(".app-nav button").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-view") === view);
    });
    document.querySelectorAll(".view").forEach((section) => {
        section.classList.toggle("active", section.id === `view-${view}`);
    });

    if (view === "overview") await loadOverview();
    if (view === "ingestion") await loadIngestionView();
    if (view === "buckets") await loadBucketsView();
    if (view === "jdstudio") await loadJDStudioView();
    if (view === "screening") await loadScreeningView();
    if (view === "candidates") await loadCandidatesView();
    if (view === "interviews") await loadInterviewsView();
    if (view === "analytics") await loadAnalyticsView();
    if (view === "settings") await loadSettingsView();
}

function renderActivity(activity) {
    const container = document.getElementById("activity-list");
    if (!container) return;
    if (!activity?.length) {
        container.innerHTML = '<div class="hint">No recent activity yet.</div>';
        return;
    }
    container.innerHTML = activity
        .map(
            (item) => `
        <article class="activity-item">
            <div><b>${escapeHtml(item.title || "-")}</b></div>
            <div>${escapeHtml(item.detail || "")}</div>
            <div class="meta">${escapeHtml(item.type || "")} | ${formatDateTime(item.timestamp)}</div>
        </article>`
        )
        .join("");
}

function renderOverviewBuckets(items) {
    const container = document.getElementById("overview-buckets");
    if (!container) return;
    if (!items?.length) {
        container.innerHTML = '<div class="hint">No buckets yet.</div>';
        return;
    }
    const max = Math.max(...items.map((i) => i.resume_count || 1));
    container.innerHTML = items
        .map(
            (bucket) => {
                const pct = Math.round(((bucket.resume_count || 0) / max) * 100);
                return `
                <div class="activity-item" style="position: relative; overflow: hidden; padding: 0.8rem;">
                    <div style="position: absolute; top:0; left:0; height:100%; width:${pct}%; background: rgba(2, 132, 199, 0.04); border-right: 2px solid rgba(2, 132, 199, 0.1); pointer-events: none;"></div>
                    <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(bucket.name)}</div>
                        <div class="user-chip" style="font-size: 0.75rem;">${bucket.resume_count || 0} resumes</div>
                    </div>
                </div>`;
            }
        )
        .join("");
}

async function loadOverview() {
    try {
        const payload = await apiRequest("/workspace/overview/");
        const summary = payload.summary || {};
        setText("kpi-candidates", summary.total_candidates || 0);
        setText("kpi-buckets", summary.total_buckets || 0);
        setText("kpi-jobs", summary.active_jobs || 0);
        setText("kpi-runs", summary.screening_runs || 0);
        setText("kpi-shortlisted", summary.shortlisted || 0);
        setText("kpi-selected", summary.selected || 0);
        setText("kpi-booked", summary.booked_interviews || 0);
        setText("kpi-upcoming", summary.upcoming_interviews || 0);
        renderActivity(payload.activity || []);
        renderOverviewBuckets(payload.top_buckets || []);
    } catch (error) {
        renderActivity([]);
        uiMessage("screen-message", error.message, true);
    }
}

async function runIngestion(runAsync = false) {
    const sourcePath = document.getElementById("ingest-path")?.value?.trim();
    const maxFilesRaw = document.getElementById("ingest-max-files")?.value?.trim();
    const maxFiles = maxFilesRaw ? Number(maxFilesRaw) : null;
    if (!sourcePath) {
        uiMessage("ingest-message", "Please provide source path", true);
        return;
    }
    let effectiveAsync = runAsync;
    if (!effectiveAsync && Number.isFinite(maxFiles) && maxFiles > 2000) {
        effectiveAsync = true;
        uiMessage("ingest-message", "Large volume detected. Auto-switching to async queue...");
    } else {
        uiMessage("ingest-message", effectiveAsync ? "Queueing ingestion..." : "Running ingestion...");
    }
    try {
        const result = await apiRequest("/ingest/path/", {
            method: "POST",
            body: {
                source_path: sourcePath,
                max_files: Number.isFinite(maxFiles) ? maxFiles : null,
                run_async: effectiveAsync,
            },
        });
        if (effectiveAsync) {
            const detected = result.detected_files ? ` Files detected: ${result.detected_files}.` : "";
            uiMessage("ingest-message", `Queued. Task: ${result.task_id}.${detected}`);
        } else {
            uiMessage(
                "ingest-message",
                `Completed. Success ${result.success_files}, failed ${result.failed_files}, skipped ${result.skipped_files}.`
            );
        }
        await Promise.all([loadIngestionRuns(), loadOverview(), loadBucketsView()]);
    } catch (error) {
        uiMessage("ingest-message", error.message, true);
    }
}

async function loadIngestionRuns() {
    const tbody = document.getElementById("ingestion-table");
    if (!tbody) return;
    try {
        const runs = await apiRequest("/ingestions/");
        if (!runs.length) {
            tbody.innerHTML = '<tr><td colspan="7">No ingestion runs yet.</td></tr>';
            return;
        }
        tbody.innerHTML = runs
            .slice(0, 50)
            .map(
                (run) => {
                    const statusClass = run.status?.toLowerCase() === 'completed' ? 'status-pill-success' : 
                                      (run.status?.toLowerCase() === 'failed' ? 'status-pill-error' : 'status-pill-warning');
                    const progress = run.total_files ? Math.round((run.processed_files / run.total_files) * 100) : 0;
                    const sourceType = run.source_path ? 'Path' : 'Direct';
                    
                    return `
                    <tr style="height: 60px;">
                        <td title="${escapeHtml(run.id)}" style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(shortId(run.id, 8))}</td>
                        <td><span class="status-pill ${statusClass}" style="padding: 0.3rem 0.6rem; border-radius: 4px; font-weight: 700;">${escapeHtml(run.status || 'PENDING')}</span></td>
                        <td><span class="user-chip">${sourceType}</span></td>
                        <td>
                            <div style="font-size: 0.8rem; margin-bottom: 0.3rem;">${run.processed_files || 0} / ${run.total_files || 0}</div>
                            <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.05); border-radius: 3px; overflow: hidden;">
                                <div style="width: ${progress}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
                            </div>
                        </td>
                        <td style="color: #059669; font-weight: 700;">${run.success_files || 0}</td>
                        <td style="color: #dc2626; font-weight: 700;">${run.failed_files || 0}</td>
                        <td style="color: #64748b;">${run.skipped_files || 0}</td>
                    </tr>`;
                }
            )
            .join("");
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="hint">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function uploadResumes(runAsync = false) {
    const fileInput = document.getElementById("ingest-file-upload");
    const files = fileInput?.files;
    if (!files || files.length === 0) {
        uiMessage("upload-message", "Please select at least one resume file", true);
        return;
    }

    uiMessage("upload-message", runAsync ? "Queueing files asynchronously..." : "Uploading files...");

    try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append("resume", files[i]);
        }
        formData.append("run_async", runAsync.toString());

        const result = await apiRequest("/upload-resume/", {
            method: "POST",
            body: formData,
            isForm: true
        });

        if (runAsync) {
            uiMessage("upload-message", `Queued ${files.length} files for background processing.`);
        } else {
            uiMessage("upload-message", `Successfully uploaded ${files.length} files.`);
        }
        
        // Reset file input
        if (fileInput) fileInput.value = "";
        await Promise.all([loadOverview(), loadBucketsView(), loadCandidatesView()]);
    } catch (error) {
        uiMessage("upload-message", error.message, true);
    }
}

async function loadIngestionView() {
    const syncBtn = document.getElementById("ingest-run-sync");
    if (syncBtn && !syncBtn.dataset.bound) {
        syncBtn.dataset.bound = "1";
        syncBtn.addEventListener("click", () => runIngestion(false));
    }
    
    const uploadSyncBtn = document.getElementById("ingest-upload-sync");
    const uploadAsyncBtn = document.getElementById("ingest-upload-async");
    if (uploadSyncBtn && !uploadSyncBtn.dataset.bound) {
        uploadSyncBtn.dataset.bound = "1";
        uploadSyncBtn.addEventListener("click", () => uploadResumes(false));
    }
    if (uploadAsyncBtn && !uploadAsyncBtn.dataset.bound) {
        uploadAsyncBtn.dataset.bound = "1";
        uploadAsyncBtn.addEventListener("click", () => uploadResumes(true));
    }

    // Drop Zone Logic
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("ingest-file-upload");
    if (dropZone && fileInput && !dropZone.dataset.bound) {
        dropZone.dataset.bound = "1";
        dropZone.addEventListener("click", () => fileInput.click());
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("active");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("active"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("active");
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                const msg = e.dataTransfer.files.length === 1 ? e.dataTransfer.files[0].name : `${e.dataTransfer.files.length} files selected`;
                uiMessage("upload-message", msg);
            }
        });
        fileInput.addEventListener("change", () => {
            if (fileInput.files.length > 0) {
                const msg = fileInput.files.length === 1 ? fileInput.files[0].name : `${fileInput.files.length} files selected`;
                uiMessage("upload-message", msg);
            }
        });
    }

    // Copy SDK Logic
    const copyBtn = document.getElementById("copy-sdk-btn");
    if (copyBtn && !copyBtn.dataset.bound) {
        copyBtn.dataset.bound = "1";
        copyBtn.addEventListener("click", () => {
            const code = document.getElementById("ingest-sdk-python")?.innerText || "";
            navigator.clipboard.writeText(code).then(() => {
                const oldText = copyBtn.innerText;
                copyBtn.innerText = "Copied!";
                copyBtn.style.color = "#10b981";
                setTimeout(() => {
                    copyBtn.innerText = oldText;
                    copyBtn.style.color = "";
                }, 2000);
            });
        });
    }

    updateIngestionSdkSnippet();
    await loadIngestionRuns();
    if (!STATE.ingestionPollTimer) {
        STATE.ingestionPollTimer = setInterval(() => {
            loadIngestionRuns().catch(() => null);
        }, 5000);
    }
}

function renderBucketRows() {
    const tbody = document.getElementById("bucket-table");
    if (!tbody) return;
    const search = (document.getElementById("bucket-search")?.value || "").trim().toLowerCase();
    const rows = STATE.buckets.filter((row) => {
        if (!search) return true;
        return (
            row.name.toLowerCase().includes(search) ||
            (row.keywords || []).join(" ").toLowerCase().includes(search) ||
            (row.roles_sample || []).join(" ").toLowerCase().includes(search)
        );
    });

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4">No buckets found.</td></tr>';
        return;
    }
    tbody.innerHTML = rows
        .map(
            (row) => `
        <tr>
            <td style="font-weight: 700; color: #0f172a;">${escapeHtml(row.name)}</td>
            <td><span class="score-pill" style="background: rgba(2, 132, 199, 0.1); color: #0369a1; font-weight: 700;">${row.candidates_count ?? row.resume_count ?? 0}</span></td>
            <td class="hint">${escapeHtml((row.keywords || []).slice(0, 5).join(", ") || "-")}</td>
            <td class="hint" style="font-style: italic; font-size: 0.8rem;">${escapeHtml((row.roles_sample || []).slice(0, 3).join(" • ") || "-")}</td>
        </tr>`
        )
        .join("");
}

async function loadBucketsView() {
    const searchInput = document.getElementById("bucket-search");
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "1";
        searchInput.addEventListener("input", renderBucketRows);
    }
    try {
        const [summary, fullRows] = await Promise.all([
            apiRequest("/buckets/summary/"),
            apiRequest("/buckets/"),
        ]);
        const fallbackMap = Object.fromEntries((summary.items || []).map((r) => [r.slug, r]));
        STATE.buckets = (fullRows || []).map((row) => ({
            ...row,
            resume_count: row.candidates_count ?? fallbackMap[row.slug]?.resume_count ?? 0,
        }));
        renderBucketRows();
        setText("kpi-buckets", summary.total_buckets || 0);
    } catch (error) {
        const tbody = document.getElementById("bucket-table");
        if (tbody) tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
    }
}

function populateJobSelects() {
    const selectIds = ["screen-job-select", "candidate-job-filter"];
    for (const id of selectIds) {
        const select = document.getElementById(id);
        if (!select) continue;
        const current = select.value;
        const first =
            id === "screen-job-select"
                ? '<option value="">Custom JD mode</option>'
                : '<option value="">All JDs</option>';
        select.innerHTML =
            first +
            STATE.jobs
                .map(
                    (job) =>
                        `<option value="${job.id}">${escapeHtml(job.external_jd_id || shortId(job.id, 10))} | ${escapeHtml(job.title)}</option>`
                )
                .join("");
        if (current) select.value = current;
    }
}

function renderJobsTable() {
    const tbody = document.getElementById("jobs-table");
    if (!tbody) return;
    if (!STATE.jobs.length) {
        tbody.innerHTML = '<tr><td colspan="5">No JDs yet.</td></tr>';
        return;
    }
    tbody.innerHTML = STATE.jobs
        .map(
            (job) => `
        <tr>
            <td class="hint" style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(job.external_jd_id || shortId(job.id, 12))}</td>
            <td style="font-weight: 700;">${escapeHtml(job.title)}</td>
            <td><span class="user-chip" style="font-size: 0.75rem; background: rgba(22, 101, 52, 0.05); color: #166534; border: 1px solid rgba(22, 101, 52, 0.1);">${escapeHtml(job.status || "Active")}</span></td>
            <td class="hint">${escapeHtml(job.required_skills || "-")}</td>
            <td><span class="score-pill" style="font-size: 0.8rem; background: rgba(148, 163, 184, 0.1); color: #475569;">${job.min_experience ?? 0} yrs</span></td>
        </tr>`
        )
        .join("");
}

async function refreshJobs() {
    STATE.jobs = await apiRequest("/jobs/");
    renderJobsTable();
    populateJobSelects();
}

async function enhanceJD() {
    const title = document.getElementById("jd-title")?.value?.trim();
    const raw = document.getElementById("jd-raw")?.value?.trim();
    if (!raw) {
        uiMessage("jd-message", "JD text is required for enhancement.", true);
        return;
    }
    uiMessage("jd-message", "Enhancing JD...");
    try {
        const data = await apiRequest("/jobs/enhance-jd/", {
            method: "POST",
            body: { title, jd_text: raw },
        });
        const titleInput = document.getElementById("jd-title");
        if (titleInput && !titleInput.value.trim() && data.title) {
            titleInput.value = data.title;
        }

        document.getElementById("jd-id-preview").value = data.jd_id_preview || "";
        document.getElementById("jd-skills-preview").value = (data.skills || []).join(", ");
        document.getElementById("jd-min-exp-preview").value = data.min_experience ?? 0;
        document.getElementById("jd-enhanced").value = data.enhanced_text || raw;
        uiMessage("jd-message", `JD enhanced. LLM used: ${data.llm_used ? "true" : "false"}`);
    } catch (error) {
        uiMessage("jd-message", error.message, true);
    }
}

async function saveJD() {
    const title = document.getElementById("jd-title")?.value?.trim();
    const raw = document.getElementById("jd-raw")?.value?.trim();
    const enhanced = document.getElementById("jd-enhanced")?.value?.trim();
    const skills = document.getElementById("jd-skills-preview")?.value?.trim();
    const minExp = Number(document.getElementById("jd-min-exp-preview")?.value || 0);

    const externalJdId = document.getElementById("jd-id-preview")?.value?.trim();
    
    if (!title || !(enhanced || raw)) {
        uiMessage("jd-message", "Provide JD title and content before save.", true);
        return;
    }
    uiMessage("jd-message", "Saving JD...");
    try {
        const payload = {
            title,
            description: enhanced || raw,
            required_skills: skills || "",
            min_experience: Number.isFinite(minExp) ? minExp : 0,
            status: "Active",
            external_jd_id: externalJdId || undefined,
        };
        const job = await apiRequest("/jobs/", { method: "POST", body: payload });
        uiMessage("jd-message", `JD saved: ${job.external_jd_id || job.id}`);
        await Promise.all([refreshJobs(), loadOverview()]);
    } catch (error) {
        uiMessage("jd-message", error.message, true);
    }
}

async function loadJDStudioView() {
    const enhanceBtn = document.getElementById("jd-enhance-btn");
    const saveBtn = document.getElementById("jd-save-btn");
    if (enhanceBtn && !enhanceBtn.dataset.bound) {
        enhanceBtn.dataset.bound = "1";
        enhanceBtn.addEventListener("click", enhanceJD);
    }
    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = "1";
        saveBtn.addEventListener("click", saveJD);
    }
    await refreshJobs();
}

function renderAgentTrace(trace) {
    const box = document.getElementById("agent-trace");
    if (!box) return;
    if (!trace?.length) {
        box.innerHTML = '<div class="hint">No trace yet.</div>';
        return;
    }
    box.innerHTML = trace
        .map(
            (item) => `
        <article class="activity-item">
            <div><b>${escapeHtml(item.agent || "Agent")}</b></div>
            <div class="meta">Status: ${escapeHtml(item.status || "-")}</div>
            <div class="meta">${escapeHtml(JSON.stringify(item))}</div>
        </article>`
        )
        .join("");
}

function renderScreenAnalytics(analytics) {
    const box = document.getElementById("screen-analytics");
    if (!box) return;
    if (!analytics) {
        box.innerHTML = '<div class="hint">Run analytics will appear here.</div>';
        return;
    }
    const buckets = analytics.bucket_distribution || {};
    const bucketRows = Object.keys(buckets).length
        ? Object.entries(buckets)
              .map(([k, v]) => `<div class="meta">${escapeHtml(k)}: ${v}</div>`)
              .join("")
        : '<div class="meta">No bucket distribution yet.</div>';
    box.innerHTML = `
        <article class="activity-item"><b>${escapeHtml(analytics.jd_title || "-")}</b></article>
        <article class="activity-item">Total matches: <b>${analytics.total_matches ?? 0}</b></article>
        <article class="activity-item">Shortlisted estimate: <b>${analytics.shortlisted_estimate ?? 0}</b></article>
        <article class="activity-item">Average score: <b>${analytics.avg_score ?? 0}</b></article>
        <article class="activity-item">Score range: <b>${analytics.min_score ?? 0}</b> - <b>${analytics.max_score ?? 0}</b></article>
        <article class="activity-item"><b>Bucket Distribution</b>${bucketRows}</article>`;
}

function normalizeScreenRows(runPayload) {
    const matches = runPayload?.matches || [];
    return matches.map((m) => ({
        candidate_id: m.candidate,
        candidate_name: m.candidate_name || "Unknown Candidate",
        candidate_email: m.candidate_email || "N/A",
        candidate_bucket: m.candidate_bucket || "General",
        score: m.final_score ?? m.match_score ?? 0,
        reasoning: m.reasoning || m.match_reasoning || "No reasoning provided.",
    }));
}

function renderScreenResultCards() {
    const wrap = document.getElementById("screen-results-cards");
    if (!wrap) return;
    const rows = STATE.screeningMatches || [];
    if (!rows.length) {
        if (STATE.screeningRunId) {
            wrap.innerHTML = '<div class="hint" style="color:#b91c1c;">No matching candidates found for this JD and criteria. Try lower min score or Top K.</div>';
        } else {
            wrap.innerHTML = '<div class="hint">Run screening to see candidates.</div>';
        }
        return;
    }
    wrap.innerHTML = rows
        .map((row) => {
            const score = Number(row.score || 0);
            const pillClass = score >= 70 ? "ok" : score >= 50 ? "" : "bad";
            const persisted = STATE.screeningJobMatchesByCandidate[row.candidate_id];
            const resumeBtn = persisted?.candidate_resume_url
                ? `<button class="btn btn-secondary" data-open-resume="${persisted.id}">View Resume</button>`
                : "";
            const decisionButtons = persisted
                ? `
                <button class="btn btn-primary" data-screen-decision="${persisted.id}:selected">Select</button>
                <button class="btn btn-secondary" data-screen-decision="${persisted.id}:shortlisted">Shortlist</button>
                <button class="btn btn-secondary" data-screen-decision="${persisted.id}:rejected">Reject</button>
            `
                : "";
            return `
            <article class="candidate-card">
                <div><b>${escapeHtml(row.candidate_name || row.candidate_id)}</b></div>
                <div class="meta">${escapeHtml(row.candidate_email || "-")}</div>
                <div class="meta">${escapeHtml(row.candidate_bucket || "General")}</div>
                <div style="margin:0.5rem 0;">
                    <span class="score-pill ${pillClass}">Score ${score.toFixed(2)}</span>
                </div>
                <div class="hint">${escapeHtml(row.reasoning || "-")}</div>
                <div class="row-actions" style="margin-top:0.6rem;">${resumeBtn}${decisionButtons}</div>
            </article>`;
        })
        .join("");
}

async function loadScreeningAnalytics(runId) {
    try {
        const data = await apiRequest(`/screenings/${runId}/analytics/`);
        renderScreenAnalytics(data);
    } catch (error) {
        renderScreenAnalytics(null);
        uiMessage("screen-message", error.message, true);
    }
}

async function mapScreeningCandidatesToJobMatches(jobId) {
    STATE.screeningJobMatchesByCandidate = {};
    if (!jobId) return;
    try {
        const rows = await apiRequest(`/matches/?job=${jobId}`);
        const mapping = {};
        for (const row of rows) mapping[row.candidate] = row;
        STATE.screeningJobMatchesByCandidate = mapping;
    } catch {
        STATE.screeningJobMatchesByCandidate = {};
    }
}

async function loadScreeningAnalytics(runId) {
    if (!runId) return;
    try {
        const data = await apiRequest(`/screenings/${runId}/analytics/`);
        renderScreenAnalytics(data);
    } catch (error) {
        console.warn("Could not load screening analytics:", error);
    }
}

async function submitDecision(matchId, decision, note) {
    const reviewer = STATE.user?.name || "HR Reviewer";
    await apiRequest(`/matches/${matchId}/decision/`, {
        method: "POST",
        body: {
            decision,
            reviewer_name: reviewer,
            review_note: note || "",
        },
    });
}

async function runScreening({ useAgentic = false, runAsync = false }) {
    const jobId = document.getElementById("screen-job-select")?.value || "";
    const topK = Number(document.getElementById("screen-top-k")?.value || 40);
    const minScore = Number(document.getElementById("screen-min-score")?.value || 0);
    const strategy = document.getElementById("screen-strategy")?.value || "hybrid";
    const jdTitle = document.getElementById("screen-jd-title")?.value?.trim() || "Dynamic JD";
    const jdTextInput = document.getElementById("screen-jd-text")?.value?.trim() || "";
    const selectedJob = STATE.jobs.find((j) => j.id === jobId);
    const fallbackJdText = selectedJob?.jd_enhanced_text || selectedJob?.description || "";
    const jdText = jdTextInput || fallbackJdText;

    console.log("runScreening starting...", { jobId, useAgentic, runAsync });

    if (!jobId && !jdText) {
        uiMessage("screen-message", "⚠️ Please select a Job Description from the dropdown, or enter custom JD text below.", true);
        return;
    }

    uiMessage("screen-message", useAgentic ? "⏳ Running agentic reasoning pipeline..." : runAsync ? "⏳ Queueing background screening..." : "⏳ Running vector screening...");
    renderAgentTrace([]);
    renderScreenAnalytics(null);
    STATE.screeningMatches = [];
    STATE.screeningJobMatchesByCandidate = {};
    STATE.screeningRunId = null;
    renderScreenResultCards();

    try {
        if (useAgentic) {
            const payload = {
                jd_title: jdTitle || selectedJob?.title || "Dynamic JD",
                jd_text: jdText,
                top_k: Number.isFinite(topK) ? topK : 40,
                min_score: Number.isFinite(minScore) ? minScore : 0,
                strategy,
            };
            console.log("DEBUG: About to call /agentic/run/ (Wait up to 120s)...");
            const data = await apiRequest("/agentic/run/", { method: "POST", body: payload, timeout: 120000 });
            console.log("DEBUG: /agentic/run/ success! run_id=" + data.run_id);
            STATE.screeningRunId = data.run_id;
            renderAgentTrace(data.agent_trace || []);
            renderScreenAnalytics(data.analytics || null);
            
            // Consistently fetch detail from the server after the run
            const runData = await apiRequest(`/screenings/${data.run_id}/`);
            STATE.screeningMatches = normalizeScreenRows(runData);
            await mapScreeningCandidatesToJobMatches(jobId);
            renderScreenResultCards();
            uiMessage("screen-message", `Agentic run complete. Found ${STATE.screeningMatches.length} matches.`);
        } else {
            const payload = {
                top_k: Number.isFinite(topK) ? topK : 40,
                min_score: Number.isFinite(minScore) ? minScore : 0,
                strategy,
                run_async: runAsync,
            };
            if (jobId) {
                payload.job_id = jobId;
            } else {
                payload.jd_title = jdTitle;
                payload.jd_text = jdText;
            }
            console.log("DEBUG: About to call /screenings/ (Wait up to 60s)...");
            const data = await apiRequest("/screenings/", { method: "POST", body: payload, timeout: 60000 });
            console.log("DEBUG: /screenings/ success! id=" + (data.id || data.run_id));
            const currentRunId = data.id || data.run_id;
            STATE.screeningRunId = currentRunId;

            if (runAsync) {
                uiMessage("screen-message", `Queued (Task: ${data.task_id || '...'}). Results will load automatically...`);
                pollScreeningResult(currentRunId, jobId);
                return;
            }

            STATE.screeningMatches = normalizeScreenRows(data);
            await mapScreeningCandidatesToJobMatches(jobId);
            renderScreenResultCards();
            // Load analytics without blocking the result display
            if (currentRunId) loadScreeningAnalytics(currentRunId).catch(() => null);
            renderAgentTrace([{ agent: "VectorScreeningPipeline", status: "completed", run_id: currentRunId, matches_found: STATE.screeningMatches.length, note: data.notes || "" }]);
            uiMessage("screen-message", `✅ Screening complete (${data.processing_ms || "?"}ms). Found ${STATE.screeningMatches.length} match(es).`);
        }
        await Promise.all([loadOverview(), loadCandidatesView()]);
    } catch (error) {
        console.error("[runScreening] FAILED:", error);
        uiMessage("screen-message", `❌ ${error.message}`, true);
        renderScreenResultCards(); // Show empty state / existing results
    }
}

async function pollScreeningResult(runId, jobId) {
    if (!runId) {
        console.warn("[pollScreeningResult] No runId provided - cannot poll");
        uiMessage("screen-message", "⚠️ Could not get run ID for polling. Check Candidates tab for results.", true);
        return;
    }
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    while (attempts < maxAttempts) {
        attempts++;
        try {
            const run = await apiRequest(`/screenings/${runId}/`);
            const runStatus = (run.status || "").toUpperCase();
            uiMessage("screen-message", `⏳ Background run status: ${runStatus} (${attempts}s)...`);
            if (runStatus === "COMPLETED") {
                STATE.screeningMatches = normalizeScreenRows(run);
                STATE.screeningRunId = runId;
                await mapScreeningCandidatesToJobMatches(jobId);
                renderScreenResultCards();
                loadScreeningAnalytics(runId).then(renderScreenAnalytics).catch(() => null);
                renderAgentTrace([{ agent: "BackgroundScreeningPipeline", status: "completed", run_id: runId, matches_found: STATE.screeningMatches.length }]);
                uiMessage("screen-message", `✅ Background results loaded. Found ${STATE.screeningMatches.length} match(es).`);
                await Promise.all([loadOverview(), loadCandidatesView()]).catch(() => null);
                return;
            } else if (runStatus === "FAILED") {
                uiMessage("screen-message", "❌ Background screening task failed. Check server logs.", true);
                return;
            }
            // QUEUED or RUNNING - keep polling
        } catch (e) {
            console.warn("[pollScreeningResult] Polling error:", e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    uiMessage("screen-message", "⚠️ Background run is taking longer than 2 minutes. Please check the Candidates tab for results when done.", true);
}


async function loadScreeningView() {
    const runBtn = document.getElementById("screen-run-btn");
    const agentBtn = document.getElementById("screen-run-agentic-btn");
    const asyncBtn = document.getElementById("screen-run-async-btn");
    const cards = document.getElementById("screen-results-cards");

    if (runBtn && !runBtn.dataset.bound) {
        runBtn.dataset.bound = "1";
        runBtn.addEventListener("click", () => runScreening({ useAgentic: false, runAsync: false }));
    }
    if (agentBtn && !agentBtn.dataset.bound) {
        agentBtn.dataset.bound = "1";
        agentBtn.addEventListener("click", () => runScreening({ useAgentic: true, runAsync: false }));
    }
    if (asyncBtn && !asyncBtn.dataset.bound) {
        asyncBtn.dataset.bound = "1";
        asyncBtn.addEventListener("click", () => runScreening({ useAgentic: false, runAsync: true }));
    }
    if (cards && !cards.dataset.bound) {
        cards.dataset.bound = "1";
        cards.addEventListener("click", async (event) => {
            const openResume = event.target.getAttribute("data-open-resume");
            if (openResume) {
                const row = Object.values(STATE.screeningJobMatchesByCandidate).find((x) => String(x.id) === String(openResume));
                if (row) openCandidateModal(row);
                return;
            }
            const decisionRaw = event.target.getAttribute("data-screen-decision");
            if (!decisionRaw) return;
            const [matchId, decision] = decisionRaw.split(":");
            try {
                await submitDecision(matchId, decision, "");
                uiMessage("screen-message", `Decision saved: ${decision}`);
                await Promise.all([loadOverview(), loadCandidatesView()]);
            } catch (error) {
                uiMessage("screen-message", error.message, true);
            }
        });
    }
    if (!STATE.jobs.length) await refreshJobs();
    else populateJobSelects();
}

async function updateCandidateStatus(candidateId, action, jobId = "") {
    await apiRequest(`/candidates/${candidateId}/lifecycle/`, {
        method: "POST",
        body: { action, job_id: jobId || undefined },
    });
}

function renderCandidateRows() {
    const tbody = document.getElementById("candidates-table");
    if (!tbody) return;
    if (!STATE.matches.length) {
        tbody.innerHTML = '<tr><td colspan="5">No candidates found for the current filter.</td></tr>';
        return;
    }

    tbody.innerHTML = STATE.matches
        .map((row) => {
            const noteSnippet = row.review_note ? (row.review_note.length > 40 ? row.review_note.substring(0, 37) + "..." : row.review_note) : "-";
            return `
            <tr data-match-id="${row.id}">
                <td>
                    <div style="font-weight:700; font-size:1rem;">${escapeHtml(row.candidate_name || "-")}</div>
                    <div class="hint">${escapeHtml(row.candidate_email || "-")}</div>
                </td>
                <td>${escapeHtml(row.job_title || "-")}</td>
                <td><span class="score-pill ${row.match_score >= 70 ? "ok" : row.match_score < 50 ? "bad" : ""}">${Number(row.match_score || 0).toFixed(2)}</span></td>
                <td>
                    <div style="font-size:0.85rem; color:var(--text-primary);">${Number((row.ingestion_tokens || 0) + (row.tokens_used || 0)).toLocaleString()} tkn</div>
                    <div class="hint" style="font-size:0.75rem;">$${Number((row.ingestion_cost || 0) + (row.ai_cost || 0)).toFixed(4)}</div>
                </td>
                <td><span class="user-chip" style="background:rgba(255,255,255,0.5); font-size:0.75rem;">${escapeHtml(row.status || "-")}</span></td>
                <td class="hint">${escapeHtml(noteSnippet)}</td>
                <td>
                    <div class="row-actions">
                        <button class="btn btn-primary" data-action="view" data-id="${row.id}">Review</button>
                    </div>
                </td>
            </tr>`;
        })
        .join("");
}

async function fetchMatches() {
    const search = document.getElementById("candidate-search")?.value?.trim() || "";
    const status = document.getElementById("candidate-status-filter")?.value || "";
    const job = document.getElementById("candidate-job-filter")?.value || "";
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (job) params.set("job", job);
    const query = params.toString() ? `?${params.toString()}` : "";
    STATE.matches = await apiRequest(`/matches/${query}`);
    renderCandidateRows();
}

async function loadCandidatesView() {
    if (!STATE.jobs.length) await refreshJobs();
    else populateJobSelects();

    const refreshBtn = document.getElementById("candidate-refresh-btn");
    const table = document.getElementById("candidates-table");
    const statusFilter = document.getElementById("candidate-status-filter");
    const jobFilter = document.getElementById("candidate-job-filter");
    const searchInput = document.getElementById("candidate-search");

    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = "1";
        refreshBtn.addEventListener("click", () => fetchMatches().catch(() => null));
    }
    if (statusFilter && !statusFilter.dataset.bound) {
        statusFilter.dataset.bound = "1";
        statusFilter.addEventListener("change", () => fetchMatches().catch(() => null));
    }
    if (jobFilter && !jobFilter.dataset.bound) {
        jobFilter.dataset.bound = "1";
        jobFilter.addEventListener("change", () => fetchMatches().catch(() => null));
    }
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "1";
        searchInput.addEventListener("input", () => fetchMatches().catch(() => null));
    }
    if (table && !table.dataset.bound) {
        table.dataset.bound = "1";
        table.addEventListener("click", async (event) => {
            const action = event.target.getAttribute("data-action");
            if (!action) return;
            if (action === "view") {
                const matchId = event.target.getAttribute("data-id");
                const row = STATE.matches.find((m) => String(m.id) === String(matchId));
                if (row) openCandidateModal(row);
                return;
            }
            if (action === "unlock") {
                const candidateId = event.target.getAttribute("data-candidate");
                const jobId = event.target.getAttribute("data-job");
                try {
                    await updateCandidateStatus(candidateId, "unlock", jobId);
                    await Promise.all([fetchMatches(), loadOverview()]);
                } catch (error) {
                    alert(error.message);
                }
                return;
            }
            const matchId = event.target.getAttribute("data-id");
            if (!matchId) return;
            const noteBox = document.querySelector(`textarea[data-note="${matchId}"]`);
            const note = noteBox?.value?.trim() || "";
            try {
                await submitDecision(matchId, action, note);
                await Promise.all([fetchMatches(), loadOverview()]);
            } catch (error) {
                alert(error.message);
            }
        });
    }
    await fetchMatches();
}

async function planCampaign() {
    const startDate = document.getElementById("campaign-start-date")?.value;
    const durationDays = Number(document.getElementById("campaign-duration-days")?.value || 5);
    const dayStartTime = document.getElementById("campaign-day-start")?.value || "09:00";
    const dayEndTime = document.getElementById("campaign-day-end")?.value || "18:00";
    const slotMinutes = Number(document.getElementById("campaign-slot-min")?.value || 30);
    const holidays = parseHolidays(document.getElementById("campaign-holidays")?.value || "");

    if (!startDate) {
        uiMessage("campaign-message", "Start date is required.", true);
        return null;
    }

    const payload = {
        start_date: startDate,
        duration_days: Number.isFinite(durationDays) ? durationDays : 5,
        holidays,
        day_start_time: dayStartTime,
        day_end_time: dayEndTime,
        slot_minutes: Number.isFinite(slotMinutes) ? slotMinutes : 30,
    };
    const plan = await apiRequest("/interview-campaigns/plan/", { method: "POST", body: payload });
    STATE.campaignPlan = plan;
    uiMessage("campaign-message", `Plan ready. End date: ${plan.end_date}`);
    return plan;
}

async function createCampaignFromPlan() {
    const title = document.getElementById("campaign-title")?.value?.trim();
    const location = document.getElementById("campaign-location")?.value?.trim();
    const meetingLink = document.getElementById("campaign-link")?.value?.trim();
    const startDate = document.getElementById("campaign-start-date")?.value;
    if (!title || !startDate) {
        uiMessage("campaign-message", "Campaign title and start date are required.", true);
        return;
    }

    uiMessage("campaign-message", "Creating campaign...");
    try {
        const plan = STATE.campaignPlan || (await planCampaign());
        if (!plan) return;
        const payload = {
            title,
            location: location || "",
            meeting_link: meetingLink || "",
            timezone: "Asia/Kolkata",
            start_date: plan.start_date,
            end_date: plan.end_date,
            day_start_time: plan.day_start_time,
            day_end_time: plan.day_end_time,
            slot_minutes: plan.slot_minutes,
        };
        const created = await apiRequest("/interview-campaigns/", { method: "POST", body: payload });
        uiMessage("campaign-message", `Campaign created: ${created.title}`);
        await loadInterviewsView();
    } catch (error) {
        uiMessage("campaign-message", error.message, true);
    }
}

async function fetchCampaigns() {
    STATE.campaigns = await apiRequest("/interview-campaigns/");
    const select = document.getElementById("invite-campaign-select");
    if (!select) return;
    const current = select.value;
    select.innerHTML = STATE.campaigns
        .map((c) => `<option value="${c.id}">${escapeHtml(c.title)} (${c.start_date} to ${c.end_date})</option>`)
        .join("");
    if (current) select.value = current;
}

async function sendInvitations(runAsync = false) {
    const campaignId = document.getElementById("invite-campaign-select")?.value;
    if (!campaignId) {
        uiMessage("invite-message", "Create/select a campaign first.", true);
        return;
    }
    const candidateIdsRaw = document.getElementById("invite-candidate-ids")?.value || "";
    const candidateIds = parseCsvIds(candidateIdsRaw);
    uiMessage("invite-message", runAsync ? "Queueing invitations..." : "Sending invitations...");
    try {
        const data = await apiRequest(`/interview-campaigns/${campaignId}/send-invitations/`, {
            method: "POST",
            body: {
                candidate_ids: candidateIds,
                run_async: runAsync,
            },
        });
        if (runAsync) uiMessage("invite-message", `Queued. Task: ${data.task_id}`);
        else uiMessage("invite-message", `Sent: ${data.sent}, Failed: ${data.failed}`);
        await Promise.all([loadInvitationTracker(), loadOverview()]);
    } catch (error) {
        uiMessage("invite-message", error.message, true);
    }
}

async function loadInvitationTracker() {
    const tbody = document.getElementById("invitations-table");
    if (!tbody) return;
    const campaignId = document.getElementById("invite-campaign-select")?.value || "";
    const qs = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
    try {
        const rows = await apiRequest(`/interview-invitations/${qs}`);
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5">No invitations sent yet.</td></tr>';
            return;
        }
        tbody.innerHTML = rows
            .map((row) => {
                const bookingLink = `${window.location.origin}/booking.html?token=${row.token}`;
                return `
                <tr>
                    <td style="font-weight:700;">${escapeHtml(row.candidate_name || "-")}</td>
                    <td><span class="user-chip" style="font-size:0.75rem; background:rgba(2,132,199,0.05);">${escapeHtml(row.status || "-")}</span></td>
                    <td class="hint">${formatDateTime(row.sent_at)}</td>
                    <td class="hint">${formatDateTime(row.booked_at)}</td>
                    <td><a href="${bookingLink}" target="_blank" class="btn btn-secondary" style="padding: 0.2rem 0.6rem; font-size: 0.8rem; text-decoration: none; display: inline-block;">Open Link</a></td>
                </tr>`;
            })
            .join("");
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function loadInterviewsView() {
    const planBtn = document.getElementById("campaign-plan-btn");
    const createBtn = document.getElementById("campaign-create-btn");
    const sendBtn = document.getElementById("invite-send-btn");
    const sendAsyncBtn = document.getElementById("invite-send-async-btn");
    const campaignSelect = document.getElementById("invite-campaign-select");

    if (planBtn && !planBtn.dataset.bound) {
        planBtn.dataset.bound = "1";
        planBtn.addEventListener("click", () =>
            planCampaign().catch((error) => uiMessage("campaign-message", error.message, true))
        );
    }
    if (createBtn && !createBtn.dataset.bound) {
        createBtn.dataset.bound = "1";
        createBtn.addEventListener("click", createCampaignFromPlan);
    }
    if (sendBtn && !sendBtn.dataset.bound) {
        sendBtn.dataset.bound = "1";
        sendBtn.addEventListener("click", () => sendInvitations(false));
    }
    if (sendAsyncBtn && !sendAsyncBtn.dataset.bound) {
        sendAsyncBtn.dataset.bound = "1";
        sendAsyncBtn.addEventListener("click", () => sendInvitations(true));
    }
    if (campaignSelect && !campaignSelect.dataset.bound) {
        campaignSelect.dataset.bound = "1";
        campaignSelect.addEventListener("change", () => loadInvitationTracker().catch(() => null));
    }

    await fetchCampaigns();
    await loadInvitationTracker();
}

function renderSimpleStack(containerId, rows, label = "count") {
    const box = document.getElementById(containerId);
    if (!box) return;
    if (!rows?.length) {
        box.innerHTML = '<div class="hint">No data yet.</div>';
        return;
    }
    
    // Find max value for relative progress bars
    const values = rows.map(r => Object.values(r)[0]);
    const numericValues = values.map(v => {
        if (typeof v === 'number') return v;
        const match = String(v).match(/^(\d+)/);
        return match ? parseInt(match[1]) : 0;
    });
    const maxVal = Math.max(...numericValues, 1);

    box.innerHTML = rows
        .map((row, idx) => {
            const key = Object.keys(row)[0];
            const value = Object.values(row)[0];
            const currentNum = numericValues[idx];
            const pct = Math.min(Math.round((currentNum / maxVal) * 100), 100);
            return `<article class="activity-item" style="--progress: ${pct}%"><b>${escapeHtml(key)}</b><div class="meta">${label}: ${value}</div></article>`;
        })
        .join("");
}

async function loadAnalyticsView() {
    try {
        const data = await apiRequest("/analytics/");
        setText("ana-volume", data.screening_volume || 0);
        setText("ana-shortlisted", data.shortlisted_count || 0);
        setText("ana-rejected", data.rejected_count || 0);
        setText("ana-selected", data.selected_count || 0);
        setText("ana-cost", `$${Number(data.total_cost || 0).toFixed(2)}`);
        setText("ana-tokens", Number(data.total_tokens || 0).toLocaleString());

        const topSkillsRows = Object.entries(data.top_skills || {}).map(([skill, count]) => ({ [skill]: count }));
        renderSimpleStack("ana-skills", topSkillsRows, "candidates");

        const jobRows = (data.resumes_per_job || []).map((row) => ({
            [`${row.title}`]: `${row.resumes} resumes | ${row.shortlisted} shortlisted | ${row.selected} selected`,
        }));
        renderSimpleStack("ana-jobs", jobRows, "stats");
    } catch (error) {
        setText("ana-volume", "-");
        uiMessage("settings-message", error.message, true);
    }
}

async function loadSettingsView() {
    const saveBtn = document.getElementById("settings-save-btn");
    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = "1";
        saveBtn.addEventListener("click", saveSettings);
    }
    try {
        const settings = await apiRequest("/settings/");
        document.getElementById("set-ai-model").value = settings.ai_model || "gpt-4o-mini";
        document.getElementById("set-vector-provider").value = settings.vector_provider || "hashing";
        document.getElementById("set-screen-strategy").value = settings.screening_default_strategy || "hybrid";
        document.getElementById("set-parsing-depth").value = settings.resume_parsing_depth || "Deep";
        document.getElementById("set-shortlist").value = settings.auto_shortlist_threshold ?? 75;
        document.getElementById("set-reject").value = settings.auto_reject_threshold ?? 40;
        document.getElementById("set-jd-enh").value = settings.enable_jd_enhancement ? "true" : "false";
        document.getElementById("set-bucket-llm").value = settings.enable_llm_bucket_enrichment ? "true" : "false";
    } catch (error) {
        uiMessage("settings-message", error.message, true);
    }
}

async function saveSettings() {
    const payload = {
        ai_model: document.getElementById("set-ai-model")?.value,
        vector_provider: document.getElementById("set-vector-provider")?.value,
        screening_default_strategy: document.getElementById("set-screen-strategy")?.value,
        resume_parsing_depth: document.getElementById("set-parsing-depth")?.value,
        auto_shortlist_threshold: Number(document.getElementById("set-shortlist")?.value || 75),
        auto_reject_threshold: Number(document.getElementById("set-reject")?.value || 40),
        enable_jd_enhancement: document.getElementById("set-jd-enh")?.value === "true",
        enable_llm_bucket_enrichment: document.getElementById("set-bucket-llm")?.value === "true",
    };
    uiMessage("settings-message", "Saving settings...");
    try {
        await apiRequest("/settings/", { method: "POST", body: payload });
        uiMessage("settings-message", "Settings saved successfully.");
    } catch (error) {
        uiMessage("settings-message", error.message, true);
    }
}

function closeCandidateModal() {
    const modal = document.getElementById("candidate-modal");
    const frame = document.getElementById("candidate-modal-frame");
    if (frame) frame.src = "about:blank";
    if (STATE.previewObjectUrl) {
        URL.revokeObjectURL(STATE.previewObjectUrl);
        STATE.previewObjectUrl = null;
    }
    if (modal) modal.style.display = "none";
}

async function openCandidateModal(row) {
    const modal = document.getElementById("candidate-modal");
    const frame = document.getElementById("candidate-modal-frame");
    const title = document.getElementById("candidate-modal-title");
    const meta = document.getElementById("candidate-modal-meta");
    const noteArea = document.getElementById("modal-reviewer-note");
    if (!modal || !frame || !title || !meta) return;

    modal.dataset.currentMatchId = row.id;
    title.textContent = `${row.candidate_name || "Candidate"} - ${row.job_title || "Resume"}`;
    meta.textContent = `Match Score: ${Number(row.match_score || row.final_score || 0).toFixed(2)} | Current Status: ${row.status || "N/A"}`;
    if (noteArea) noteArea.value = row.review_note || "";
    modal.style.display = "grid";

    if (!row.candidate_resume_url) {
        frame.srcdoc = "<p style='padding:1rem;font-family:sans-serif;'>Resume preview URL is not available for this row.</p>";
        return;
    }
    try {
        const response = await fetch(row.candidate_resume_url);
        if (!response.ok) throw new Error(`Preview failed (${response.status})`);
        const blob = await response.blob();
        if (STATE.previewObjectUrl) URL.revokeObjectURL(STATE.previewObjectUrl);
        STATE.previewObjectUrl = URL.createObjectURL(blob);
        frame.src = STATE.previewObjectUrl;
    } catch (error) {
        frame.srcdoc = `<p style='padding:1rem;font-family:sans-serif;color:#b91c1c;'>${escapeHtml(error.message)}</p>`;
    }
}

function initModal() {
    const closeBtn = document.getElementById("candidate-modal-close");
    const modal = document.getElementById("candidate-modal");
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = "1";
        closeBtn.addEventListener("click", closeCandidateModal);
    }
    if (modal && !modal.dataset.bound) {
        modal.dataset.bound = "1";
        modal.addEventListener("click", async (event) => {
            if (event.target === modal) {
                closeCandidateModal();
                return;
            }
            const action = event.target.getAttribute("data-modal-action");
            if (!action) return;

            const matchId = modal.dataset.currentMatchId;
            const note = document.getElementById("modal-reviewer-note")?.value || "";
            try {
                event.target.disabled = true;
                const originalText = event.target.textContent;
                event.target.textContent = "...";
                await submitDecision(matchId, action, note);
                closeCandidateModal();
                await Promise.all([loadOverview(), fetchMatches()]);
            } catch (err) {
                alert("Error saving decision: " + err.message);
            } finally {
                event.target.disabled = false;
            }
        });
    }
}

async function logout() {
    try {
        await apiRequest("/auth/logout/", { method: "POST" });
    } catch {
        // no-op
    } finally {
        clearSession();
        location.href = "auth.html";
    }
}

async function initAppPage() {
    if (!(await ensureAppAuth())) return;
    console.log("initAppPage: auth ensured, binding UI...");
    bindNavigation();
    initModal();
    updateIngestionSdkSnippet();

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = "1";
        logoutBtn.addEventListener("click", logout);
    }

    const storedUser = getStoredUser();
    if (storedUser && !STATE.user) STATE.user = storedUser;
    if (STATE.user) setText("topbar-user-chip", `${STATE.user.name || "User"} | ${STATE.user.email || ""}`);

    const view = getViewFromHash() || "overview";
    if (!window.location.hash) window.location.hash = view;
    
    console.log("initAppPage: activating view", view);
    await activateView(view);
    
    refreshJobs().catch(err => console.error("Initial refreshJobs failed", err));
}

async function initBookingPage() {
    const subtitle = document.getElementById("booking-subtitle");
    const details = document.getElementById("campaign-details");
    const slotList = document.getElementById("slot-list");
    const bookingStatus = document.getElementById("booking-status");
    if (!slotList) return;

    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
        slotList.innerHTML = '<div class="hint" style="color:#b91c1c;">Invalid booking link: token missing.</div>';
        return;
    }

    try {
        const data = await apiRequest(`/public/invitations/${token}/slots/`, { auth: false });
        if (subtitle) subtitle.textContent = `Hello ${data.candidate?.name || "Candidate"}, please choose a slot.`;
        if (details) {
            details.innerHTML = `
                <div><b>Campaign:</b> ${escapeHtml(data.campaign?.title || "-")}</div>
                <div><b>Location:</b> ${escapeHtml(data.campaign?.location || "-")}</div>
                <div><b>Meeting Link:</b> ${data.campaign?.meeting_link ? `<a href="${escapeHtml(data.campaign.meeting_link)}" target="_blank">${escapeHtml(data.campaign.meeting_link)}</a>` : "-"}</div>
                <div><b>Timezone:</b> ${escapeHtml(data.campaign?.timezone || "-")}</div>`;
        }

        const slots = data.slots || [];
        if (!slots.length) {
            slotList.innerHTML = '<div class="hint" style="color:#b91c1c;">No slots available now.</div>';
            return;
        }
        slotList.innerHTML = slots
            .map(
                (slot) => `
            <button class="btn btn-primary" data-slot-id="${slot.id}">
                ${escapeHtml(formatDateTime(slot.starts_at))} - ${escapeHtml(new Date(slot.ends_at).toLocaleTimeString())}
            </button>`
            )
            .join("");

        Array.from(slotList.querySelectorAll("button[data-slot-id]")).forEach((btn) => {
            btn.addEventListener("click", async () => {
                const slotId = btn.getAttribute("data-slot-id");
                btn.disabled = true;
                btn.textContent = "Booking...";
                try {
                    await apiRequest(`/public/invitations/${token}/book/`, {
                        method: "POST",
                        body: { slot_id: slotId },
                        auth: false,
                    });
                    if (bookingStatus) {
                        bookingStatus.textContent = "Slot booked successfully. HR team will follow up.";
                        bookingStatus.style.color = "#166534";
                    }
                    slotList.innerHTML = '<div class="hint">Booking completed successfully.</div>';
                } catch (error) {
                    if (bookingStatus) {
                        bookingStatus.textContent = error.message;
                        bookingStatus.style.color = "#b91c1c";
                    }
                    btn.disabled = false;
                    btn.textContent = "Book Slot";
                }
            });
        });
    } catch (error) {
        slotList.innerHTML = `<div class="hint" style="color:#b91c1c;">${escapeHtml(error.message)}</div>`;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // Start health check
    checkBackendStatus();
    setInterval(checkBackendStatus, 10000); // Poll every 10s

    if (document.getElementById("login-form") && document.getElementById("signup-form")) {
        await initAuthPage();
        return;
    }
    if (document.getElementById("slot-list") && window.location.pathname.toLowerCase().includes("booking")) {
        await initBookingPage();
        return;
    }
    if (document.querySelector(".app-shell")) {
        await initAppPage();
    }
});
