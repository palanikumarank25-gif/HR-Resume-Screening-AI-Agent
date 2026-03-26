/* =====================================
   GLOBAL CONFIG
===================================== */
const API_BASE = "http://127.0.0.1:8000/api";

let barChartInstance = null;
let donutChartInstance = null;

// ==========================================
// JOB ANALYTICS POPUP LOGIC
// ==========================================
let jobTrendChartInstance = null;
let jobDistChartInstance = null;
let topResumesInterval = null;

async function openJobAnalytics(jobId, jobTitle) {
    const modal = document.getElementById("job-analytics-modal");
    if (!modal) return;
    modal.style.display = "flex";

    document.getElementById("analytics-job-title").innerText = jobTitle + " Analytics Dashboard";

    // Initial fetch
    fetchAnalyticsData(jobId);
    fetchTopResumes(jobId);

    // Setup Auto-Refresh (every 5 seconds)
    if (topResumesInterval) clearInterval(topResumesInterval);
    topResumesInterval = setInterval(() => {
        fetchAnalyticsData(jobId, true); // Silent refresh
        fetchTopResumes(jobId);
    }, 5000);
}

async function fetchAnalyticsData(jobId, silent = false) {
    try {
        const res = await fetch(`${API_BASE}/analytics/?job_id=${jobId}`);
        const data = await res.json();

        document.getElementById("job-stat-total").textContent = data.screening_volume;
        document.getElementById("job-stat-shortlisted").textContent = data.shortlisted_count;
        document.getElementById("job-stat-rejected").textContent = data.rejected_count;
        document.getElementById("job-stat-cost").textContent = "$" + data.total_cost.toFixed(2);

        if (!silent) renderJobCharts(data);
    } catch (err) {
        console.error("Analytics error:", err);
    }
}

async function fetchTopResumes(jobId) {
    const tbody = document.getElementById("top-candidates-body");
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE}/job-top-resumes/${jobId}/`);
        const data = await res.json();

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">No candidates processed for this role yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(c => `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.9rem;">
                <td style="padding:12px;">
                    <div style="font-weight:600; color:#0f172a;">${c.candidate_name}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${c.candidate_email}</div>
                </td>
                <td style="padding:12px;"><span class="badge ${c.match_score >= 70 ? 'badge-green' : 'badge-orange'}">${c.match_score}%</span></td>
                <td style="padding:12px;">${c.candidate_experience} Years</td>
                <td style="padding:12px;">
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${(c.candidate_skills || []).slice(0, 3).map(s => `<span style="font-size:0.7rem; padding:2px 6px; background:#f1f5f9; border-radius:4px;">${s}</span>`).join('')}
                    </div>
                </td>
                <td style="padding:12px;">
                    <a href="${c.candidate_resume_url}" target="_blank" class="pill-btn" style="text-decoration:none; display:inline-block; font-size:0.75rem; padding:4px 10px;">📄 View</a>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error("Top resumes fetch error:", err);
    }
}

