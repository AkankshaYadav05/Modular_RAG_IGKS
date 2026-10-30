(() => {
  const apiBase = window.location.port === "5500"
    ? `http://${window.location.hostname}:8000`
    : "";
  const content = document.getElementById("page-content");
  const toast = document.getElementById("toast");
  const picker = document.getElementById("document-picker");
  const pageTitles = {
    login: ["Login", "Sign in to the Intelligent Governance Knowledge Engine"],
    dashboard: ["Dashboard", "Your workspace at a glance"],
    search: ["AI Knowledge Search", "Ask a question and explore answers grounded in official documents."],
    documents: ["Document Repository", "Browse and search documents available in your knowledge base."],
    comparison: ["Policy Comparison", "Compare policy documents using AI-powered analysis."],
    saved: ["Saved Documents", "Your bookmarked source passages."],
    history: ["Query History", "Review questions you have asked in this browser."],
    upload: ["Upload Documents", "Add official documents to the knowledge base."],
    knowledge: ["Knowledge Base", "Collection and retrieval service status."],
    users: ["Users & Roles", "Manage access to the knowledge engine."],
    audit: ["Audit Logs", "Recent activity in this browser session."],
    settings: ["System Settings", "View the active RAG pipeline configuration."]
  };
  const state = {
    health: null,
    online: false,
    mode: "AI Question",
    response: null,
    query: "",
    busy: false
  };
  let toastTimer;

  function readStorage(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function savesHistory() {
    try {
      return localStorage.getItem("igke-save-history") !== "false";
    } catch {
      return true;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      showToast("Browser storage is unavailable.");
      return false;
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function nowLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function setPage(name) {
    const page = pageTitles[name] ? name : "dashboard";
    document.querySelector(".app").classList.toggle("login-screen", page === "login");
    document.querySelectorAll(".nav-link").forEach((link) => {
      const active = link.dataset.page === page;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    document.title = `${pageTitles[page][0]} — IGKE`;
    content.innerHTML = renderPage(page);
    content.dataset.page = page;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (page === "search") {
      const box = document.getElementById("ai-query");
      if (box) box.focus({ preventScroll: true });
    }
  }

  function heading(page, actions = "") {
    const [title, subtitle] = pageTitles[page];
    return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
  }

  function quickAction(title, subtitle, icon, tone, page) {
    return `<button class="quick-card ${tone}" type="button" data-go="${page}"><span class="quick-icon">${icon}</span><span class="quick-copy"><strong>${title}</strong><small>${subtitle}</small></span><span class="quick-arrow">›</span></button>`;
  }

  function renderQueries(limit = 5) {
    const queries = readStorage("igke-queries", []).slice(0, limit);
    if (!queries.length) return `<div class="empty-state"><span class="empty-icon">⌕</span>No questions yet. Start with AI Knowledge Search.</div>`;
    return queries.map((item) => `<div class="recent-query"><span class="query-icon">⌕</span><span class="query-text" title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</span><span class="query-time">${escapeHtml(nowLabel(item.createdAt))}</span></div>`).join("");
  }

  function renderSavedSources(limit = 5) {
    const sources = readStorage("igke-saved-sources", []).slice(0, limit);
    if (!sources.length) return `<div class="empty-state"><span class="empty-icon">▮</span>Saved source passages will appear here. Save a source from an AI answer.</div>`;
    return sources.map((source, index) => sourceRow(source, index, true)).join("");
  }

  function sourceRow(source, index, saved = false) {
    const name = source.source || "Unknown source";
    const page = source.page && source.page !== "N/A" ? ` · Page ${source.page}` : "";
    const score = Number.isFinite(Number(source.similarity_score)) ? `${Math.round(Number(source.similarity_score) * 100)}% match` : "";
    return `<div class="source-item">
      <div class="source-head"><span class="source-index">${escapeHtml(source.rank || index + 1)}</span><span class="source-name" title="${escapeHtml(name)}">${escapeHtml(name)}${escapeHtml(page)}</span>${score ? `<span class="source-score">${score}</span>` : ""}<button class="icon-button ${saved ? "remove-saved" : "save-source"}" type="button" data-source-index="${index}" aria-label="${saved ? "Remove saved source" : "Save source"}" title="${saved ? "Remove saved source" : "Save source"}">${saved ? "×" : "▮"}</button></div>
      <p class="source-excerpt">${escapeHtml(source.excerpt || "No excerpt was returned.")}</p>
    </div>`;
  }

  function renderResult(data, query) {
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const answer = String(data.answer || "The backend returned an empty answer.");
    const paragraphs = answer.split(/\n{2,}/).map((text) => `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`).join("");
    const routing = data.routing || {};
    const elapsed = Number(data.response_time);
    const details = [
      Number.isFinite(elapsed) ? `${elapsed.toFixed(2)} sec` : "",
      routing.mode ? `${routing.mode} retrieval` : "",
      Number.isFinite(Number(routing.top_k)) ? `Top ${routing.top_k}` : ""
    ].filter(Boolean);
    return `<div class="answer-panel card">
      <div class="card-title"><h2>AI-generated answer</h2><button class="button small copy-answer" type="button">Copy answer</button></div>
      <div class="card-body"><div class="answer-copy">${paragraphs}</div><div class="result-meta">${details.map((item) => `<span class="meta-pill">${escapeHtml(item)}</span>`).join("")}</div></div>
    </div>
    <div class="card answer-panel"><div class="card-title"><h2>Sources used</h2><span class="muted">${sources.length} ${sources.length === 1 ? "passage" : "passages"}</span></div><div class="card-body"><div class="source-list">${sources.length ? sources.map((source, index) => sourceRow(source, index)).join("") : `<div class="empty-state">No source passages were returned for this question.</div>`}</div></div></div>`;
  }

  function dashboard() {
    const docCount = state.health?.documents;
    const queryCount = readStorage("igke-queries", []).length;
    const savedCount = readStorage("igke-saved-sources", []).length;
    const online = state.online;
    const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
    const examples = [
      "What are the eligibility criteria for scholarships in higher education?",
      "Explain the key provisions of National Education Policy 2020.",
      "Show the latest guidance on digital education.",
      "Compare teacher training guidelines."
    ];
    return `${heading("dashboard")}
      <section class="hero">
        <div class="hero-content">
          <span class="welcome-pill">Welcome, Sanika !</span>
          <h1>${greeting}, Sanika!<br>What information are you looking for?</h1>
          <p>Search official policies, schemes, regulations, circulars and more using AI.</p>
          <form class="search-box" id="dashboard-search"><span class="search-symbol">⌕</span><label class="sr-only" for="dashboard-query">Ask or search official documents</label><input id="dashboard-query" placeholder="Ask a question or search official documents…" required><button class="button primary" type="submit">Search <span>→</span></button></form>
          <div class="mode-row"><span class="mode-label">Search Mode:</span>${["AI Question", "Keyword Search", "Advanced Search"].map((item) => `<button class="mode-chip ${state.mode === item ? "selected" : ""}" type="button" data-mode="${item}">${item === "AI Question" ? "✳" : item === "Keyword Search" ? "⌕" : "⚙"} ${item}</button>`).join("")}</div>
        </div><div class="hero-quote">“Empowering Minds<br>Building the Nation”</div>
      </section>
      <div class="try-row"><span class="try-label">Try asking:</span><div class="try-chips">${examples.map((item) => `<button class="try-chip" type="button" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div></div>
      <section class="card quick-actions"><div class="card-title"><h2>Quick Actions</h2><button class="link-button" type="button" data-go="documents">View all →</button></div><div class="quick-grid">
        ${quickAction("Ask AI","Get answers from official documents","▣","green","search")}
        ${quickAction("Search Documents","Find policies, schemes and circulars","▤","blue","documents")}
        ${quickAction("Compare Policies","Analyze and compare policy documents","⚖","orange","comparison")}
        ${quickAction("Upload Document","Add new documents to the knowledge base","⇧","purple","upload")}
      </div></section>
      <div class="dashboard-grid">
        <section class="card"><div class="card-title"><h2>Recent Documents</h2><button class="link-button" type="button" data-go="documents">View all →</button></div><div class="card-body">${renderSavedSources(4)}</div></section>
        <section class="card"><div class="card-title"><h2>Recent Queries</h2><button class="link-button" type="button" data-go="history">View all →</button></div><div class="card-body">${renderQueries(5)}</div></section>
      </div>
      <div class="stats-row dashboard-stats">
        ${statCard("▤", docCount === undefined ? "—" : docCount, "Documents indexed", "blue")}
        ${statCard("⌕", queryCount, "Questions in this browser", "green")}
        ${statCard("▮", savedCount, "Saved passages", "purple")}
        ${statCard("●", online ? "Online" : "Offline", "RAG service", online ? "green" : "orange")}
      </div>`;
  }

  function loginPage() {
    return `<section class="login-layout">
      <div class="login-presentation">
        <div class="login-brand"><span class="emblem">अ</span><span><strong>Government of India</strong><b>Ministry of Education</b></span></div>
        <div class="login-message"><span class="welcome-pill">INTELLIGENT GOVERNANCE KNOWLEDGE ENGINE</span><h1>Knowledge that<br><span>moves education forward.</span></h1><p>AI-powered knowledge retrieval for official education documents.</p></div>
        <div class="login-features"><span>◈ Transparent Governance</span><span>◷ Faster Information Access</span><span>✓ Evidence-based Decisions</span></div>
        <div class="login-tricolor"><i></i><i></i><i></i></div>
      </div>
      <div class="login-side"><form class="login-card" id="login-form">
        <div class="login-emblem">अ</div><span class="eyebrow">WELCOME BACK</span><h2>Sign in to IGKE</h2><p>Use your official account to continue.</p>
        <label class="field">Official email<input type="email" placeholder="name@education.gov.in" autocomplete="username" required></label>
        <label class="field">Password<input type="password" placeholder="Enter your password" autocomplete="current-password" required></label>
        <label class="remember-control"><input type="checkbox" checked> Remember me <button class="link-button" type="button" data-notice="Password recovery is not configured in the backend.">Forgot password?</button></label>
        <button class="button primary login-submit" type="submit">Sign in</button>
        <div class="login-separator"><span>OR CONTINUE WITH</span></div>
        <button class="button sso-button" type="button" data-notice="Government SSO is not connected to the current backend.">Government SSO</button>
        <p class="login-notice">Sign-in is a UI preview. Authentication is not currently connected to the backend.</p>
        <a class="back-link" href="#dashboard">← Return to dashboard</a>
      </form></div>
    </section>`;
  }

  function statCard(icon, value, label, tone) {
    return `<div class="card stat-card"><span class="stat-icon ${tone}">${icon}</span><span class="stat-copy"><strong>${escapeHtml(value)}</strong><small>${escapeHtml(label)}</small></span></div>`;
  }

  function searchPage() {
    const modes = ["AI Question", "Keyword Search", "Advanced Search"];
    return `${heading("search")}
      <div class="page-search-grid">
        <section>
          <div class="card"><div class="card-title"><h2>Ask your knowledge base</h2><span class="tag ${state.online ? "green" : ""}">${state.online ? "Connected" : "Backend offline"}</span></div>
            <div class="card-body search-panel">
              <form class="search-box" id="ai-search-form"><span class="search-symbol">⌕</span><label class="sr-only" for="ai-query">Ask your knowledge base</label><input id="ai-query" maxlength="4000" placeholder="Ask a question about official education documents…" value="${escapeHtml(state.query)}" required><button class="button primary" id="search-submit" type="submit">Search →</button></form>
              <div class="search-tools"><div class="mode-row">${modes.map((item) => `<button class="mode-chip ${state.mode === item ? "selected" : ""}" type="button" data-mode="${item}">${item}</button>`).join("")}</div><label class="select-control">Sources<select id="top-k"><option value="3">3</option><option value="5" selected>5</option><option value="8">8</option><option value="10">10</option></select></label></div>
              <div id="search-result">${state.response ? renderResult(state.response, state.query) : `<div class="empty-state"><span class="empty-icon">✳</span>Ask a question to receive an answer grounded in your knowledge base.</div>`}</div>
            </div>
          </div>
        </section>
        <aside>
          <section class="card"><div class="card-title"><h2>Try asking</h2></div><div class="card-body">${[
            "What are the main points of the National Education Policy?",
            "Summarize the latest scholarship guidelines.",
            "What do the documents say about teacher training?"
          ].map((text) => `<button class="try-chip try-chip-block" type="button" data-query="${escapeHtml(text)}">${escapeHtml(text)} <span>→</span></button>`).join("")}</div></section>
          <section class="card answer-panel"><div class="card-title"><h2>How search works</h2></div><div class="card-body"><div class="processing-step"><span class="step-number">1</span><strong>Find relevant passages</strong><span class="step-status">Retrieve</span></div><div class="processing-step"><span class="step-number">2</span><strong>Rank useful sources</strong><span class="step-status">Rerank</span></div><div class="processing-step"><span class="step-number">3</span><strong>Generate a grounded answer</strong><span class="step-status">Answer</span></div></div></section>
        </aside>
      </div>`;
  }

  function documentsPage() {
    const saved = readStorage("igke-saved-sources", []);
    const count = state.health?.documents;
    return `${heading("documents", `<button class="button" type="button" data-go="knowledge">Knowledge base status</button><button class="button primary" type="button" data-go="upload">＋ Upload Document</button>`)}
      <section class="card"><div class="card-title"><h2>Official Document Repository</h2><span class="tag">${count === undefined ? "Checking collection…" : `${count} indexed documents`}</span></div>
        <div class="card-body"><div class="toolbar"><div class="search-box"><span class="search-symbol">⌕</span><input id="repository-filter" placeholder="Search documents you have saved…" aria-label="Search saved source passages"></div><label class="select-control">Category<select class="filter-control"><option>All</option></select></label><button class="button small" type="button" data-go="knowledge">Clear filters</button></div>
          ${saved.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Source document</th><th>Page</th><th>Passage</th><th>Actions</th></tr></thead><tbody>${saved.map((source, index) => `<tr data-filter-text="${escapeHtml(`${source.source} ${source.excerpt}`.toLowerCase())}"><td><div class="table-file"><span class="file-icon">PDF</span><span class="table-file-copy"><strong>${escapeHtml(source.source || "Unknown source")}</strong><small>Saved from AI Knowledge Search</small></span></div></td><td>${escapeHtml(source.page || "—")}</td><td>${escapeHtml((source.excerpt || "").slice(0, 100))}${(source.excerpt || "").length > 100 ? "…" : ""}</td><td><button class="button small remove-saved" data-source-index="${index}" type="button">Remove</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><span class="empty-icon">▤</span>Your backend currently exposes the indexed-document count, but not a document-list endpoint.<br>Save source passages from AI Search to see them listed here.</div>`}
          <div class="pagination"><span>${saved.length ? `${saved.length} saved source passages` : "Document listing requires a backend endpoint"}</span><span class="pagination-actions"><button class="page-number active" type="button">1</button></span></div>
        </div>
      </section>`;
  }

  function comparisonPage() {
    return `${heading("comparison")}
      <section class="card"><div class="card-title"><h2>Compare Policies</h2><span class="tag">AI-assisted</span></div>
        <div class="comparison-controls"><label class="field">First policy or topic<input id="compare-first" placeholder="e.g. National Education Policy 2020"></label><label class="field">Second policy or topic<input id="compare-second" placeholder="e.g. Teacher Training Guidelines"></label><button class="button primary" id="compare-button" type="button">Compare policies →</button></div>
      </section>
      <div id="comparison-result" class="answer-panel"></div>
      <div class="comparison-grid">
        ${["Objective","Target audience","Key provisions","Implementation","Assessment"].map((item) => `<section class="card"><div class="card-title"><h2>${item}</h2></div><div class="card-body muted" style="font-size:9px;line-height:1.6">Enter two policy names above. The comparison will be generated from the documents indexed in your knowledge base.</div></section>`).join("")}
      </div>`;
  }

  function savedPage() {
    const sources = readStorage("igke-saved-sources", []);
    return `${heading("saved", `<button class="button" type="button" data-go="search">Search documents</button>`)}
      <section class="card"><div class="card-title"><h2>Saved source passages</h2><span class="muted">${sources.length} saved</span></div><div class="card-body"><div class="source-list">${sources.length ? sources.map((source, index) => sourceRow(source, index, true)).join("") : `<div class="empty-state"><span class="empty-icon">▮</span>No saved passages yet. Search your knowledge base, then select the bookmark icon on a source.</div>`}</div></div></section>`;
  }

  function historyPage() {
    const items = readStorage("igke-queries", []);
    return `${heading("history", `<button class="button" id="clear-history" type="button">Clear history</button>`)}
      <section class="card"><div class="card-title"><h2>Recent searches</h2><span class="muted">${items.length} saved locally</span></div><div class="card-body">${items.length ? items.map((item) => `<div class="history-entry"><span class="query-icon">⌕</span><p title="${escapeHtml(item.query)}">${escapeHtml(item.query)}</p><small>${escapeHtml(nowLabel(item.createdAt))}</small><button class="button small repeat-query" data-query="${escapeHtml(item.query)}" type="button">Ask again</button></div>`).join("") : `<div class="empty-state"><span class="empty-icon">◷</span>Your searches will appear here after you ask a question.</div>`}</div></section>`;
  }

  function uploadPage() {
    return `${heading("upload")}
      <div class="upload-layout">
        <section class="card"><div class="card-title"><h2>Upload Official Document</h2><span class="tag">PDF, DOCX, TXT</span></div><div class="card-body">
          <div class="drop-zone" id="drop-zone"><div><div class="upload-cloud">⇧</div><h2>Drag &amp; drop a document here</h2><p>Choose a PDF, DOCX or TXT file (maximum 20 MB)</p><button class="button primary" id="browse-files" type="button">Browse files</button><div class="file-selection" id="file-selection"></div></div></div>
          <div class="error-message">The current backend does not expose a document-upload endpoint, so selected files are not sent or stored. Add an upload API to enable ingestion from this screen.</div>
        </div></section>
        <section class="card"><div class="card-title"><h2>Document Processing Pipeline</h2><span class="tag">Pipeline overview</span></div><div class="card-body">
          ${["Document selected","Text extraction","Chunking","Generate embeddings","Store in vector database"].map((item, index) => `<div class="processing-step"><span class="step-number">${index + 1}</span><strong>${item}</strong><span class="step-status">${index === 0 ? "Ready" : "Pending"}</span></div>`).join("")}
        </div></section>
      </div>`;
  }

  function knowledgePage() {
    const health = state.health;
    return `${heading("knowledge", `<button class="button" id="refresh-health" type="button">↻ Refresh status</button>`)}
      <div class="stats-row">
        ${statCard("▤", health?.documents ?? "—", "Documents in collection", "blue")}
        ${statCard("◈", health?.retriever ?? "—", "Retriever", "green")}
        ${statCard("✳", health?.generator ?? "—", "Answer generator", "purple")}
        ${statCard("●", state.online ? "Online" : "Offline", "API health", state.online ? "green" : "orange")}
      </div>
      <section class="card"><div class="card-title"><h2>Knowledge Base Configuration</h2><span class="tag ${state.online ? "green" : ""}">${state.online ? "Connected" : "Not connected"}</span></div><div class="card-body">
        ${[
          ["Collection", health?.collection || "Unavailable"],
          ["Embedding model", health?.embedding_model || "Unavailable"],
          ["Retriever", health?.retriever || "Unavailable"],
          ["Reranker", health?.reranker ? `${health.reranker}${health.rerank_enabled ? " (enabled)" : " (disabled)"}` : "Unavailable"],
          ["Generator", health?.generator || "Unavailable"],
          ["Query API", "/api/query"]
        ].map(([label, value]) => `<div class="setting-row"><span class="setting-copy"><strong>${label}</strong><small>${escapeHtml(value)}</small></span><span class="tag ${state.online ? "green" : ""}">${state.online ? "Available" : "Unavailable"}</span></div>`).join("")}
      </div></section>
      <p class="muted" style="font-size:9px">This page reads live configuration from the existing <code>/api/health</code> endpoint.</p>`;
  }

  function usersPage() {
    return `${heading("users")}
      <section class="card"><div class="card-title"><h2>Users &amp; Roles</h2><button class="button primary" type="button" data-notice="User management requires an authentication and users API.">＋ Add user</button></div>
        <div class="card-body"><div class="empty-state"><span class="empty-icon">♧</span>User accounts and roles are not exposed by the current backend.<br>This screen is ready to connect when an authentication API is available.</div></div>
      </section>`;
  }

  function auditPage() {
    const queries = readStorage("igke-queries", []);
    const events = queries.map((item) => ({ action: "Knowledge search", detail: item.query, time: item.createdAt }));
    return `${heading("audit")}
      <section class="card"><div class="card-title"><h2>Recent Activity</h2><span class="tag">This browser only</span></div><div class="card-body">
      ${events.length ? events.map((item) => `<div class="history-entry"><span class="query-icon">◷</span><p title="${escapeHtml(item.detail)}">${escapeHtml(item.action)}: ${escapeHtml(item.detail)}</p><small>${escapeHtml(nowLabel(item.time))}</small></div>`).join("") : `<div class="empty-state"><span class="empty-icon">☷</span>No local activity yet. Server-side audit logs require an audit API.</div>`}</div></section>`;
  }

  function settingsPage() {
    const health = state.health;
    const options = [
      ["API connection", state.online ? "Connected to the RAG backend" : "Backend is not reachable"],
      ["Retrieval mode", health?.retriever || "Not available"],
      ["Reranking", health ? (health.rerank_enabled ? "Enabled" : "Disabled") : "Not available"],
      ["Answer generation", health?.generator || "Not available"]
    ];
    return `${heading("settings", `<button class="button" id="refresh-health" type="button">↻ Refresh status</button>`)}
      <div class="settings-grid">
        <section class="card"><div class="card-title"><h2>Pipeline Configuration</h2></div><div class="card-body">${options.map(([label, value]) => `<div class="setting-row"><span class="setting-copy"><strong>${label}</strong><small>${escapeHtml(value)}</small></span><span class="status-indicator ${state.online ? "" : "offline"}"></span></div>`).join("")}</div></section>
        <section class="card"><div class="card-title"><h2>Active models</h2></div><div class="card-body">${[
          ["Embedding model", health?.embedding_model],
          ["Generator", health?.generator],
          ["Router", health?.router],
          ["Reranker", health?.reranker]
        ].map(([label, value]) => `<div class="setting-row"><span class="setting-copy"><strong>${label}</strong><small>${escapeHtml(value || "Not available")}</small></span></div>`).join("")}</div></section>
        <section class="card"><div class="card-title"><h2>Interface preferences</h2></div><div class="card-body">${[
          ["Compact navigation", "Use the responsive navigation layout"],
          ["Save search history", "Store recent questions in this browser"]
          ].map(([label, detail], index) => `<div class="setting-row"><span class="setting-copy"><strong>${label}</strong><small>${detail}</small></span><button class="switch preference-switch" type="button" role="switch" aria-checked="${index === 1 ? savesHistory() : false}" aria-label="${label}"></button></div>`).join("")}</div></section>
        <section class="card"><div class="card-title"><h2>About</h2></div><div class="card-body"><p class="muted" style="font-size:10px;line-height:1.7">Intelligent Governance Knowledge Engine<br>AI-powered retrieval over official education documents.</p><a class="button small" href="${apiBase}/docs" target="_blank" rel="noreferrer">Open API documentation ↗</a></div></section>
      </div>`;
  }

  function renderPage(page) {
    const renderers = {
      login: loginPage, dashboard, search: searchPage, documents: documentsPage, comparison: comparisonPage,
      saved: savedPage, history: historyPage, upload: uploadPage, knowledge: knowledgePage,
      users: usersPage, audit: auditPage, settings: settingsPage
    };
    return renderers[page]();
  }

  async function checkHealth() {
    try {
      const response = await fetch(`${apiBase}/api/health`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      state.health = await response.json();
      state.online = true;
    } catch {
      state.online = false;
    }
    const currentPage = content.dataset.page || "dashboard";
    if (currentPage === "knowledge" || currentPage === "settings") setPage(currentPage);
    if (currentPage === "dashboard") setPage("dashboard");
  }

  async function ask(query, topK) {
    const cleanQuery = query.trim();
    if (!cleanQuery || state.busy) return;
    state.query = cleanQuery;
    state.response = null;
    state.busy = true;
    if (location.hash !== "#search") {
      location.hash = "search";
      setPage("search");
    } else {
      setPage("search");
    }
    const result = document.getElementById("search-result");
    const submit = document.getElementById("search-submit");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Searching…";
    }
    if (result) result.innerHTML = `<div class="loading">Searching indexed passages and generating a grounded answer…</div>`;
    try {
      const response = await fetch(`${apiBase}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: cleanQuery, top_k: Number(topK) || 5 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : `Request failed (${response.status})`;
        throw new Error(detail);
      }
      state.response = payload;
      state.query = cleanQuery;
      const queries = readStorage("igke-queries", []);
      if (savesHistory()) {
        queries.unshift({ query: cleanQuery, createdAt: new Date().toISOString() });
        writeStorage("igke-queries", queries.slice(0, 50));
      }
      const currentResult = document.getElementById("search-result");
      if (currentResult) currentResult.innerHTML = renderResult(payload, cleanQuery);
      state.online = true;
    } catch (error) {
      const currentResult = document.getElementById("search-result");
      if (currentResult) currentResult.innerHTML = `<div class="error-message">${escapeHtml(error.message || "Unable to contact the backend. Check that the API is running, then try again.")}</div>`;
      if (error instanceof TypeError) {
        state.online = false;
        showToast("Could not connect to the backend.");
      }
    } finally {
      state.busy = false;
      const currentSubmit = document.getElementById("search-submit");
      if (currentSubmit) {
        currentSubmit.disabled = false;
        currentSubmit.textContent = "Search →";
      }
    }
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("selected", button.dataset.mode === mode));
    if (mode === "Keyword Search") showToast("Keyword Search is a UI mode; the backend currently provides AI query search.");
    if (mode === "Advanced Search") showToast("Advanced filters require additional backend search parameters.");
  }

  function saveSource(index) {
    if (!state.response || !Array.isArray(state.response.sources)) return;
    const source = state.response.sources[index];
    if (!source) return;
    const saved = readStorage("igke-saved-sources", []);
    const key = `${source.source || ""}|${source.page || ""}|${source.excerpt || ""}`;
    const existing = saved.findIndex((item) => `${item.source || ""}|${item.page || ""}|${item.excerpt || ""}` === key);
    if (existing >= 0) {
      saved.splice(existing, 1);
      showToast("Source removed from saved documents.");
    } else {
      saved.unshift(source);
      showToast("Source saved to your documents.");
    }
    writeStorage("igke-saved-sources", saved.slice(0, 100));
    if (content.dataset.page === "search") {
      const result = document.getElementById("search-result");
      if (result) result.innerHTML = renderResult(state.response, state.query);
    } else {
      setPage(content.dataset.page || "dashboard");
    }
  }

  async function comparePolicies() {
    const first = document.getElementById("compare-first")?.value.trim();
    const second = document.getElementById("compare-second")?.value.trim();
    const target = document.getElementById("comparison-result");
    if (!first || !second) {
      showToast("Enter both policy names to compare.");
      return;
    }
    const prompt = `Compare ${first} and ${second}. Explain their objectives, target audience, key provisions, implementation approach, and important differences using the available documents.`;
    target.innerHTML = `<div class="card"><div class="card-body loading">Comparing the policies using your indexed documents…</div></div>`;
    const button = document.getElementById("compare-button");
    button.disabled = true;
    button.textContent = "Comparing…";
    try {
      const response = await fetch(`${apiBase}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: prompt, top_k: 8 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : `Request failed (${response.status})`);
      state.response = payload;
      state.query = prompt;
      const queries = readStorage("igke-queries", []);
      if (savesHistory()) {
        queries.unshift({ query: prompt, createdAt: new Date().toISOString() });
        writeStorage("igke-queries", queries.slice(0, 50));
      }
      target.innerHTML = `<div class="card"><div class="card-title"><h2>AI comparison summary</h2><span class="tag green">${escapeHtml(payload.sources?.length || 0)} sources</span></div><div class="card-body answer-copy">${String(payload.answer || "").split(/\n{2,}/).map((text) => `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`).join("")}<div class="source-list">${(payload.sources || []).map((source, index) => `<div class="source-item"><div class="source-head"><span class="source-index">${index + 1}</span><span class="source-name">${escapeHtml(source.source || "Unknown source")}</span></div><p class="source-excerpt">${escapeHtml(source.excerpt || "")}</p></div>`).join("")}</div></div></div>`;
      state.online = true;
    } catch (error) {
      target.innerHTML = `<div class="error-message">${escapeHtml(error.message || "Could not connect to the backend.")}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Compare policies →";
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button,a");
    if (!target) return;
    if (target.matches(".nav-link")) {
      const page = target.dataset.page;
      if (location.hash === `#${page}`) setPage(page);
      else location.hash = page;
      return;
    }
    if (target.dataset.go) {
      location.hash = target.dataset.go;
      return;
    }
    if (target.dataset.mode) {
      setMode(target.dataset.mode);
      return;
    }
    if (target.dataset.query) {
      if (content.dataset.page === "dashboard") ask(target.dataset.query, 5);
      else {
        state.query = target.dataset.query;
        location.hash = "search";
        setPage("search");
      }
      return;
    }
    if (target.classList.contains("save-source")) {
      saveSource(Number(target.dataset.sourceIndex));
      return;
    }
    if (target.classList.contains("remove-saved")) {
      const saved = readStorage("igke-saved-sources", []);
      saved.splice(Number(target.dataset.sourceIndex), 1);
      writeStorage("igke-saved-sources", saved);
      setPage(content.dataset.page || "documents");
      showToast("Saved passage removed.");
      return;
    }
    if (target.classList.contains("repeat-query")) {
      ask(target.dataset.query, 5);
      return;
    }
    if (target.id === "compare-button") {
      comparePolicies();
      return;
    }
    if (target.id === "clear-history") {
      writeStorage("igke-queries", []);
      setPage("history");
      showToast("Query history cleared.");
      return;
    }
    if (target.id === "browse-files") {
      picker.click();
      return;
    }
    if (target.id === "refresh-health") {
      checkHealth().then(() => showToast(state.online ? "Backend status refreshed." : "Backend is unavailable."));
      return;
    }
    if (target.classList.contains("copy-answer")) {
      const text = state.response?.answer || "";
      navigator.clipboard.writeText(text).then(() => showToast("Answer copied.")).catch(() => showToast("Clipboard access is unavailable."));
      return;
    }
    if (target.classList.contains("preference-switch")) {
      const checked = target.getAttribute("aria-checked") === "true";
      target.setAttribute("aria-checked", String(!checked));
      if (target.getAttribute("aria-label") === "Save search history") {
        writeStorage("igke-save-history", !checked);
        showToast(!checked ? "Search history will be saved in this browser." : "Search history saving turned off.");
      }
      return;
    }
    if (target.dataset.notice) {
      showToast(target.dataset.notice);
      return;
    }
    if (target.matches("[data-static-link]")) {
      event.preventDefault();
      showToast(`${target.textContent.trim()} information is not configured yet.`);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "login-form") {
      event.preventDefault();
      showToast("Authentication is not configured in the backend yet.");
    }
    if (event.target.id === "dashboard-search") {
      event.preventDefault();
      const query = document.getElementById("dashboard-query").value.trim();
      if (query) ask(query, 5);
    }
    if (event.target.id === "ai-search-form") {
      event.preventDefault();
      ask(document.getElementById("ai-query").value, document.getElementById("top-k")?.value);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "repository-filter") {
      const term = event.target.value.trim().toLowerCase();
      document.querySelectorAll("[data-filter-text]").forEach((row) => {
        row.hidden = !row.dataset.filterText.includes(term);
      });
    }
  });

  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    const message = document.getElementById("file-selection");
    if (!file || !message) return;
    message.textContent = `${file.name} selected. Upload is not available until a backend upload endpoint is added.`;
  });

  content.addEventListener("dragover", (event) => {
    if (content.dataset.page !== "upload") return;
    event.preventDefault();
    document.getElementById("drop-zone")?.classList.add("dragging");
  });
  content.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget || !content.contains(event.relatedTarget)) document.getElementById("drop-zone")?.classList.remove("dragging");
  });
  content.addEventListener("drop", (event) => {
    if (content.dataset.page !== "upload") return;
    event.preventDefault();
    document.getElementById("drop-zone")?.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    const message = document.getElementById("file-selection");
    if (file && message) message.textContent = `${file.name} selected. Upload is not available until a backend upload endpoint is added.`;
  });

  document.getElementById("user-menu").addEventListener("click", () => { location.hash = "login"; });
  document.querySelector(".notification-button").addEventListener("click", () => showToast("You’re all caught up."));
  window.addEventListener("hashchange", () => setPage(location.hash.slice(1) || "dashboard"));
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      location.hash = "search";
    }
  });

  setPage(location.hash.slice(1) || "dashboard");
  checkHealth();
  window.setInterval(checkHealth, 60000);
})();
