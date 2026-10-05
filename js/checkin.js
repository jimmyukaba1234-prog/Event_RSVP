(function () {
  "use strict";

  const STATUS_LABELS = {
    attending: "Attending",
    maybe: "Maybe Attending",
    not_attending: "Not Attending",
  };

  const CHECKIN_URL = `${window.SUPABASE_CONFIG.url}/functions/v1/checkin`;

  const loadingEl = document.getElementById("checkin-loading");
  const errorEl = document.getElementById("checkin-error");
  const foundEl = document.getElementById("checkin-found");
  const nameEl = document.getElementById("checkin-guest-name");
  const statusEl = document.getElementById("checkin-guest-status");
  const confirmBtn = document.getElementById("checkin-confirm-btn");
  const successEl = document.getElementById("checkin-success");

  function showOnly(visibleEl) {
    [loadingEl, errorEl, foundEl, successEl].forEach((el) => {
      el.hidden = el !== visibleEl;
    });
  }

  function showError(message) {
    errorEl.textContent = message;
    showOnly(errorEl);
  }

  function renderFound(rsvp) {
    nameEl.textContent = rsvp.full_name;
    statusEl.textContent = STATUS_LABELS[rsvp.attendance_status] || rsvp.attendance_status;
    statusEl.className = `badge badge--${rsvp.attendance_status}`;
    showOnly(foundEl);
  }

  function renderSuccess(rsvp, alreadyCheckedIn) {
    successEl.textContent = alreadyCheckedIn
      ? `${rsvp.full_name} was already checked in.`
      : `${rsvp.full_name} is checked in. Welcome!`;
    showOnly(successEl);
  }

  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    showError("This check-in link is invalid or incomplete.");
  } else {
    lookup();
  }

  async function lookup() {
    try {
      const response = await fetch(`${CHECKIN_URL}?id=${encodeURIComponent(id)}`);

      if (response.status === 404) {
        showError("We couldn't find this guest. Please look them up manually in the admin dashboard.");
        return;
      }
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const payload = await response.json();
      if (payload.rsvp.checked_in) {
        renderSuccess(payload.rsvp, true);
        return;
      }
      renderFound(payload.rsvp);
    } catch (err) {
      console.error("Check-in lookup failed:", err);
      showError("Something went wrong looking up this guest. Please try again.");
    }
  }

  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Checking in...";

    try {
      const response = await fetch(`${CHECKIN_URL}?id=${encodeURIComponent(id)}`, { method: "POST" });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const payload = await response.json();
      renderSuccess(payload.rsvp, Boolean(payload.alreadyCheckedIn));
    } catch (err) {
      console.error("Check-in failed:", err);
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm Check-In";
      showError("Something went wrong checking in this guest. Please try again.");
    }
  });
})();
