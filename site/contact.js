(() => {
  const form = document.querySelector("#contact-form");
  const status = document.querySelector("#contact-status");
  const button = form?.querySelector("button[type='submit']");

  if (!form || !status || !button) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    if (String(data.get("_honey") || "").trim()) return;

    const recipient = ["mike", "socalnmotorsports.com"].join("@");
    data.set("_subject", `SoCal N Motorsports inquiry — ${data.get("interest") || "Website"}`);
    data.set("_template", "table");
    data.set("_captcha", "true");

    button.disabled = true;
    button.textContent = "Sending…";
    status.textContent = "Sending your inquiry securely…";

    try {
      const response = await fetch(`https://formsubmit.co/ajax/${recipient}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });
      const result = await response.json();
      if (!response.ok || result.success === "false" || result.success === false) {
        throw new Error(result.message || "The form service could not accept the inquiry.");
      }

      form.reset();
      status.textContent = "Thank you. Your inquiry was sent to SoCal N Motorsports.";
      window.socalTrack?.("generate_lead", { interest: String(data.get("interest") || "unknown") });
    } catch (error) {
      status.textContent = "The inquiry could not be sent. Please try again in a moment.";
      console.error("Contact form submission failed", error);
    } finally {
      button.disabled = false;
      button.innerHTML = "Send my inquiry <span>↗</span>";
    }
  });
})();