function renderJobCharts(data) {
    // Render Trend Chart
    const trendCtx = document.getElementById("jobTrendChart").getContext("2d");
    if (jobTrendChartInstance) jobTrendChartInstance.destroy();
    jobTrendChartInstance = new Chart(trendCtx, {
        type: "line",
        data: {
            labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
            datasets: [
                { label: "Shortlisted", data: data.trend_shortlisted, borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true, tension: 0.4 },
                { label: "Rejected", data: data.trend_rejected, borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.1)", fill: true, tension: 0.4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // Render Distribution Donut
    const distCtx = document.getElementById("jobDistributionChart").getContext("2d");
    if (jobDistChartInstance) jobDistChartInstance.destroy();
    jobDistChartInstance = new Chart(distCtx, {
        type: "doughnut",
        data: {
            labels: ["Shortlisted", "Rejected"],
            datasets: [{
                data: [data.score_distribution.shortlisted, data.score_distribution.rejected],
                backgroundColor: ["#10b981", "#ef4444"],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });
}

// Close Modal Logic
const closeAnalyticsBtn = document.getElementById("close-analytics-modal");
if (closeAnalyticsBtn) {
    closeAnalyticsBtn.onclick = () => {
        document.getElementById("job-analytics-modal").style.display = "none";
        if (topResumesInterval) {
            clearInterval(topResumesInterval);
            topResumesInterval = null;
        }
    };
}

window.onclick = (event) => {
    const analyticsModal = document.getElementById("job-analytics-modal");
    const addJobModal = document.getElementById("add-job-modal");
    if (analyticsModal && event.target === analyticsModal) {
        analyticsModal.style.display = "none";
        if (topResumesInterval) {
            clearInterval(topResumesInterval);
            topResumesInterval = null;
        }
    }
    if (addJobModal && event.target === addJobModal) addJobModal.style.display = "none";
};
/* =====================================
   APP INIT
===================================== */
document.addEventListener("DOMContentLoaded", () => {
    setActiveNav();
    const path = window.location.pathname.toLowerCase();

    if (path.includes("dashboard")) {
        fetchDashboardStats();
        initializeDashboardCharts();
    } else if (path.includes("job-configs") || path.includes("jobs")) {
        setupJobConfigsInteractions();
    } else if (path.includes("upload")) {
        setupUploadInteractions();
    } else if (path.includes("candidates")) {
        setupCandidatesInteractions();
    } else if (path.includes("email-automation")) {
        initializeEmailAutomation();
    } else if (path.includes("analytics")) {
        initializeAnalyticsCharts();
    } else if (path.includes("settings")) {
        initializeSettings();
    } else if (path.includes("booking")) {
        initializeBookingPage();
    }
});

/* =====================================
   SHARED UTILITIES
===================================== */
function setActiveNav() {
    const path = window.location.pathname;
    const links = document.querySelectorAll(".nav a");
    links.forEach(link => {
        link.classList.remove("active");
        if (path.includes(link.getAttribute("href"))) link.classList.add("active");
    });
}

function getInitials(name) {
    if (!name) return "AI";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
}

/* =====================================
   DASHBOARD REFINED
===================================== */
async function fetchDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/analytics/`);
        const data = await res.json();

        document.getElementById("stat-active-jobs").textContent = data.active_jobs_count;
        document.getElementById("stat-total").textContent = data.screening_volume;
        document.getElementById("stat-shortlisted").textContent = data.shortlisted_count;
        document.getElementById("stat-rejected").textContent = data.rejected_count;
        document.getElementById("sent-count").textContent = data.sent_count;

        const matchesRes = await fetch(`${API_BASE}/matches/`);
        const matches = await matchesRes.json();
        renderDashboardRecent(matches);

        const jobsRes = await fetch(`${API_BASE}/jobs/`);
        const jobs = await jobsRes.json();
        renderDashboardJobs(jobs);
    } catch (err) {
        console.error("Stats Error:", err);
        alert("⚠️ Backend Connection Error: Please ensure the Django server is running on port 8000.");
    }
}

function renderDashboardRecent(matches) {
    const list = document.getElementById("recent-candidates-list");
    if (!list) return;
    list.innerHTML = matches.slice(0, 4).map(m => `
        <div style="display:flex; align-items:center; gap:12px; padding:1rem 0; border-bottom:1px solid #f1f5f9;">
            <div style="width:36px; height:36px; background:#eff6ff; color:#3b82f6; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${getInitials(m.candidate_name)}</div>
            <div style="flex:1">
                <div style="font-weight:600; font-size:0.9rem; color:#1e293b;">${m.candidate_name}</div>
                <div style="font-size:0.75rem; color:#64748b;">${m.job_title}</div>
            </div>
            <div class="ai-score-pill">★ ${m.match_score}%</div>
            <div class="tag ${m.status.toLowerCase() === 'shortlisted' ? 'tag-green' : 'tag-blue'}" style="text-transform:capitalize;">${m.status}</div>
        </div>
    `).join("");
}

function renderDashboardJobs(jobs) {
    const list = document.getElementById("active-jobs-list");
    if (!list) return;
    list.innerHTML = jobs.slice(0, 4).map(j => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 0; border-bottom:1px solid #f1f5f9;">
            <div>
                <div style="font-weight:600; font-size:0.9rem; color:var(--primary); cursor:pointer;" onclick="openJobAnalytics('${j.id}', '${j.title}')">${j.title}</div>
                <div style="font-size:0.75rem; color:#64748b;">Engineering • ${j.min_experience}+ years</div>
            </div>
            <div style="font-size:0.85rem; font-weight:700; color:#1e293b;">${j.resumes_count || 0} <small style="font-weight:400; color:#64748b;">resumes</small></div>
        </div>
    `).join("");
}

async function initializeDashboardCharts() {
    try {
        const res = await fetch(`${API_BASE}/analytics/`);
        const data = await res.json();

        const resumesCanvas = document.getElementById("resumesPerJobChart");
        const distributionCanvas = document.getElementById("scoreDistributionChart");
        if (!resumesCanvas || !distributionCanvas) return;

        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(resumesCanvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: data.resumes_per_job.map(j => j.title),
                datasets: [
                    {
                        label: "Resumes",
                        data: data.resumes_per_job.map(j => j.resumes),
                        backgroundColor: "#3b82f6"
                    },
                    {
                        label: "Shortlisted",
                        data: data.resumes_per_job.map(j => j.shortlisted),
                        backgroundColor: "#10b981"
                    },
                    {
                        label: "Rejected",
                        data: data.resumes_per_job.map(j => j.rejected),
                        backgroundColor: "#ef4444"
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0,
                            callback: function(value) {
                                return value >= 1000 ? (value / 1000) + 'k' : value;
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index
                        const job = data.resumes_per_job[index]
                        openJobAnalytics(job.id, job.title)
                    }
                }
            }
        })

        if (donutChartInstance) donutChartInstance.destroy();
        donutChartInstance = new Chart(distributionCanvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: ["Shortlisted", "Rejected"],
                datasets: [{
                    data: [
                        data.score_distribution.shortlisted,
                        data.score_distribution.rejected
                    ],
                    backgroundColor: ["#10b981", "#ef4444"],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
        });
    } catch (err) { console.error("Chart Error:", err); }
}

/* =====================================
   JOBS REFINED
===================================== */
async function setupJobConfigsInteractions() {
    const modal = document.getElementById("add-job-modal");
    const openBtn = document.getElementById("add-job-btn");
    const closeBtn = document.getElementById("close-modal");

    if (openBtn) openBtn.onclick = () => modal.style.display = "flex";
    if (closeBtn) closeBtn.onclick = () => modal.style.display = "none";

    const form = document.getElementById("add-job-form");
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const jobData = {
                title: document.getElementById("job-title").value,
                description: document.getElementById("job-desc").value,
                required_skills: document.getElementById("job-skills").value,
                min_experience: parseInt(document.getElementById("job-exp").value),
                status: 'Active'
            };
            const res = await fetch(`${API_BASE}/jobs/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(jobData)
            });
            if (res.ok) {
                modal.style.display = "none";
                form.reset();
                fetchJobs();
            }
        };
    }

    // Tabs
    document.querySelectorAll(".tab-light").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".tab-light").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            fetchJobs(tab.textContent.trim());
        };
    });

    // Search
    const searchInput = document.querySelector(".search-bar-refined input");
    if (searchInput) {
        searchInput.oninput = (e) => {
            fetchJobs(document.querySelector(".tab-light.active").textContent.trim(), e.target.value);
        };
    }

    fetchJobs();
}

async function fetchJobs(status = "All", search = "") {
    const container = document.getElementById("jobs-container");
    if (!container) return;
    try {
        let url = `${API_BASE}/jobs/?status=${status}`;
        const res = await fetch(url);
        let jobs = await res.json();

        if (search) {
            jobs = jobs.filter(j =>
                j.title.toLowerCase().includes(search.toLowerCase()) ||
                j.required_skills.toLowerCase().includes(search.toLowerCase())
            );
        }

        document.getElementById("job-count-text").textContent = `${jobs.length} total positions`;

        container.innerHTML = jobs.map(j => `
            <div class="job-card-refined">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h3 style="margin:0; cursor:pointer; color:var(--primary);" onclick="openJobAnalytics('${j.id}', '${j.title}')">${j.title}</h3>
                    <span class="tag ${j.status === 'Active' ? 'tag-green' : 'tag-blue'}">● ${j.status}</span>
                </div>
                <div style="color:#64748b; font-size:0.85rem;">Engineering</div>
                <div style="color:#1e293b; font-size:0.85rem; font-weight:600;">Experience: ${j.min_experience} years</div>
                
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${j.required_skills.split(",").slice(0, 4).map(s => `<span class="tag">${s.trim()}</span>`).join("")}
                    ${j.required_skills.split(",").length > 4 ? '<span class="tag">+more</span>' : ''}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:1rem; border-top:1px solid #f1f5f9; margin-top:0.5rem;">
                    <div style="font-size:0.75rem; color:#64748b;">👥 ${j.resumes_count || 0} resumes • ${j.shortlisted_count || 0} shortlisted</div>
                    <div style="display:flex; gap:8px;">
                        <button style="background:none; border:none; cursor:pointer;" onclick="location.href='candidates.html?jobId=${j.id}'">👁️</button>
                        <button style="background:none; border:none; cursor:pointer;">✏️</button>
                        <button style="background:none; border:none; cursor:pointer;" onclick="deleteJob('${j.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `).join("");
    } catch (err) { console.error(err); }
}

async function deleteJob(id) {
    if (confirm("Delete this job?")) {
        await fetch(`${API_BASE}/jobs/${id}/`, { method: "DELETE" });
        fetchJobs();
    }
}

/* =====================================
   CANDIDATES REFINED
===================================== */
async function setupCandidatesInteractions() {
    // Populate job filter dropdown from backend
    const filter = document.getElementById("job-filter");
    if (filter) {
        const res = await fetch(`${API_BASE}/jobs/`);
        const jobs = await res.json();
        jobs.forEach(j => {
            const opt = document.createElement("option");
            opt.value = j.id;
            opt.textContent = j.title;
            filter.appendChild(opt);
        });

        // Check URL for jobId to pre-filter
        const urlParams = new URLSearchParams(window.location.search);
        const jobId = urlParams.get('jobId');
        if (jobId) {
            filter.value = jobId;
        }

        filter.addEventListener("change", fetchCandidates);
    }

    // Search input
    const searchInput = document.getElementById("candidate-search");
    if (searchInput) {
        searchInput.oninput = () => fetchCandidates();
    }

    // Status filter pills if present
    document.querySelectorAll(".status-filter-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(".status-filter-pill").forEach(p => p.classList.remove("active"));
        });
    });

    fetchCandidates();
}

async function fetchCandidates() {
    const tbody = document.getElementById("candidates-table-body");
    const filter = document.getElementById("job-filter");
    const searchInput = document.getElementById("candidate-search");
    if (!tbody) return;

    try {
        // Build URL with optional filters
        let params = new URLSearchParams();
        if (filter?.value && filter.value !== 'all') params.set('job', filter.value);
        if (searchInput?.value) params.set('search', searchInput.value);
        const url = `${API_BASE}/matches/?${params.toString()}`;

        const res = await fetch(url);
        const matches = await res.json();
        const textEl = document.getElementById("candidate-count-text");
        if (textEl) textEl.textContent = `${matches.length} candidates found`;

        if (matches.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:3rem; color:#94a3b8;">No candidates found. Upload resumes to get started.</td></tr>`;
            return;
        }

        tbody.innerHTML = matches.map(m => {
            const status = m.status || "Rejected"; // Default to Rejected for full AI autonomy
            const statusClass = status === 'Shortlisted' ? 'tag-green' : 'tag-red';
            const score = parseFloat(m.match_score || 0);
            const scoreColor = score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
            const skills = m.candidate_skills || [];
            const resumeUrl = m.candidate_resume_url || null;

            // PRIORITY: Show the candidate's actual role from the resume first
            let displayRole = m.candidate_role || 'Unknown Role';
            if (m.job_title) {
                displayRole = `${displayRole} <span style="display:block; font-size:0.7rem; color:#64748b; font-weight:400;">(Matched: ${m.job_title})</span>`;
            } else {
                displayRole = `${displayRole} <span style="display:block; font-size:0.7rem; color:#ef4444; font-weight:400;">❌ No Role Match</span>`;
            }

            return `
            <tr>
                <td style="padding-left:1.5rem;"><input type="checkbox"></td>
                <td>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:38px; height:38px; background:#eff6ff; color:#3b82f6; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; flex-shrink:0;">${getInitials(m.candidate_name)}</div>
                        <div style="font-weight:600; color:#1e293b; font-size:0.9rem;">${m.candidate_name || 'Unknown'}</div>
                    </div>
                </td>
                <td style="font-size:0.82rem; color:#475569;">${m.candidate_email || '<span style="color:#94a3b8;">—</span>'}</td>
                <td style="font-size:0.82rem; color:#475569;">${m.candidate_phone || '<span style="color:#94a3b8;">—</span>'}</td>
                <td>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        ${skills.slice(0, 3).map(s => `<span class="tag">${s}</span>`).join("")}
                        ${skills.length > 3 ? `<span class="tag">+${skills.length - 3}</span>` : ''}
                        ${skills.length === 0 ? '<span style="color:#94a3b8; font-size:0.8rem;">—</span>' : ''}
                    </div>
                </td>
                <td style="font-size:0.9rem; color:#1e293b; font-weight:600;">${m.candidate_experience || 0} yrs</td>
                <td style="font-size:0.85rem; color:#3b82f6; font-weight:700; line-height:1.2;">${displayRole}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:${scoreColor}20; border:2px solid ${scoreColor}; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; color:${scoreColor};">
                            ${score}%
                        </div>
                    </div>
                </td>
                <td><span class="tag ${statusClass}" style="white-space:nowrap;">${status}</span></td>
                <td>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        ${resumeUrl ? `<a href="${resumeUrl}" target="_blank" style="color:#3b82f6; text-decoration:none; font-size:0.8rem; font-weight:600; background:#eff6ff; padding:4px 10px; border-radius:6px;">📄 CV</a>` : '<span style="color:#94a3b8; font-size:0.8rem;">No file</span>'}
                        <button onclick="reScreenCandidate('${m.id}')" title="Re-run AI on this candidate" style="background:#f0fdf4; border:1px solid #10b981; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:0.78rem; color:#10b981;">🔄</button>
                        <button onclick="showAIAnalysis('${m.id}', \`${(m.match_reasoning || '').replace(/`/g, "'").replace(/\n/g, ' ')}\`)" style="background:none; border:1px solid #e2e8f0; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:0.78rem; color:#64748b;">🧠</button>
                    </div>
                </td>
            </tr>`;
        }).join("");
    } catch (err) {
        console.error("Candidates Error:", err);
        const tbody = document.getElementById("candidates-table-body");
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:3rem; color:#ef4444; font-weight:600;">⚠️ API Error: Connection to backend lost.</td></tr>`;
    }
}

