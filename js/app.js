(function () {
  "use strict";

  const SUBMIT_IDLE_TEXT = "Confirm RSVP";
  const SUBMIT_LOADING_TEXT = "Submitting...";
  const GENERIC_ERROR_TEXT =
    "Sorry, we couldn't submit your RSVP right now. Please try again.";
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const form = document.getElementById("rsvp-form");
  const formContainer = document.getElementById("rsvp-form-container");
  const successEl = document.getElementById("rsvp-success");
  const submitBtn = document.getElementById("submit-btn");
  const submitBtnText = submitBtn.querySelector(".submit-btn__text");
  const formErrorEl = document.getElementById("form-error");
  const attendanceErrorEl = document.getElementById("error-attendance_status");

  const fields = {
    full_name: {
      input: document.getElementById("full_name"),
      error: document.getElementById("error-full_name"),
    },
    email: {
      input: document.getElementById("email"),
      error: document.getElementById("error-email"),
    },
  };

  // Centralized config (js/config.js, gitignored) — never hardcode these values here.
  const supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  function clearErrors() {
    Object.values(fields).forEach(({ input, error }) => {
      input.classList.remove("is-invalid");
      error.textContent = "";
    });
    attendanceErrorEl.textContent = "";
    formErrorEl.hidden = true;
    formErrorEl.textContent = "";
  }

  function showFieldError(key, message) {
    if (key === "attendance_status") {
      attendanceErrorEl.textContent = message;
      return;
    }
    fields[key].input.classList.add("is-invalid");
    fields[key].error.textContent = message;
  }

  function validate(data) {
    const errors = {};

    if (!data.full_name) {
      errors.full_name = "Please enter your full name.";
    }

    if (!data.email) {
      errors.email = "Please enter your email address.";
    } else if (!EMAIL_REGEX.test(data.email)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!data.attendance_status) {
      errors.attendance_status = "Please let us know if you'll be attending.";
    }

    return errors;
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtnText.textContent = isLoading ? SUBMIT_LOADING_TEXT : SUBMIT_IDLE_TEXT;
  }

  function showSuccess() {
    formContainer.hidden = true;
    successEl.hidden = false;
    successEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showGenericError() {
    formErrorEl.textContent = GENERIC_ERROR_TEXT;
    formErrorEl.hidden = false;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearErrors();

    const formData = new FormData(form);
    const data = {
      full_name: (formData.get("full_name") || "").toString().trim(),
      email: (formData.get("email") || "").toString().trim(),
      attendance_status: (formData.get("attendance_status") || "").toString(),
    };

    const errors = validate(data);
    if (Object.keys(errors).length > 0) {
      Object.entries(errors).forEach(([key, message]) => showFieldError(key, message));
      const firstInvalidKey = Object.keys(errors).find((key) => fields[key]);
      if (firstInvalidKey) {
        fields[firstInvalidKey].input.focus();
      }
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabaseClient.from("rsvps").insert({
        full_name: data.full_name,
        email: data.email,
        attendance_status: data.attendance_status,
      });

      if (error) {
        throw error;
      }

      showSuccess();
    } catch (err) {
      console.error("RSVP submission failed:", err);
      showGenericError();
      setLoading(false);
    }
  });
})();
