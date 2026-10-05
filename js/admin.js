(function () {
  "use strict";

  const STATUS_LABELS = {
    attending: "Attending",
    maybe: "Maybe",
    not_attending: "Not Attending",
  };

  // The Edge Function holds the Supabase service_role key server-side and
  // never ships it to the browser. NOTE: this endpoint has no access
  // control (see supabase/functions/admin-rsvps/index.ts) — a deliberate,
  // explicit tradeoff for this event's short lifespan, not an oversight.
  const EDGE_FUNCTION_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/admin-rsvps`;
  const CHECKIN_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/checkin`;
  const SEND_PENDING_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/send-pending-confirmations`;

  /**
   * Data source for the dashboard. Calls the admin-rsvps Edge Function.
   */
  async function loadRsvps() {
    const response = await fetch(EDGE_FUNCTION_URL, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload.rsvps || [];
  }

  // ---------- DOM refs ----------
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const menuToggle = document.getElementById("menu-toggle");
  const navItems = document.querySelectorAll(".nav-item");

  const refreshBtn = document.getElementById("refresh-btn");
  const refreshBtnRsvps = document.getElementById("refresh-btn-rsvps");
  const adminErrorEl = document.getElementById("admin-error");

  const statTotalEl = document.getElementById("stat-total");
  const statAttendingEl = document.getElementById("stat-attending");
  const statMaybeEl = document.getElementById("stat-maybe");
  const statNotAttendingEl = document.getElementById("stat-not-attending");
  const statCheckedInEl = document.getElementById("stat-checked-in");

  const searchInput = document.getElementById("search-input");
  const statusFilter = document.getElementById("status-filter");
  const tableBody = document.getElementById("rsvp-table-body");
  const loadingStateEl = document.getElementById("loading-state");
  const emptyStateEl = document.getElementById("empty-state");
  const tableWrapperEl = document.querySelector(".table-wrapper");

  const exportCsvBtn = document.getElementById("export-csv-btn");
  const exportStatusEl = document.getElementById("export-status");
  const sendPendingBtn = document.getElementById("send-pending-btn");
  const sendPendingStatusEl = document.getElementById("send-pending-status");

  // ---------- State ----------
  let allRsvps = [];

  // ---------- Navigation ----------
  // All three sections live on one page now; nav items just scroll to them.
  function switchView(viewName) {
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    navItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.view === viewName);
    });
    closeSidebar();
  }

  function openSidebar() {
    sidebar.classList.add("is-open");
    sidebarBackdrop.classList.add("is-visible");
  }

  function closeSidebar() {
    sidebar.classList.remove("is-open");
    sidebarBackdrop.classList.remove("is-visible");
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });

  menuToggle.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
  });

  sidebarBackdrop.addEventListener("click", closeSidebar);

  // ---------- Data loading ----------
  function setLoading(isLoading) {
    refreshBtn.disabled = isLoading;
    refreshBtnRsvps.disabled = isLoading;
    loadingStateEl.hidden = !isLoading;
    tableWrapperEl.hidden = isLoading;
    if (isLoading) {
      emptyStateEl.hidden = true;
    }
  }

  function showError(message) {
    adminErrorEl.textContent = message;
    adminErrorEl.hidden = false;
  }

  function clearError() {
    adminErrorEl.hidden = true;
    adminErrorEl.textContent = "";
  }

  async function refreshData() {
    clearError();
    setLoading(true);
    try {
      allRsvps = await loadRsvps();
    } catch (err) {
      console.error("Failed to load RSVPs:", err);
      allRsvps = [];
      showError("Unable to load RSVP data right now. Please try refreshing.");
    } finally {
      setLoading(false);
    }
    renderAll();
  }

  // ---------- Filtering ----------
  function getFilteredRows() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;

    return allRsvps.filter((row) => {
      const matchesStatus = status === "all" || row.attendance_status === status;
      const matchesSearch =
        !term ||
        row.full_name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }

  // ---------- Rendering ----------
  function renderStats() {
    statTotalEl.textContent = allRsvps.length;
    statAttendingEl.textContent = allRsvps.filter((r) => r.attendance_status === "attending").length;
    statMaybeEl.textContent = allRsvps.filter((r) => r.attendance_status === "maybe").length;
    statNotAttendingEl.textContent = allRsvps.filter((r) => r.attendance_status === "not_attending").length;
    statCheckedInEl.textContent = allRsvps.filter((r) => r.checked_in).length;
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function buildCheckinCell(row) {
    if (row.checked_in) {
      const badge = document.createElement("span");
      badge.className = "checked-in-badge";
      badge.textContent = "✓ Checked In";
      return badge;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "table-btn";
    btn.textContent = "Check In";
    btn.addEventListener("click", () => checkInGuest(row, btn));
    return btn;
  }

  async function checkInGuest(row, btn) {
    btn.disabled = true;
    btn.textContent = "Checking in...";
    try {
      const response = await fetch(`${CHECKIN_URL}?id=${encodeURIComponent(row.id)}`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const payload = await response.json();
      row.checked_in = true;
      row.checked_in_at = payload.rsvp?.checked_in_at || new Date().toISOString();
      renderStats();
      renderTable();
    } catch (err) {
      console.error("Manual check-in failed:", err);
      btn.disabled = false;
      btn.textContent = "Check In";
      showError("Couldn't check in this guest. Please try again.");
    }
  }

  function renderTable() {
    const rows = getFilteredRows();
    tableBody.innerHTML = "";

    if (rows.length === 0) {
      emptyStateEl.hidden = false;
      tableWrapperEl.hidden = true;
      return;
    }

    emptyStateEl.hidden = true;
    tableWrapperEl.hidden = false;

    rows.forEach((row) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = row.full_name;

      const emailTd = document.createElement("td");
      emailTd.textContent = row.email;

      const statusTd = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge badge--${row.attendance_status}`;
      badge.textContent = STATUS_LABELS[row.attendance_status] || row.attendance_status;
      statusTd.appendChild(badge);

      const dateTd = document.createElement("td");
      dateTd.textContent = formatDate(row.created_at);

      const checkinTd = document.createElement("td");
      checkinTd.appendChild(buildCheckinCell(row));

      const actionsTd = document.createElement("td");
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "table-btn";
      copyBtn.textContent = "Copy email";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(row.email)
          .then(() => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyBtn.textContent = "Copy email";
            }, 1500);
          })
          .catch(() => {
            copyBtn.textContent = "Copy failed";
          });
      });
      actionsTd.appendChild(copyBtn);

      tr.append(nameTd, emailTd, statusTd, dateTd, checkinTd, actionsTd);
      tableBody.appendChild(tr);
    });
  }

  function renderAll() {
    renderStats();
    renderTable();
  }

  // ---------- Export ----------
  function csvEscape(value) {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCsv(rows) {
    const header = ["Full Name", "Email", "Attendance Status", "Submitted"];
    const lines = [header.join(",")];

    rows.forEach((row) => {
      lines.push(
        [
          csvEscape(row.full_name),
          csvEscape(row.email),
          csvEscape(STATUS_LABELS[row.attendance_status] || row.attendance_status),
          csvEscape(formatDate(row.created_at)),
        ].join(",")
      );
    });

    return lines.join("\r\n");
  }

  exportCsvBtn.addEventListener("click", () => {
    const rows = getFilteredRows();
    if (rows.length === 0) {
      exportStatusEl.textContent = "No RSVPs to export.";
      return;
    }

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "birthday-rsvps.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    exportStatusEl.textContent = `Exported ${rows.length} RSVP${rows.length === 1 ? "" : "s"} to birthday-rsvps.csv`;
  });

  // ---------- Send pending confirmations ----------
  sendPendingBtn.addEventListener("click", async () => {
    sendPendingBtn.disabled = true;
    sendPendingBtn.textContent = "Sending...";
    sendPendingStatusEl.textContent = "";

    try {
      const response = await fetch(SEND_PENDING_URL, { method: "POST" });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const payload = await response.json();
      sendPendingStatusEl.textContent =
        payload.total === 0
          ? "Everyone has already received their confirmation email."
          : `Sent ${payload.sent} of ${payload.total} pending confirmation email${payload.total === 1 ? "" : "s"}.` +
            (payload.failed > 0 ? ` ${payload.failed} failed — try again.` : "");
      await refreshData();
    } catch (err) {
      console.error("Send pending confirmations failed:", err);
      sendPendingStatusEl.textContent = "Something went wrong sending emails. Please try again.";
    } finally {
      sendPendingBtn.disabled = false;
      sendPendingBtn.textContent = "Send to Pending Guests";
    }
  });

  // ---------- Event wiring ----------
  refreshBtn.addEventListener("click", refreshData);
  refreshBtnRsvps.addEventListener("click", refreshData);
  searchInput.addEventListener("input", renderTable);
  statusFilter.addEventListener("change", renderTable);

  // ---------- Init ----------
  refreshData();
})();