function showAIAnalysis(id, reasoning) {
    const modal = document.getElementById("ai-analysis-modal");
    if (modal) {
        document.getElementById("ai-analysis-text").textContent = reasoning;
        modal.style.display = "flex";
    } else {
        alert("🧠 AI Match Analysis:\n\n" + reasoning);
    }
}

async function reScreenCandidate(matchId) {
    const btn = event.target;
    btn.textContent = "⏳";
    btn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/rescreen/${matchId}/`, { method: "POST" });
        const data = await res.json();
        if (res.ok) {
            btn.textContent = "✅";
            setTimeout(() => { fetchCandidates(); }, 800);
        } else {
            btn.textContent = "❌";
            alert("Re-screen failed: " + (data.error || "Unknown error"));
        }
    } catch (err) {
        btn.textContent = "❌";
        console.error(err);
    }
    setTimeout(() => { btn.textContent = "🔄"; btn.disabled = false; }, 1500);
}

/* =====================================
   UPLOAD REFINED
===================================== */
async function setupUploadInteractions() {
    const runBtn = document.getElementById("run-ai-btn");
    const fileInput = document.getElementById("bulk-file-input");
    const progressContainer = document.getElementById("upload-progress-container");
    const barFill = document.getElementById("progress-bar-fill");
    const percentText = document.getElementById("progress-percent");
    const statusText = document.getElementById("progress-status");
    const detailText = document.getElementById("progress-detail");
    const pathInput = document.getElementById("resume-dump-path");
    const maxFilesInput = document.getElementById("resume-dump-max-files");
    const pathIngestBtn = document.getElementById("path-ingest-btn");
    const pathIngestStatus = document.getElementById("path-ingest-status");
    const screeningBtn = document.getElementById("start-screening-btn");
    const screeningStatus = document.getElementById("screening-status");

    if (!fileInput || !runBtn) return;

    fileInput.onchange = (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            document.getElementById("dropzone-content").innerHTML = `
                <h3>${files.length} Resumes Selected</h3>
                <p>Click process to begin AI analysis</p>
            `;
        }
    };

    if (pathIngestBtn && pathInput) {
        pathIngestBtn.onclick = async () => {
            const sourcePath = pathInput.value.trim();
            if (!sourcePath) return alert("Please enter a local folder path.");

            pathIngestBtn.disabled = true;
            pathIngestBtn.textContent = "Ingesting...";
            if (pathIngestStatus) pathIngestStatus.textContent = "Starting recursive scan...";

            try {
                const payload = { source_path: sourcePath };
                if (maxFilesInput && maxFilesInput.value) {
                    payload.max_files = parseInt(maxFilesInput.value, 10);
                }

                const res = await fetch(`${API_BASE}/ingest/path/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Path ingestion failed");

                if (pathIngestStatus) {
                    pathIngestStatus.textContent = `Done: processed ${data.processed_files}, success ${data.success_files}, failed ${data.failed_files}, skipped ${data.skipped_files}.`;
                }
            } catch (err) {
                if (pathIngestStatus) pathIngestStatus.textContent = `Error: ${err.message}`;
            } finally {
                pathIngestBtn.disabled = false;
                pathIngestBtn.textContent = "Run Path Ingestion";
            }
        };
    }

    runBtn.onclick = async () => {
        const files = fileInput.files;
        if (files.length === 0) return alert("Please select or drag resumes first");

        runBtn.disabled = true;
        runBtn.style.opacity = "0.5";
        progressContainer.style.display = "block";

        let successCount = 0;
        const total = files.length;

        for (let i = 0; i < total; i++) {
            const file = files[i];
            const percent = Math.round(((i) / total) * 100);

            statusText.textContent = `Analyzing ${i + 1} of ${total}...`;
            detailText.textContent = `Current: ${file.name}`;
            barFill.style.width = `${percent}%`;
            percentText.textContent = `${percent}%`;

            const fd = new FormData();
            fd.append("resume", file);

            try {
                const res = await fetch(`${API_BASE}/upload-resume/`, {
                    method: "POST",
                    body: fd
                });
                if (res.ok) successCount++;
            } catch (err) {
                console.error("Batch Error:", err);
            }
        }

        barFill.style.width = "100%";
        percentText.textContent = "100%";
        statusText.textContent = "Analysis complete";
        detailText.textContent = `Successfully processed ${successCount} of ${total} resumes.`;

        setTimeout(() => {
            location.href = "candidates.html";
        }, 1200);
    };

    if (screeningBtn) {
        screeningBtn.onclick = async () => {
            const jdTitle = document.getElementById("jd-title-input")?.value?.trim() || "Dynamic JD";
            const jdText = document.getElementById("jd-text-input")?.value?.trim();
            const requiredSkills = document.getElementById("jd-skills-input")?.value?.trim() || "";
            const topK = parseInt(document.getElementById("jd-topk-input")?.value || "20", 10);

            if (!jdText) return alert("Please enter JD text.");
            screeningBtn.disabled = true;
            screeningBtn.textContent = "Matching...";
            if (screeningStatus) screeningStatus.textContent = "Running bucket + vector screening...";

            try {
                const res = await fetch(`${API_BASE}/screenings/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jd_title: jdTitle,
                        jd_text: jdText,
                        required_skills: requiredSkills,
                        top_k: topK
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "JD screening failed");
                const hits = (data.matches || []).length;
                if (screeningStatus) {
                    screeningStatus.textContent = `Screening complete in ${data.processing_ms || 0} ms. Top matches: ${hits}.`;
                }
            } catch (err) {
                if (screeningStatus) screeningStatus.textContent = `Error: ${err.message}`;
            } finally {
                screeningBtn.disabled = false;
                screeningBtn.textContent = "Run JD Match";
            }
        };
    }
}
/* =====================================
   EMAIL AUTOMATION & ANALYTICS
===================================== */
window.emailDrafts = {};
window.currentMatchId = null;

async function initializeEmailAutomation() {
    const list = document.getElementById("automation-candidate-list");
    if (!list) return;

    document.querySelectorAll(".tab-light").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab-light").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            fetchAutomationCandidates(tab.textContent.trim());
        });
    });

    ["var-date", "var-time", "var-location", "var-company"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateEmailVariablePreview);
    });

    const selectAll = document.getElementById("selectAll");
    if (selectAll) {
        selectAll.addEventListener("change", (e) => {
            document.querySelectorAll(".candidate-cb").forEach(cb => {
                cb.checked = e.target.checked;
                cb.closest(".candidate-item-light")?.classList.toggle("selected", cb.checked);
            });
            updateSelectedCount();
        });
    }

    const sendBtn = document.getElementById("send-email-btn");
    if (sendBtn) {
        sendBtn.onclick = async () => {
            const selected = Array.from(document.querySelectorAll(".candidate-cb:checked")).map(cb => cb.value);
            if (selected.length === 0) return alert("Select candidates first");

            sendBtn.innerHTML = "🚀 Sending...";
            sendBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/send-bulk-email/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ match_ids: selected })
                });
                const data = await res.json();
                if (res.ok) {
                    alert(`✅ AI Success: ${data.sent_count} invitations sent automatically.`);
                    initializeEmailAutomation(); // Refresh list
                }
            } catch (err) { console.error(err); }

            sendBtn.innerHTML = `🚀 Send to ${selected.length} candidates`;
            sendBtn.disabled = false;
        };
    }

    fetchAutomationCandidates("Shortlisted");
}

async function fetchAutomationCandidates(statusFilter) {
    const list = document.getElementById("automation-candidate-list");
    try {
        let url = `${API_BASE}/matches/`;
        if (statusFilter !== "All") url += `?status=${statusFilter}`;
        const res = await fetch(url);
        const matches = await res.json();

        const countEl = document.getElementById("total-candidates-count");
        if (countEl) countEl.textContent = matches.length;

        if (matches.length === 0) {
            list.innerHTML = `<div style="padding: 4rem 2rem; text-align: center; color: #94a3b8;">No ${statusFilter.toLowerCase()} candidates yet.</div>`;
            return;
        }

        list.innerHTML = matches.map(m => `
            <div class="candidate-item-light" onclick="handleCandidateClick(event, '${m.id}', this)">
                <input type="checkbox" class="candidate-cb" value="${m.id}" ${statusFilter === "Shortlisted" || statusFilter === "Rejected" ? "checked" : ""} onclick="event.stopPropagation(); updateSelectedCount(); this.closest('.candidate-item-light').classList.toggle('selected', this.checked);">
                <div style="width:36px; height:36px; background:#eff6ff; color:#3b82f6; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">${getInitials(m.candidate_name)}</div>
                <div style="flex:1">
                    <b style="display:block;">${m.candidate_name}</b>
                    <small>${m.candidate_email}</small>
                </div>
                <div style="text-align:right">
                    <span style="display:block; font-weight:700; color:#3b82f6; font-size:0.85rem;">${m.match_score}%</span>
                    ${m.email_sent ? '<span class="tag tag-green" style="font-size:0.6rem;">Sent</span>' : '<span class="tag tag-blue" style="font-size:0.6rem;">AI Selected</span>'}
                </div>
            </div>
        `).join("");

        // Auto-update UI for selected ones
        if (statusFilter === "Shortlisted" || statusFilter === "Rejected") {
            document.querySelectorAll(".candidate-item-light").forEach(item => item.classList.add("selected"));
            const selectAll = document.getElementById("selectAll");
            if (selectAll) selectAll.checked = true;
            updateSelectedCount();
        }

        // Drafts are handled dynamically by loadAIEmail via backend AI
    } catch (err) { console.error(err); }
}

window.handleCandidateClick = (event, matchId, element) => {
    if (event.target.type === 'checkbox') return;
    const items = document.querySelectorAll(".candidate-item-light");
    items.forEach(i => i.classList.remove("selected"));
    element.classList.add("selected");
    loadAIEmail(matchId);
};

function updateSelectedCount() {
    const selectedCount = document.querySelectorAll(".candidate-cb:checked").length;
    const disp = document.getElementById("selected-count");
    if (disp) disp.textContent = selectedCount;
    const btn = document.getElementById("send-email-btn");
    if (btn) {
        btn.textContent = `🚀 Send to ${selectedCount} candidates`;
        btn.disabled = selectedCount === 0;
    }
}

async function loadAIEmail(matchId) {
    window.currentMatchId = matchId;
    const editor = document.getElementById("email-editor-section");
    if (editor) {
        editor.style.opacity = "1";
        editor.style.pointerEvents = "auto";
    }

    try {
        const res = await fetch(`${API_BASE}/ai-draft-email/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ match_id: matchId })
        });
        const data = await res.json();

        const subj = document.getElementById("email-subject");
        if (subj) subj.value = data.subject || `Interview Invitation — ${matchId}`;

        // Store the AI drafted body as the base for our variable preview
        window.emailDrafts[matchId] = {
            body: data.body || "AI drafting failed. Please select again.",
            subject: data.subject
        };

        updateEmailVariablePreview();
    } catch (err) {
        console.error("AI Draft Error:", err);
    }
}

