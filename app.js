/* Flyer Industries Command Center — App Logic (Supabase) */
(function () {
  "use strict";

  /* =========================================
     SUPABASE CLIENT
     ========================================= */
  var SUPABASE_URL = "https://bisdygfnaopzaefaawhk.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpc2R5Z2ZuYW9wemFlZmFhd2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njg4NjMsImV4cCI6MjA4ODM0NDg2M30.RF6ApAB20oDse7JT4eFkoFhkbS41ZdREtvQ55fdj8mw";

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  /* =========================================
     DOM REFS
     ========================================= */
  var loginScreen = document.getElementById("loginScreen");
  var dashboardWrapper = document.getElementById("dashboardWrapper");
  var loginForm = document.getElementById("loginForm");
  var loginEmail = document.getElementById("loginEmail");
  var loginPassword = document.getElementById("loginPassword");
  var loginBtn = document.getElementById("loginBtn");
  var loginError = document.getElementById("loginError");
  var docModal = document.getElementById("docModal");
  var docModalTitle = document.getElementById("docModalTitle");
  var docModalFrame = document.getElementById("docModalFrame");
  var docModalClose = document.getElementById("docModalClose");

  /* =========================================
     DATA CACHE
     ========================================= */
  var cache = {
    projects: [],
    tasks: [],
    documents: [],
    financeKpis: [],
    financeRecords: [],
    properties: [],
    managementEntities: [],
    calendarEvents: []
  };

  /* =========================================
     AUTH
     ========================================= */
  function showLogin() {
    loginScreen.classList.remove("hidden");
    dashboardWrapper.classList.add("hidden");
  }

  function showDashboard() {
    loginScreen.classList.add("hidden");
    dashboardWrapper.classList.remove("hidden");
  }

  // Check for existing session on load
  async function checkSession() {
    try {
      var result = await sb.auth.getSession();
      var session = result.data && result.data.session;
      if (session) {
        showDashboard();
        await loadAllData();
      } else {
        showLogin();
      }
    } catch (err) {
      console.error("Session check error:", err);
      showLogin();
    }
  }

  // Listen for auth state changes
  sb.auth.onAuthStateChange(function (event, session) {
    if (event === "SIGNED_OUT") {
      showLogin();
    }
  });

  // Login form handler
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    loginError.classList.remove("visible");
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    try {
      var result = await sb.auth.signInWithPassword({
        email: loginEmail.value.trim(),
        password: loginPassword.value
      });

      if (result.error) {
        throw result.error;
      }

      showDashboard();
      await loadAllData();
    } catch (err) {
      loginError.textContent = err.message || "Authentication failed.";
      loginError.classList.add("visible");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  });

  // Logout
  window.handleLogout = async function () {
    await sb.auth.signOut();
    // Clear caches
    cache.projects = [];
    cache.tasks = [];
    cache.documents = [];
    cache.financeKpis = [];
    cache.financeRecords = [];
    cache.properties = [];
    cache.managementEntities = [];
    cache.calendarEvents = [];
    // Clear dynamic views
    document.getElementById("dynamicProjectViews").innerHTML = "";
    document.getElementById("navProjectsList").innerHTML = "";
    showLogin();
  };

  /* =========================================
     DATA FETCHING
     ========================================= */
  async function loadAllData() {
    try {
      var results = await Promise.all([
        sb.from("projects").select("*"),
        sb.from("tasks").select("*"),
        sb.from("documents").select("*"),
        sb.from("finance_kpis").select("*"),
        sb.from("finance_records").select("*").order("record_date", { ascending: false }).limit(50),
        sb.from("properties").select("*"),
        sb.from("management_entities").select("*"),
        sb.from("calendar_events").select("*").order("start_time", { ascending: true })
      ]);

      cache.projects = (results[0].data || []);
      cache.tasks = (results[1].data || []);
      cache.documents = (results[2].data || []);
      cache.financeKpis = (results[3].data || []);
      cache.financeRecords = (results[4].data || []);
      cache.properties = (results[5].data || []);
      cache.managementEntities = (results[6].data || []);
      cache.calendarEvents = (results[7].data || []);

      renderSidebarProjects();
      renderHomeView();
      renderProjectViews();
      renderAllDocumentsView();
      initCalendar();
    } catch (err) {
      console.error("Data load error:", err);
    }
  }

  /* =========================================
     HELPER FUNCTIONS
     ========================================= */
  function esc(str) {
    if (!str) return "";
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function getProjectColor(project) {
    return project.color || "#5ba0d9";
  }

  function getStatusBadgeClass(status) {
    if (!status) return "status-plan";
    var s = status.toLowerCase();
    if (s === "active") return "status-active";
    if (s === "in development" || s === "in_development" || s === "in dev") return "status-dev";
    return "status-plan";
  }

  function getStatusLabel(status) {
    if (!status) return "Planning";
    var s = status.toLowerCase();
    if (s === "active") return "Active";
    if (s === "in development" || s === "in_development" || s === "in dev") return "In Development";
    if (s === "planning") return "Planning";
    return status;
  }

  function formatCurrency(val) {
    if (val == null) return "—";
    var str = String(val);
    // Already formatted
    if (str.indexOf("Rp") !== -1) return str;
    var num = parseFloat(str);
    if (isNaN(num)) return str;
    return "Rp " + num.toLocaleString("id-ID");
  }

  // Format KPI names from DB snake_case to display names
  var kpiNameMap = {
    daily_expenses: "DAILY EXPENSES",
    petty_cash: "PETTY CASH",
    gross_sales: "GROSS SALES",
    net_sales: "NET SALES",
    revenue: "REVENUE",
    food_cost: "FOOD COST",
    bev_cost: "BEV. COST"
  };

  function formatKpiName(name) {
    if (!name) return "";
    return kpiNameMap[name] || name.replace(/_/g, " ").toUpperCase();
  }

  // Format record type for display
  var recordTypeMap = {
    expense: "Expense",
    petty_cash: "Petty Cash",
    income: "Income",
    transfer: "Transfer"
  };

  function formatRecordType(type) {
    if (!type) return "Expense";
    return recordTypeMap[type] || type;
  }

  function getRecordTypeClass(type) {
    if (!type) return "ct-expense";
    return type.toLowerCase().indexOf("petty") !== -1 ? "ct-petty" : "ct-expense";
  }

  function getDocIcon(color) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
  }

  // Get icon color for different doc file types
  function getDocFileIcon(doc, defaultColor) {
    if (doc.file_type === "sheets") {
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B8A5E" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>';
    }
    return getDocIcon(defaultColor);
  }

  function formatDocMeta(doc) {
    var fileType = (doc.file_type || "pdf").toUpperCase();
    if (fileType === "SHEETS") fileType = "Google Sheets";
    var meta = fileType;
    if (doc.page_count) {
      meta += " \u2014 " + doc.page_count + (fileType === "PDF" && doc.source === "ai_generated" ? " slides" : " pages");
    }
    if (fileType === "Google Sheets") {
      meta += " \u2014 Live";
    }
    return meta;
  }

  function formatSource(source) {
    if (!source) return "";
    var sourceMap = {
      ai_generated: "AI Generated",
      telegram: "From Telegram",
      google_drive: "Google Drive",
      upload: "Uploaded"
    };
    return sourceMap[source] || source;
  }

  function getProjectById(id) {
    for (var i = 0; i < cache.projects.length; i++) {
      if (cache.projects[i].id === id) return cache.projects[i];
    }
    return null;
  }

  function getProjectSlug(project) {
    return project.slug || project.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  // Hero card SVG icons by slug (matching original design)
  var heroIcons = {
    hostcard: '<svg class="hero-icon" width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="12" width="36" height="24" rx="3" stroke="currentColor" stroke-width="2"/><path d="M6 18h36" stroke="currentColor" stroke-width="1.5"/><path d="M12 24h12M12 28h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".6"/></svg>',
    taxmate: '<svg class="hero-icon" width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="10" y="6" width="28" height="36" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 14h16M16 20h10M16 26h13M16 32h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".6"/></svg>',
    crafted: '<svg class="hero-icon" width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M16 36V24c0-6 4-12 8-14 4 2 8 8 8 14v12" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 36h24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="28" r="2" fill="currentColor" opacity=".5"/></svg>',
    ascend: '<svg class="hero-icon" width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M8 40l16-28 16 28H8z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M24 22v8M24 34v0" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/></svg>',
    flyerlabs: '<svg class="hero-icon" width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2" fill="none"/><path d="M24 14v10l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  function getHeroIcon(slug) {
    return heroIcons[slug] || heroIcons.flyerlabs;
  }

  /* =========================================
     RENDER: SIDEBAR PROJECTS
     ========================================= */
  function renderSidebarProjects() {
    var container = document.getElementById("navProjectsList");
    var html = "";
    cache.projects.forEach(function (p) {
      var slug = getProjectSlug(p);
      html += '<button class="nav-item nav-project" data-view="' + slug + '" onclick="showView(\'' + slug + '\')">';
      html += '<span class="project-dot" style="background:' + getProjectColor(p) + '"></span> ' + esc(p.name);
      html += '</button>';
    });
    container.innerHTML = html;
  }

  /* =========================================
     RENDER: HOME VIEW
     ========================================= */
  function renderHomeView() {
    renderHeroCards();
    renderQuickStats();
    renderRecentDocs();
  }

  function renderHeroCards() {
    var container = document.getElementById("heroGrid");
    if (cache.projects.length === 0) {
      container.innerHTML = '<div class="empty-state">No projects found.</div>';
      return;
    }
    var html = "";
    cache.projects.forEach(function (p) {
      var slug = getProjectSlug(p);
      html += '<div class="hero-card hero-' + slug + '" onclick="showView(\'' + slug + '\')">';
      html += '<div class="hero-badge">' + esc(getStatusLabel(p.status)) + '</div>';
      html += getHeroIcon(slug);
      html += '<h3>' + esc(p.name) + '</h3>';
      html += '<p>' + esc(p.tagline || "") + '</p>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  function renderQuickStats() {
    var container = document.getElementById("quickStats");
    var activeCount = cache.projects.length;
    var docCount = cache.documents.length;

    // Find CRAFTED revenue from KPIs
    var revenueStr = "—";
    var revenuePeriod = "";
    var crafted = cache.projects.find(function (p) { return getProjectSlug(p) === "crafted"; });
    if (crafted) {
      // Look for a revenue-related KPI for February or the most recent period
      var revenueKpis = cache.financeKpis.filter(function (k) {
        return k.project_id === crafted.id &&
          (k.kpi_name || "").toLowerCase().indexOf("revenue") !== -1;
      });
      // Try to find the latest labeled one
      if (revenueKpis.length > 0) {
        var rk = revenueKpis[revenueKpis.length - 1];
        revenueStr = rk.kpi_value || "—";
        revenuePeriod = rk.period_label ? " (" + rk.period_label + ")" : "";
      } else {
        // Fallback: look for gross sales
        var salesKpis = cache.financeKpis.filter(function (k) {
          return k.project_id === crafted.id &&
            (k.kpi_name || "").toLowerCase().indexOf("gross sales") !== -1;
        });
        if (salesKpis.length > 0) {
          revenueStr = salesKpis[salesKpis.length - 1].kpi_value || "—";
        }
      }
    }

    container.innerHTML =
      '<div class="stat-card"><span class="stat-label">Active Projects</span><span class="stat-value">' + activeCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Documents</span><span class="stat-value">' + docCount + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">CRAFTED Revenue' + esc(revenuePeriod) + '</span><span class="stat-value tabnum">' + esc(revenueStr) + '</span></div>' +
      '<div class="stat-card"><span class="stat-label">Daily Check</span><span class="stat-value">11 PM</span></div>';
  }

  function renderRecentDocs() {
    var container = document.getElementById("recentDocsList");
    // Sort docs: new ones first, then by id descending
    var docs = cache.documents.slice().sort(function (a, b) {
      if (a.is_new && !b.is_new) return -1;
      if (!a.is_new && b.is_new) return 1;
      return (b.id || 0) - (a.id || 0);
    }).slice(0, 6);

    if (docs.length === 0) {
      container.innerHTML = '<div class="empty-state">No documents yet.</div>';
      return;
    }

    var html = "";
    docs.forEach(function (doc) {
      var proj = getProjectById(doc.project_id);
      var color = proj ? getProjectColor(proj) : "#5ba0d9";
      var isClickable = doc.storage_path && (doc.file_type === "pdf" || doc.file_type === "PDF");
      html += '<div class="doc-item' + (isClickable ? ' clickable' : '') + '"' +
        (isClickable ? ' onclick="openDocPreview(' + doc.id + ')"' : '') + '>';
      html += getDocFileIcon(doc, color);
      html += '<div class="doc-info">';
      html += '<span class="doc-name">' + esc(doc.name) + '</span>';
      var meta = formatDocMeta(doc);
      if (doc.source) meta += " — " + formatSource(doc.source);
      html += '<span class="doc-meta">' + meta + '</span>';
      html += '</div>';
      if (doc.is_new) {
        html += '<span class="doc-badge">NEW</span>';
      }
      html += '</div>';
    });
    container.innerHTML = html;
  }

  /* =========================================
     RENDER: ALL DOCUMENTS VIEW
     ========================================= */
  function renderAllDocumentsView() {
    var container = document.getElementById("allDocsList");
    if (cache.documents.length === 0) {
      container.innerHTML = '<div class="empty-state">No documents found.</div>';
      return;
    }

    var docs = cache.documents.slice().sort(function (a, b) {
      if (a.is_new && !b.is_new) return -1;
      if (!a.is_new && b.is_new) return 1;
      return (b.id || 0) - (a.id || 0);
    });

    var html = "";
    docs.forEach(function (doc) {
      var proj = getProjectById(doc.project_id);
      var color = proj ? getProjectColor(proj) : "#5ba0d9";
      var projName = proj ? proj.name : "";
      var isClickable = doc.storage_path && (doc.file_type === "pdf" || doc.file_type === "PDF");

      html += '<div class="doc-item' + (isClickable ? ' clickable' : '') + '"' +
        (isClickable ? ' onclick="openDocPreview(' + doc.id + ')"' : '') + '>';
      html += getDocFileIcon(doc, color);
      html += '<div class="doc-info">';
      html += '<span class="doc-name">' + esc(doc.name) + '</span>';
      var meta = projName ? projName + " — " : "";
      meta += formatDocMeta(doc);
      if (doc.source) meta += " — " + formatSource(doc.source);
      html += '<span class="doc-meta">' + meta + '</span>';
      html += '</div>';
      if (doc.is_new) {
        html += '<span class="doc-badge">NEW</span>';
      }
      html += '</div>';
    });
    container.innerHTML = html;
  }

  /* =========================================
     RENDER: DYNAMIC PROJECT VIEWS
     ========================================= */
  function renderProjectViews() {
    var container = document.getElementById("dynamicProjectViews");
    var html = "";
    cache.projects.forEach(function (p) {
      var slug = getProjectSlug(p);
      if (slug === "crafted") {
        html += renderCraftedView(p);
      } else if (slug === "ascend") {
        html += renderAscendView(p);
      } else {
        html += renderGenericProjectView(p);
      }
    });
    container.innerHTML = html;
  }

  function renderGenericProjectView(project) {
    var slug = getProjectSlug(project);
    var color = getProjectColor(project);
    var statusClass = getStatusBadgeClass(project.status);
    var statusLabel = getStatusLabel(project.status);

    var projectTasks = cache.tasks.filter(function (t) { return t.project_id === project.id; });
    var projectDocs = cache.documents.filter(function (d) { return d.project_id === project.id; });

    var hasTasks = projectTasks.length > 0;
    var hasDocs = projectDocs.length > 0;
    var hasContent = hasTasks || hasDocs;

    var html = '<div class="view" id="view-' + slug + '">';
    html += '<button class="back-btn" onclick="showView(\'home\')">&larr; Back</button>';

    // Header
    html += '<div class="project-header">';
    html += '<div class="project-logo" style="background:' + color + ';color:#fff;font-weight:700;font-size:1.5rem;">' + esc(project.logo_letter || project.name.charAt(0)) + '</div>';
    html += '<div>';
    html += '<h1 class="project-name">' + esc(project.name) + '</h1>';
    html += '<p class="project-tagline">' + esc(project.tagline || "") + '</p>';
    html += '</div>';
    html += '<span class="status-badge ' + statusClass + '">' + esc(statusLabel) + '</span>';
    html += '</div>';

    // Info tiles
    html += '<div class="project-info-grid">';
    if (project.website) {
      var displayUrl = project.website.replace(/^https?:\/\//, "");
      html += '<div class="info-tile"><span class="info-label">Website</span><a href="' + esc(project.website) + '" target="_blank" rel="noopener noreferrer" class="info-value link">' + esc(displayUrl) + '</a></div>';
    }
    if (project.location) {
      html += '<div class="info-tile"><span class="info-label">Location</span><span class="info-value">' + esc(project.location) + '</span></div>';
    }
    html += '<div class="info-tile"><span class="info-label">Status</span><span class="info-value">' + esc(statusLabel) + '</span></div>';
    html += '</div>';

    if (hasContent) {
      // Tabs
      var defaultTab = hasTasks ? "tasks" : "docs";
      html += '<div class="project-tabs">';
      if (hasTasks) html += '<button class="ptab' + (defaultTab === "tasks" ? " active" : "") + '" onclick="showProjectTab(this,\'' + slug + '-tasks\')">' + "Tasks" + '</button>';
      if (hasDocs) html += '<button class="ptab' + (defaultTab === "docs" && !hasTasks ? " active" : "") + '" onclick="showProjectTab(this,\'' + slug + '-docs\')">' + "Documents" + '</button>';
      html += '</div>';

      // Tasks content
      if (hasTasks) {
        html += '<div class="ptab-content' + (defaultTab === "tasks" ? " active" : "") + '" id="' + slug + '-tasks">';
        projectTasks.forEach(function (t) {
          var done = t.status === "completed";
          html += '<div class="task-item' + (done ? " done" : "") + '">';
          if (done) {
            html += '<span class="task-check">&#10003;</span>';
          } else {
            html += '<span class="task-check-empty"></span>';
          }
          html += ' ' + esc(t.title);
          if (t.is_ai_generated) {
            html += ' <span class="task-ai">AI</span>';
          }
          html += '</div>';
        });
        html += '</div>';
      }

      // Docs content
      if (hasDocs) {
        html += '<div class="ptab-content' + (!hasTasks ? " active" : "") + '" id="' + slug + '-docs">';
        projectDocs.forEach(function (doc) {
          var isClickable = doc.storage_path && (doc.file_type === "pdf" || doc.file_type === "PDF");
          html += '<div class="doc-item' + (isClickable ? ' clickable' : '') + '"' +
            (isClickable ? ' onclick="openDocPreview(' + doc.id + ')"' : '') + '>';
          html += getDocFileIcon(doc, color);
          html += '<div class="doc-info"><span class="doc-name">' + esc(doc.name) + '</span>';
          var meta = formatDocMeta(doc);
          html += '<span class="doc-meta">' + meta + '</span></div></div>';
        });
        html += '</div>';
      }
    } else {
      html += '<div class="empty-state">More details coming soon as the project progresses.</div>';
    }

    html += '</div>';
    return html;
  }

  /* =========================================
     RENDER: ASCEND VIEW (property tabs)
     ========================================= */
  function renderAscendView(project) {
    var color = getProjectColor(project);
    var props = cache.properties.filter(function (p) { return p.project_id === project.id; });
    var mgmt = cache.managementEntities.filter(function (m) { return m.project_id === project.id; });
    var projectDocs = cache.documents.filter(function (d) { return d.project_id === project.id; });
    var projectTasks = cache.tasks.filter(function (t) { return t.project_id === project.id; });
    var records = cache.financeRecords.filter(function (r) { return r.project_id === project.id; });

    var activeProps = props.filter(function (p) { return p.status === "active"; });
    var constructionProps = props.filter(function (p) { return p.status === "under_construction"; });

    var html = '<div class="view" id="view-ascend">';
    html += '<button class="back-btn" onclick="showView(\'home\')">&larr; Back</button>';

    // Header with Ascend mountain logo
    html += '<div class="project-header ascend-header">';
    html += '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-label="Ascend Estate">';
    html += '<rect x="2" y="2" width="40" height="40" rx="8" stroke="#6B8E6B" stroke-width="2" fill="none"/>';
    html += '<path d="M12 32L22 14L32 32" stroke="#6B8E6B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    html += '<path d="M17 32L22 24L27 32" stroke="#6B8E6B" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>';
    html += '<circle cx="30" cy="16" r="2" fill="#6B8E6B" opacity="0.4"/>';
    html += '</svg>';
    html += '<div>';
    html += '<h1 class="project-name">' + esc(project.name) + '</h1>';
    html += '<p class="project-tagline">' + esc(project.tagline || "Real estate agency — Bali, Indonesia") + '</p>';
    html += '</div>';
    html += '<span class="status-badge status-active">' + esc(getStatusLabel(project.status)) + '</span>';
    html += '</div>';

    // Info tiles
    html += '<div class="project-info-grid">';
    html += '<div class="info-tile"><span class="info-label">Location</span><span class="info-value">' + esc(project.location || "Bali, Indonesia") + '</span></div>';
    html += '<div class="info-tile"><span class="info-label">Active Properties</span><span class="info-value">' + activeProps.length + '</span></div>';
    html += '<div class="info-tile"><span class="info-label">Under Construction</span><span class="info-value">' + constructionProps.length + '</span></div>';
    if (project.website) {
      html += '<div class="info-tile"><span class="info-label">Instagram</span><a href="' + esc(project.website) + '" target="_blank" rel="noopener noreferrer" class="info-value link">@ascendtobali</a></div>';
    }
    html += '</div>';

    // Management entities bar
    if (mgmt.length > 0) {
      html += '<div class="ascend-mgmt-bar">';
      mgmt.forEach(function (m) {
        html += '<div class="ascend-mgmt-entity">';
        html += '<span class="ascend-mgmt-name">' + esc(m.name) + '</span>';
        if (m.contact_person && m.contact_person !== "TBD") {
          html += '<span class="ascend-mgmt-contact">Manager: ' + esc(m.contact_person) + '</span>';
        }
        if (m.properties && m.properties.length > 0) {
          html += '<span class="ascend-mgmt-props">' + m.properties.map(esc).join(", ") + '</span>';
        }
        html += '</div>';
      });
      html += '</div>';
    }

    // Tabs: one per property + Documents + Petty Cash
    var allTabs = [];
    props.forEach(function (p) { allTabs.push({ id: "prop-" + p.slug, label: p.name, type: "property" }); });
    allTabs.push({ id: "ascend-pettycash", label: "Petty Cash", type: "petty" });
    if (projectDocs.length > 0) allTabs.push({ id: "ascend-docs", label: "Documents", type: "docs" });
    if (projectTasks.length > 0) allTabs.push({ id: "ascend-tasks", label: "Tasks", type: "tasks" });

    html += '<div class="project-tabs ascend-tabs">';
    allTabs.forEach(function (tab, i) {
      html += '<button class="ptab' + (i === 0 ? ' active' : '') + '" onclick="showProjectTab(this,\'' + tab.id + '\')">' + esc(tab.label) + '</button>';
    });
    html += '</div>';

    // Property tab contents
    props.forEach(function (p, i) {
      html += '<div class="ptab-content' + (i === 0 ? ' active' : '') + '" id="prop-' + p.slug + '">';
      html += renderPropertyCard(p);
      html += '</div>';
    });

    // Petty Cash tab
    html += '<div class="ptab-content" id="ascend-pettycash">';
    if (records.length > 0) {
      html += '<div class="crafted-section-card">';
      html += '<div class="crafted-section-header">';
      html += '<h3>Be Bali Group — Petty Cash</h3>';
      html += '<span class="crafted-section-note">Panamera & Golden Hour</span>';
      html += '</div>';

      // Summary
      var openBal = 0; var totalOut = 0;
      records.forEach(function (r) {
        var amt = parseFloat(r.amount) || 0;
        if (amt > 0) openBal += amt; else totalOut += Math.abs(amt);
      });
      html += '<div class="ascend-petty-summary">';
      html += '<div class="ascend-petty-stat"><span class="ascend-petty-label">OPENING BALANCE</span><span class="ascend-petty-val tabnum">' + formatAmount(openBal) + '</span></div>';
      html += '<div class="ascend-petty-stat"><span class="ascend-petty-label">TOTAL SPENT</span><span class="ascend-petty-val tabnum ct-out">' + formatAmount(-totalOut) + '</span></div>';
      html += '<div class="ascend-petty-stat"><span class="ascend-petty-label">REMAINING</span><span class="ascend-petty-val tabnum">' + formatAmount(openBal - totalOut) + '</span></div>';
      html += '</div>';

      html += '<div class="crafted-table-wrap">';
      html += '<table class="crafted-table">';
      html += '<thead><tr><th>Date</th><th>Description</th><th class="text-right">Amount</th><th>Category</th></tr></thead>';
      html += '<tbody>';
      records.forEach(function (r) {
        html += '<tr>';
        html += '<td class="tabnum">' + formatDateShort(r.record_date) + '</td>';
        html += '<td>' + esc(r.description || "") + '</td>';
        html += '<td class="tabnum text-right' + (parseFloat(r.amount) < 0 ? ' ct-out' : '') + '">' + formatAmount(r.amount) + '</td>';
        html += '<td>' + esc(r.category || "") + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '</div></div>';
    } else {
      html += '<div class="empty-state">No petty cash records yet.</div>';
    }
    html += '</div>';

    // Documents tab
    if (projectDocs.length > 0) {
      html += '<div class="ptab-content" id="ascend-docs">';
      projectDocs.forEach(function (doc) {
        var isExternal = doc.storage_path && doc.storage_path.indexOf("docs.google.com") !== -1;
        var isClickable = isExternal || (doc.storage_path && (doc.file_type === "pdf" || doc.file_type === "PDF"));
        html += '<div class="doc-item' + (isClickable ? ' clickable' : '') + '"';
        if (isExternal) {
          html += ' onclick="window.open(\'' + esc(doc.storage_path) + '\', \'_blank\')"';
        } else if (isClickable) {
          html += ' onclick="openDocPreview(' + doc.id + ')"';
        }
        html += '>';
        html += getDocFileIcon(doc, color);
        html += '<div class="doc-info"><span class="doc-name">' + esc(doc.name) + '</span>';
        var meta = formatDocMeta(doc);
        if (doc.source) meta += " \u2014 " + formatSource(doc.source);
        html += '<span class="doc-meta">' + meta + '</span></div>';
        if (doc.is_new) html += '<span class="doc-badge">NEW</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Tasks tab
    if (projectTasks.length > 0) {
      html += '<div class="ptab-content" id="ascend-tasks">';
      projectTasks.forEach(function (t) {
        var done = t.status === "completed";
        html += '<div class="task-item' + (done ? " done" : "") + '">';
        html += done ? '<span class="task-check">&#10003;</span>' : '<span class="task-check-empty"></span>';
        html += ' ' + esc(t.title);
        if (t.is_ai_generated) html += ' <span class="task-ai">AI</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderPropertyCard(prop) {
    var statusLabel = prop.status === "under_construction" ? "Under Construction" : "Active";
    var statusClass = prop.status === "under_construction" ? "status-dev" : "status-active";

    var html = '<div class="ascend-prop-card">';
    html += '<div class="ascend-prop-header">';
    html += '<div>';
    html += '<h3 class="ascend-prop-name">' + esc(prop.name) + '</h3>';
    html += '<span class="ascend-prop-type">' + esc((prop.property_type || "villa").charAt(0).toUpperCase() + (prop.property_type || "villa").slice(1)) + '</span>';
    html += '</div>';
    html += '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>';
    html += '</div>';

    html += '<div class="ascend-prop-details">';
    if (prop.location) {
      html += '<div class="ascend-prop-detail"><span class="ascend-prop-label">Location</span><span>' + esc(prop.location) + '</span></div>';
    }
    if (prop.area) {
      html += '<div class="ascend-prop-detail"><span class="ascend-prop-label">Area</span><span>' + esc(prop.area) + '</span></div>';
    }
    if (prop.bedrooms) {
      html += '<div class="ascend-prop-detail"><span class="ascend-prop-label">Bedrooms</span><span>' + prop.bedrooms + '</span></div>';
    }
    if (prop.managed_by) {
      html += '<div class="ascend-prop-detail"><span class="ascend-prop-label">Managed By</span><span>' + esc(prop.managed_by);
      if (prop.manager_name) html += ' (' + esc(prop.manager_name) + ')';
      html += '</span></div>';
    }
    html += '</div>';

    if (prop.description) {
      html += '<p class="ascend-prop-desc">' + esc(prop.description) + '</p>';
    }

    // Action links
    html += '<div class="ascend-prop-actions">';
    if (prop.maps_url) {
      html += '<a href="' + esc(prop.maps_url) + '" target="_blank" rel="noopener noreferrer" class="ascend-prop-link">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
      html += ' Google Maps</a>';
    }
    if (prop.booking_url) {
      html += '<a href="' + esc(prop.booking_url) + '" target="_blank" rel="noopener noreferrer" class="ascend-prop-link">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
      html += ' Booking</a>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  }

  /* =========================================
     RENDER: CRAFTED VIEW (full dashboard)
     ========================================= */
  function renderCraftedView(project) {
    var slug = "crafted";
    var color = getProjectColor(project);
    var projectTasks = cache.tasks.filter(function (t) { return t.project_id === project.id; });
    var projectDocs = cache.documents.filter(function (d) { return d.project_id === project.id; });
    var kpis = cache.financeKpis.filter(function (k) { return k.project_id === project.id; });
    var records = cache.financeRecords.filter(function (r) { return r.project_id === project.id; });

    // Separate current vs. previous period KPIs
    var currentKpis = [];
    var prevKpis = [];
    kpis.forEach(function (k) {
      var label = (k.period_label || "").toLowerCase();
      if (label.indexOf("previous") !== -1 || label.indexOf("feb") !== -1 || label.indexOf("january") !== -1) {
        prevKpis.push(k);
      } else {
        currentKpis.push(k);
      }
    });

    var html = '<div class="view" id="view-crafted">';
    html += '<button class="back-btn" onclick="showView(\'home\')">&larr; Back</button>';

    // CRAFTED Header
    html += '<div class="project-header crafted-header">';
    html += '<svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="CRAFTED logo">';
    html += '<rect x="2" y="2" width="36" height="36" rx="6" stroke="#2C1810" stroke-width="2.5" fill="none"/>';
    html += '<path d="M20 10 L20 22" stroke="#C46B3B" stroke-width="2.5" stroke-linecap="round"/>';
    html += '<circle cx="20" cy="26" r="2" fill="#C46B3B"/>';
    html += '<path d="M12 14 C12 10, 20 6, 28 14" stroke="#2C1810" stroke-width="2" stroke-linecap="round" fill="none"/>';
    html += '<path d="M10 18 L30 18" stroke="#2C1810" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>';
    html += '</svg>';
    html += '<div>';
    html += '<h1 class="project-name">' + esc(project.name) + '</h1>';
    html += '<p class="project-tagline">' + esc(project.tagline || "Café & Restaurant — Bali, Indonesia") + '</p>';
    html += '</div>';
    html += '<span class="status-badge status-active">' + esc(getStatusLabel(project.status)) + '</span>';
    html += '</div>';

    // Info grid
    html += '<div class="project-info-grid">';
    if (project.location) {
      html += '<div class="info-tile"><span class="info-label">Location</span><span class="info-value">' + esc(project.location) + '</span></div>';
    }
    html += '<div class="info-tile"><span class="info-label">Accounting Period</span><span class="info-value">21st – 20th monthly</span></div>';
    html += '<div class="info-tile"><span class="info-label">Daily Check</span><span class="info-value">11 PM WITA</span></div>';
    html += '</div>';

    // Tabs
    html += '<div class="project-tabs">';
    html += '<button class="ptab active" onclick="showProjectTab(this,\'crafted-dashboard\')">Dashboard</button>';
    html += '<button class="ptab" onclick="showProjectTab(this,\'crafted-docs\')">Documents</button>';
    html += '<button class="ptab" onclick="showProjectTab(this,\'crafted-tasks\')">Tasks</button>';
    html += '</div>';

    // ---- DASHBOARD TAB ----
    html += '<div class="ptab-content active" id="crafted-dashboard">';

    // Period bar
    html += '<div class="crafted-period-bar">';
    html += '<span>Current Period</span>';
    html += '<strong>21 Feb – 20 Mar 2026</strong>';
    html += '<span class="crafted-period-tag">March</span>';
    html += '</div>';

    // KPI Cards
    html += '<div class="crafted-kpi-grid">';
    if (currentKpis.length > 0) {
      currentKpis.forEach(function (k) {
        html += '<div class="crafted-kpi">';
        html += '<span class="crafted-kpi-label">' + esc(formatKpiName(k.kpi_name)) + '</span>';
        if (k.kpi_delta && k.delta_direction) {
          var dir = k.delta_direction === "down" ? "down" : "up";
          var arrow = dir === "down" ? "&#8595;" : "&#8593;";
          html += '<span class="crafted-kpi-delta ' + dir + '">' + arrow + ' ' + esc(k.kpi_delta) + '</span>';
        } else if (k.kpi_badge) {
          var badgeClass = (k.kpi_badge || "").toLowerCase().indexOf("latest") !== -1 ? " accent" : "";
          html += '<span class="crafted-kpi-badge' + badgeClass + '">' + esc(k.kpi_badge) + '</span>';
        }
        html += '<div class="crafted-kpi-value tabnum">' + esc(k.kpi_value || "—") + '</div>';
        if (k.kpi_subtitle) {
          html += '<span class="crafted-kpi-sub">' + esc(k.kpi_subtitle) + '</span>';
        }
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state" style="grid-column:1/-1">No KPI data available.</div>';
    }
    html += '</div>';

    // Previous Period section
    if (prevKpis.length > 0) {
      html += renderPrevPeriodSection(prevKpis);
    }

    // Recent Activity (finance records)
    if (records.length > 0) {
      html += '<div class="crafted-section-card">';
      html += '<div class="crafted-section-header">';
      html += '<h3>Recent Activity</h3>';
      var latestDate = records[0].record_date || "";
      html += '<span class="crafted-section-note">' + formatDateShort(latestDate) + '</span>';
      html += '</div>';
      html += '<div class="crafted-table-wrap">';
      html += '<table class="crafted-table">';
      html += '<thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="text-right">Amount</th><th>Category</th></tr></thead>';
      html += '<tbody>';
      records.slice(0, 15).forEach(function (r) {
        var typeClass = getRecordTypeClass(r.type);
        var typeLabel = formatRecordType(r.type);
        html += '<tr>';
        html += '<td class="tabnum">' + formatDateShort(r.record_date) + '</td>';
        html += '<td><span class="ct-badge ' + typeClass + '">' + esc(typeLabel) + '</span></td>';
        html += '<td>' + esc(r.description || "") + '</td>';
        html += '<td class="tabnum text-right ct-out">' + formatAmount(r.amount) + '</td>';
        html += '<td>' + esc(r.category || "") + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '</div></div>';
    }

    // Accounting note
    html += '<div class="crafted-acct-note">';
    html += '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 5.5v0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    html += '<span>Accounting periods run 21st → 20th. Data updated nightly at 11 PM WITA via J.A.R.V.I.S.</span>';
    html += '</div>';

    html += '</div>'; // end dashboard tab

    // ---- DOCUMENTS TAB ----
    html += '<div class="ptab-content" id="crafted-docs">';
    if (projectDocs.length > 0) {
      projectDocs.forEach(function (doc) {
        var isClickable = doc.storage_path && (doc.file_type === "pdf" || doc.file_type === "PDF");
        html += '<div class="doc-item' + (isClickable ? ' clickable' : '') + '"' +
          (isClickable ? ' onclick="openDocPreview(' + doc.id + ')"' : '') + '>';
        html += getDocFileIcon(doc, color);
        html += '<div class="doc-info"><span class="doc-name">' + esc(doc.name) + '</span>';
        var meta = formatDocMeta(doc);
        if (doc.source) meta += " \u2014 " + formatSource(doc.source);
        html += '<span class="doc-meta">' + meta + '</span></div></div>';
      });
    } else {
      html += '<div class="empty-state">No documents yet.</div>';
    }
    html += '</div>';

    // ---- TASKS TAB ----
    html += '<div class="ptab-content" id="crafted-tasks">';
    if (projectTasks.length > 0) {
      projectTasks.forEach(function (t) {
        var done = t.status === "completed";
        html += '<div class="task-item' + (done ? " done" : "") + '">';
        if (done) {
          html += '<span class="task-check">&#10003;</span>';
        } else {
          html += '<span class="task-check-empty"></span>';
        }
        html += ' ' + esc(t.title);
        if (t.is_ai_generated) {
          html += ' <span class="task-ai">AI</span>';
        }
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state">No tasks yet.</div>';
    }
    html += '</div>';

    html += '</div>'; // end view
    return html;
  }

  function renderPrevPeriodSection(prevKpis) {
    // Try to extract structured data for the February performance card
    var revenueKpi = prevKpis.find(function (k) { return (k.kpi_name || "").toLowerCase().indexOf("revenue") !== -1; });
    var foodCostKpi = prevKpis.find(function (k) { var n = (k.kpi_name || "").toLowerCase(); return n.indexOf("food") !== -1 && n.indexOf("cost") !== -1; });
    var bevCostKpi = prevKpis.find(function (k) { var n = (k.kpi_name || "").toLowerCase(); return n.indexOf("bev") !== -1; });

    var html = '<div class="crafted-section-card">';
    html += '<div class="crafted-section-header">';
    html += '<h3>Previous Period — February</h3>';
    html += '<span class="crafted-section-note">21 Jan – 20 Feb 2026</span>';
    html += '</div>';

    if (revenueKpi) {
      html += '<div class="crafted-feb-grid">';
      html += '<div class="crafted-feb-revenue">';

      // Revenue progress
      var pctText = revenueKpi.kpi_delta || revenueKpi.kpi_badge || "";
      var pctNum = parseFloat(pctText.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
      html += '<div class="crafted-feb-row"><span>Revenue</span><span class="crafted-pct tabnum">' + esc(pctText || (pctNum + "%")) + '</span></div>';
      html += '<div class="crafted-feb-vals tabnum"><span>' + esc(revenueKpi.kpi_value || "—") + '</span>';
      if (revenueKpi.kpi_subtitle) {
        html += '<span class="muted">' + esc(revenueKpi.kpi_subtitle) + '</span>';
      }
      html += '</div>';
      html += '<div class="crafted-progress-track"><div class="crafted-progress-fill" style="width:' + (pctNum > 0 ? pctNum : 0) + '%"></div></div>';
      html += '</div>';

      // Cost columns
      if (foodCostKpi || bevCostKpi) {
        html += '<div class="crafted-feb-costs">';
        if (foodCostKpi) {
          html += '<div class="crafted-cost"><span class="crafted-cost-label">Food Cost</span><span class="crafted-cost-val tabnum">' + esc(foodCostKpi.kpi_value || "—") + '</span></div>';
        }
        if (foodCostKpi && bevCostKpi) {
          html += '<div class="crafted-cost-divider"></div>';
        }
        if (bevCostKpi) {
          html += '<div class="crafted-cost"><span class="crafted-cost-label">Bev. Cost</span><span class="crafted-cost-val tabnum">' + esc(bevCostKpi.kpi_value || "—") + '</span></div>';
        }
        html += '</div>';
      }

      html += '</div>';
    } else {
      // Fallback: render as generic KPI list
      prevKpis.forEach(function (k) {
        html += '<div style="margin-bottom:8px"><span class="crafted-kpi-label">' + esc((k.kpi_name || "").toUpperCase()) + '</span>';
        html += '<div class="crafted-kpi-value tabnum">' + esc(k.kpi_value || "—") + '</div>';
        if (k.kpi_subtitle) html += '<span class="crafted-kpi-sub">' + esc(k.kpi_subtitle) + '</span>';
        html += '</div>';
      });
    }

    // Info note
    html += '<div class="crafted-info-note">';
    html += '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 5.5v0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    html += 'March: tax + service now added on top of prices';
    html += '</div>';

    html += '</div>';
    return html;
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return "—";
    try {
      var d = new Date(dateStr);
      var day = String(d.getDate()).padStart(2, "0");
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return day + " " + months[d.getMonth()];
    } catch (e) {
      return dateStr;
    }
  }

  function formatAmount(amount) {
    if (amount == null) return "—";
    var num = parseFloat(amount);
    if (isNaN(num)) return String(amount);
    var prefix = num < 0 ? "-" : "";
    var abs = Math.abs(num);
    return prefix + "Rp " + abs.toLocaleString("id-ID");
  }

  /* =========================================
     DOCUMENT PREVIEW MODAL
     ========================================= */
  window.openDocPreview = async function (docId) {
    var doc = cache.documents.find(function (d) { return d.id === docId; });
    if (!doc || !doc.storage_path) return;

    docModalTitle.textContent = doc.name || "Document";
    docModalFrame.src = "";
    docModal.classList.remove("hidden");

    try {
      var result = await sb.storage.from("documents").createSignedUrl(doc.storage_path, 600);
      if (result.error) throw result.error;
      var url = result.data.signedUrl;
      docModalFrame.src = url;
    } catch (err) {
      console.error("Failed to get signed URL:", err);
      docModalFrame.srcdoc = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#888;">Failed to load document preview.</div>';
    }
  };

  docModalClose.addEventListener("click", function () {
    docModal.classList.add("hidden");
    docModalFrame.src = "";
  });

  docModal.addEventListener("click", function (e) {
    if (e.target === docModal) {
      docModal.classList.add("hidden");
      docModalFrame.src = "";
    }
  });

  /* =========================================
     CALENDAR SYSTEM
     ========================================= */
  var calState = { year: 2026, month: 2 }; // 0-indexed: 2 = March
  var calStateFull = { year: 2026, month: 2 };

  function initCalendar() {
    var now = new Date();
    calState.year = now.getFullYear();
    calState.month = now.getMonth();
    calStateFull.year = now.getFullYear();
    calStateFull.month = now.getMonth();

    // Mini calendar on home
    renderCalMonth("calDays", "calMonthLabel", calState);
    renderCalEvents("calEvents", false);

    // Full calendar page
    renderCalMonth("calDaysFull", "calMonthLabelFull", calStateFull);
    renderCalEvents("calEventsFull", true);

    // Nav buttons - home mini
    var prevBtn = document.getElementById("calPrev");
    var nextBtn = document.getElementById("calNext");
    if (prevBtn) prevBtn.onclick = function () {
      calState.month--;
      if (calState.month < 0) { calState.month = 11; calState.year--; }
      renderCalMonth("calDays", "calMonthLabel", calState);
    };
    if (nextBtn) nextBtn.onclick = function () {
      calState.month++;
      if (calState.month > 11) { calState.month = 0; calState.year++; }
      renderCalMonth("calDays", "calMonthLabel", calState);
    };

    // Nav buttons - full page
    var prevBtnF = document.getElementById("calPrevFull");
    var nextBtnF = document.getElementById("calNextFull");
    if (prevBtnF) prevBtnF.onclick = function () {
      calStateFull.month--;
      if (calStateFull.month < 0) { calStateFull.month = 11; calStateFull.year--; }
      renderCalMonth("calDaysFull", "calMonthLabelFull", calStateFull);
      renderCalEvents("calEventsFull", true);
    };
    if (nextBtnF) nextBtnF.onclick = function () {
      calStateFull.month++;
      if (calStateFull.month > 11) { calStateFull.month = 0; calStateFull.year++; }
      renderCalMonth("calDaysFull", "calMonthLabelFull", calStateFull);
      renderCalEvents("calEventsFull", true);
    };
  }

  function renderCalMonth(daysContainerId, labelId, state) {
    var label = document.getElementById(labelId);
    var container = document.getElementById(daysContainerId);
    if (!label || !container) return;

    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    label.textContent = months[state.month] + " " + state.year;

    var now = new Date();
    var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

    // Build set of days with events (in WITA timezone = UTC+8)
    var eventDays = {};
    cache.calendarEvents.forEach(function (ev) {
      var d = new Date(ev.start_time);
      // Convert to WITA (UTC+8)
      var wita = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      var key = wita.getUTCFullYear() + "-" + String(wita.getUTCMonth() + 1).padStart(2, "0") + "-" + String(wita.getUTCDate()).padStart(2, "0");
      eventDays[key] = true;
    });

    var firstDay = new Date(state.year, state.month, 1);
    var startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
    var daysInMonth = new Date(state.year, state.month + 1, 0).getDate();

    var html = "";
    // Empty slots for days before the 1st
    for (var i = 0; i < startDow; i++) {
      html += '<span class="cal-day empty"></span>';
    }
    for (var day = 1; day <= daysInMonth; day++) {
      var dateKey = state.year + "-" + String(state.month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var classes = "cal-day";
      if (dateKey === todayStr) classes += " today";
      if (eventDays[dateKey]) classes += " has-event";
      html += '<span class="' + classes + '">' + day + '</span>';
    }
    container.innerHTML = html;
  }

  function renderCalEvents(containerId, showAll) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var now = new Date();
    var events = cache.calendarEvents.slice();

    if (showAll) {
      // For full page, show events in selected month
      events = events.filter(function (ev) {
        var d = new Date(ev.start_time);
        var wita = new Date(d.getTime() + 8 * 60 * 60 * 1000);
        return wita.getUTCFullYear() === calStateFull.year && wita.getUTCMonth() === calStateFull.month;
      });
    } else {
      // For home widget, show only upcoming (from now)
      events = events.filter(function (ev) {
        return new Date(ev.start_time) >= now;
      }).slice(0, 5);
    }

    if (events.length === 0) {
      container.innerHTML = '<div class="cal-no-events">No upcoming events</div>';
      return;
    }

    var dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var mos = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    var html = "";
    events.forEach(function (ev) {
      var start = new Date(ev.start_time);
      // Convert to WITA for display
      var witaStart = new Date(start.getTime() + 8 * 60 * 60 * 1000);
      var dayNum = witaStart.getUTCDate();
      var monthStr = mos[witaStart.getUTCMonth()];
      var dowStr = dows[witaStart.getUTCDay()];

      var timeStr = "";
      if (!ev.is_all_day) {
        var h = witaStart.getUTCHours();
        var m = String(witaStart.getUTCMinutes()).padStart(2, "0");
        var ampm = h >= 12 ? "PM" : "AM";
        var h12 = h % 12 || 12;
        timeStr = h12 + ":" + m + " " + ampm;

        if (ev.end_time) {
          var end = new Date(ev.end_time);
          var witaEnd = new Date(end.getTime() + 8 * 60 * 60 * 1000);
          var eh = witaEnd.getUTCHours();
          var em = String(witaEnd.getUTCMinutes()).padStart(2, "0");
          var eampm = eh >= 12 ? "PM" : "AM";
          var eh12 = eh % 12 || 12;
          timeStr += " – " + eh12 + ":" + em + " " + eampm;
        }
        timeStr += " WITA";
      } else {
        timeStr = "All day";
      }

      html += '<div class="cal-event-card">';
      html += '<div class="cal-event-date">';
      html += '<span class="cal-event-day">' + dayNum + '</span>';
      html += '<span class="cal-event-month">' + monthStr + '</span>';
      html += '<span class="cal-event-dow">' + dowStr + '</span>';
      html += '</div>';
      html += '<div class="cal-event-info">';
      html += '<div class="cal-event-title">' + esc(ev.title) + '</div>';
      html += '<div class="cal-event-time">';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      html += timeStr + '</div>';
      if (ev.location) {
        html += '<div class="cal-event-loc">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';
        html += esc(ev.location) + '</div>';
      }
      html += '</div></div>';
    });
    container.innerHTML = html;
  }

  /* =========================================
     VIEW SWITCHING (existing logic preserved)
     ========================================= */
  window.showView = function (viewId) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    var target = document.getElementById("view-" + viewId);
    if (target) target.classList.add("active");

    // Update sidebar active state
    document.querySelectorAll(".nav-item").forEach(function (n) { n.classList.remove("active"); });
    var navBtn = document.querySelector('.nav-item[data-view="' + viewId + '"]');
    if (navBtn) navBtn.classList.add("active");

    // Close mobile sidebar
    var sidebarEl = document.getElementById("sidebar");
    var overlayEl = document.getElementById("sidebarOverlay");
    if (sidebarEl) sidebarEl.classList.remove("open");
    if (overlayEl) overlayEl.classList.remove("open");

    // Scroll to top
    var mainEl = document.getElementById("main");
    if (mainEl) mainEl.scrollTop = 0;
  };

  // Project tab switching
  window.showProjectTab = function (btn, tabId) {
    var tabsContainer = btn.parentElement;
    tabsContainer.querySelectorAll(".ptab").forEach(function (t) { t.classList.remove("active"); });
    btn.classList.add("active");

    var parent = tabsContainer.parentElement;
    parent.querySelectorAll(".ptab-content").forEach(function (c) { c.classList.remove("active"); });
    var content = document.getElementById(tabId);
    if (content) content.classList.add("active");
  };

  // Mobile sidebar toggle
  window.toggleSidebar = function () {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("open");
  };

  // Mobile bottom nav
  window.setActiveNav = function (btn) {
    document.querySelectorAll(".bnav-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  };

  /* =========================================
     INIT
     ========================================= */
  // Set current date
  var dateEl = document.getElementById("currentDate");
  if (dateEl) {
    var d = new Date();
    var opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    dateEl.textContent = d.toLocaleDateString("en-US", opts);
  }

  // Check session and initialize
  checkSession();
})();
