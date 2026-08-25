(() => {
  const form = document.querySelector("#contact-form");
  const status = document.querySelector("#contact-status");

  if (!form || !status) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const interest = String(data.get("interest") || "General inquiry").trim();
    const message = String(data.get("message") || "").trim();
    const recipient = ["mike", "socalnmotorsports.com"].join("@");
    const subject = `SoCal N Motorsports inquiry — ${interest}`;
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Interest: ${interest}`,
      "",
      message,
    ].join("\n");

    status.textContent = "Your email app is opening with the inquiry ready to send.";
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
})();