function updateEmailVariablePreview() {
    if (!window.currentMatchId) return;
    const draft = window.emailDrafts[window.currentMatchId];
    let content = draft.body;
    const vars = {
        "{{InterviewDate}}": document.getElementById("var-date")?.value || "{{InterviewDate}}",
        "{{InterviewTime}}": document.getElementById("var-time")?.value || "{{InterviewTime}}",
        "{{Location}}": document.getElementById("var-location")?.value || "{{Location}}",
        "{{CompanyName}}": document.getElementById("var-company")?.value || "{{CompanyName}}"
    };
    for (const [key, val] of Object.entries(vars)) {
        const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(regex, `<span style="color:#3b82f6; font-weight:700;">${val}</span>`);
    }
    const bodyEl = document.getElementById("email-body");
    if (bodyEl) bodyEl.innerHTML = content.replace(/\n/g, "<br>");
}

async function initializeAnalyticsCharts() {
    try {
        const res = await fetch(`${API_BASE}/analytics/`);
        const data = await res.json();

        // Populate Metric Cards
        const costEl = document.getElementById("total-ai-cost");
        if (costEl) costEl.textContent = `$${data.total_cost.toFixed(2)}`;

        const spendEl = document.getElementById("monthly-ai-spend");
        if (spendEl) spendEl.textContent = `$${data.monthly_spend.toFixed(2)}`;

        const avgCostEl = document.getElementById("avg-cost-per-resume");
        if (avgCostEl) avgCostEl.textContent = `$${data.avg_cost_per_resume.toFixed(3)}`;

        const tokensEl = document.getElementById("total-tokens");
        if (tokensEl) tokensEl.textContent = data.total_tokens.toLocaleString();

        // 1. Trend Chart (Line: Shortlisted vs Rejected)
        const trendCtx = document.getElementById("trendChart")?.getContext("2d");
        if (trendCtx) {
            new Chart(trendCtx, {
                type: "line",
                data: {
                    labels: ["3 Weeks Ago", "2 Weeks Ago", "Last Week", "This Week"],
                    datasets: [
                        { label: "Shortlisted", data: data.trend_shortlisted, borderColor: "#10b981", tension: 0.3 },
                        { label: "Rejected", data: data.trend_rejected, borderColor: "#ef4444", tension: 0.3 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 2. AI Scoring Accuracy (Donut: Shortlisted vs Rejected %)
        const accCtx = document.getElementById("accuracyChart")?.getContext("2d");
        if (accCtx) {
            new Chart(accCtx, {
                type: "doughnut",
                data: {
                    labels: ["Shortlisted", "Rejected"],
                    datasets: [{
                        data: [
                            data.score_distribution.shortlisted,
                            data.score_distribution.rejected
                        ],
                        backgroundColor: ["#10b981", "#ef4444"],
                        borderWidth: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
            });
        }

        // 3. Skill Demand
        const skillCtx = document.getElementById("skillChart")?.getContext("2d");
        if (skillCtx) {
            new Chart(skillCtx, {
                type: "bar",
                data: {
                    labels: Object.keys(data.top_skills),
                    datasets: [{ label: "Candidate Count", data: Object.values(data.top_skills), backgroundColor: "#3b82f6", borderRadius: 6 }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }

        // 4. Cost Per Job Role
        const costJobCtx = document.getElementById("costPerJobChart")?.getContext("2d");
        if (costJobCtx) {
            new Chart(costJobCtx, {
                type: "bar",
                data: {
                    labels: data.cost_per_job.map(j => j.title),
                    datasets: [{
                        label: "Total AI Cost (US$)",
                        data: data.cost_per_job.map(j => j.cost),
                        backgroundColor: "#10b981",
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `Total Cost: $${ctx.raw}`
                            }
                        }
                    }
                }
            });
        }
    } catch (err) { console.error("Analytics Error:", err); }
}
async function initializeSettings() {
    const fields = {
        ai_model: document.getElementById("ai-model"),
        model_sensitivity: document.getElementById("model-sensitivity"),
        resume_parsing_depth: document.getElementById("resume-parsing-depth"),
        auto_shortlist_threshold: document.getElementById("auto-shortlist-threshold"),
        auto_reject_threshold: document.getElementById("auto-reject-threshold"),
        ai_cost_limit: document.getElementById("ai-cost-limit"),
        automated_feedback: { panel: document.getElementById("automated-feedback-toggle"), knob: document.getElementById("toggle-knob") },
        enable_token_visibility: { panel: document.getElementById("token-visibility-toggle"), knob: document.getElementById("token-knob") }
    };

    const saveBtn = document.getElementById("save-settings-btn");
    if (!fields.ai_model || !saveBtn) return;

    let settings = {};

    // 1. Fetch
    try {
        const res = await fetch(`${API_BASE}/settings/`);
        settings = await res.json();

        fields.ai_model.value = settings.ai_model;
        fields.resume_parsing_depth.value = settings.resume_parsing_depth;
        fields.auto_shortlist_threshold.value = settings.auto_shortlist_threshold;
        fields.auto_reject_threshold.value = settings.auto_reject_threshold;
        fields.ai_cost_limit.value = settings.ai_cost_limit;

        const sensitivityMap = { "Strict": 1, "Balanced": 2, "Lenient": 3 };
        fields.model_sensitivity.value = sensitivityMap[settings.model_sensitivity] || 2;

        updateToggleUI(fields.automated_feedback, settings.automated_feedback);
        updateToggleUI(fields.enable_token_visibility, settings.enable_token_visibility);
    } catch (err) { console.error("Fetch Settings Error:", err); }

    // 2. Toggles
    [fields.automated_feedback, fields.enable_token_visibility].forEach(item => {
        item.panel.addEventListener("click", () => {
            const key = item.panel.id.includes("automated") ? "automated_feedback" : "enable_token_visibility";
            settings[key] = !settings[key];
            updateToggleUI(item, settings[key]);
        });
    });

    function updateToggleUI(item, status) {
        if (status) {
            item.panel.style.background = "var(--primary)";
            item.knob.style.left = "23px";
        } else {
            item.panel.style.background = "var(--border)";
            item.knob.style.left = "3px";
        }
    }

    // 3. Save
    saveBtn.addEventListener("click", async () => {
        const revMap = { "1": "Strict", "2": "Balanced", "3": "Lenient" };
        const payload = {
            ai_model: fields.ai_model.value,
            model_sensitivity: revMap[fields.model_sensitivity.value],
            resume_parsing_depth: fields.resume_parsing_depth.value,
            auto_shortlist_threshold: parseInt(fields.auto_shortlist_threshold.value),
            auto_reject_threshold: parseInt(fields.auto_reject_threshold.value),
            ai_cost_limit: parseFloat(fields.ai_cost_limit.value),
            automated_feedback: settings.automated_feedback,
            enable_token_visibility: settings.enable_token_visibility
        };

        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/settings/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) alert("Settings saved successfully!");
        } catch (err) { alert("Error saving settings."); }
        finally {
            saveBtn.innerText = "Save Changes";
            saveBtn.disabled = false;
        }
    });
}

async function initializeBookingPage() {
    const subtitle = document.getElementById("booking-subtitle");
    const campaignDetails = document.getElementById("campaign-details");
    const slotList = document.getElementById("slot-list");
    const bookingStatus = document.getElementById("booking-status");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
        if (slotList) slotList.innerHTML = '<div style="color:#ef4444;">Invalid booking link (missing token).</div>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/public/invitations/${token}/slots/`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unable to load invitation");

        if (subtitle) subtitle.textContent = `Hello ${data.candidate.name}, choose your preferred slot.`;
        if (campaignDetails) {
            campaignDetails.innerHTML = `
                <div><b>Role/Campaign:</b> ${data.campaign.title}</div>
                <div><b>Location:</b> ${data.campaign.location || "TBD"}</div>
                <div><b>Meeting Link:</b> ${data.campaign.meeting_link || "Will be shared by HR"}</div>
                <div><b>Timezone:</b> ${data.campaign.timezone}</div>
            `;
        }

        const slots = data.slots || [];
        if (!slots.length) {
            slotList.innerHTML = '<div style="color:#ef4444;">No slots available. Please contact HR team.</div>';
            return;
        }

        slotList.innerHTML = slots.map(s => `
            <button class="btn-primary-blue" style="text-align:left;" data-slot-id="${s.id}">
                ${new Date(s.starts_at).toLocaleString()} - ${new Date(s.ends_at).toLocaleTimeString()}
            </button>
        `).join("");

        Array.from(slotList.querySelectorAll("button[data-slot-id]")).forEach(btn => {
            btn.addEventListener("click", async () => {
                const slotId = btn.getAttribute("data-slot-id");
                btn.disabled = true;
                btn.textContent = "Booking...";
                try {
                    const bookRes = await fetch(`${API_BASE}/public/invitations/${token}/book/`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slot_id: slotId })
                    });
                    const bookData = await bookRes.json();
                    if (!bookRes.ok) throw new Error(bookData.error || "Booking failed");
                    if (bookingStatus) {
                        bookingStatus.textContent = "Slot booked successfully. HR will contact you with final details.";
                        bookingStatus.style.color = "#10b981";
                    }
                    slotList.innerHTML = '<div style="color:#10b981;">Your interview slot is confirmed.</div>';
                } catch (err) {
                    if (bookingStatus) {
                        bookingStatus.textContent = err.message;
                        bookingStatus.style.color = "#ef4444";
                    }
                    btn.disabled = false;
                    btn.textContent = "Book this slot";
                }
            });
        });
    } catch (err) {
        if (slotList) slotList.innerHTML = `<div style="color:#ef4444;">${err.message}</div>`;
    }
}


