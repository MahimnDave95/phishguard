// popup.js

function showResult(result) {
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const labelBadge = document.getElementById("label-badge");
  const scoreEl = document.getElementById("score");
  const senderEl = document.getElementById("sender");
  const subjectEl = document.getElementById("subject");
  const reasonsEl = document.getElementById("reasons");

  if (!result) {
    statusEl.textContent = "No analysis yet. Open an email in Gmail.";
    resultEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = "";
  resultEl.classList.remove("hidden");

  // Label + badge style
  const label = result.label || "safe";
  const prettyLabel = label.charAt(0).toUpperCase() + label.slice(1);
  labelBadge.textContent = prettyLabel;

  labelBadge.classList.remove("badge-safe", "badge-suspicious", "badge-phishing");
  if (label === "phishing") {
    labelBadge.classList.add("badge-phishing");
  } else if (label === "suspicious") {
    labelBadge.classList.add("badge-suspicious");
  } else {
    labelBadge.classList.add("badge-safe");
  }

  // Score
  const score = typeof result.score === "number" ? result.score : 0;
  scoreEl.textContent = `${Math.round(score * 100)}%`;

  // Sender / subject
  if (result.email && result.email.sender) {
    senderEl.textContent = result.email.sender;
  } else {
    senderEl.textContent = "Unknown sender";
  }

  if (result.email && result.email.subject) {
    subjectEl.textContent = result.email.subject;
  } else {
    subjectEl.textContent = "No subject";
  }

  // Reasons list
  reasonsEl.innerHTML = "";
  (result.reasons || []).forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    reasonsEl.appendChild(li);
  });
}

function loadLastAnalysis() {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Loading latest analysis…";

  let responded = false;

  chrome.runtime.sendMessage(
    { type: "GET_LAST_ANALYSIS" },
    (response) => {
      responded = true;

      if (!response || !response.ok) {
        statusEl.textContent = "No analysis found. Open an email in Gmail.";
        return;
      }

      showResult(response.result || null);
    }
  );

  // Fallback if no response in a few seconds
  setTimeout(() => {
    if (!responded) {
      statusEl.textContent = "Unable to load analysis (no response from extension).";
    }
  }, 3000);
}

function triggerRescan() {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Re-scanning current email…";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      statusEl.textContent = "No active tab. Open an email in Gmail.";
      return;
    }

    // Ask content script on active tab to analyze again
    chrome.tabs.sendMessage(
      tab.id,
      { type: "TRIGGER_ANALYZE" },
      () => {
        // After a short delay, reload lastAnalysis from service worker
        setTimeout(loadLastAnalysis, 1500);
      }
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Initial load
  loadLastAnalysis();

  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", triggerRescan);
  }
});