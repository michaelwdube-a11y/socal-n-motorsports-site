(() => {
  const measurementId = document.querySelector('meta[name="google-analytics-id"]')?.content?.trim();
  window.dataLayer = window.dataLayer || [];

  function gtag() {
    window.dataLayer.push(arguments);
  }

  window.socalTrack = (eventName, parameters = {}) => {
    if (measurementId) gtag("event", eventName, parameters);
  };

  document.addEventListener("click", (event) => {
    const tracked = event.target.closest("[data-track]");
    if (!tracked) return;
    window.socalTrack("select_content", {
      content_type: "call_to_action",
      item_id: tracked.dataset.track,
    });
  });

  if (!measurementId || !/^G-[A-Z0-9]+$/i.test(measurementId)) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
  gtag("js", new Date());
  gtag("config", measurementId, { anonymize_ip: true });
})();
