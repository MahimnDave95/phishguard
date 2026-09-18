// extension/service_worker.js

const BACKEND_URL = "http://127.0.0.1:8000/predict";

/**
 * Listen for messages from content script or popup.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_EMAIL") {
    analyzeEmail(message.emailData)
      .then((result) => {
        // Save latest result in storage so popup can read it
        chrome.storage.local.set({ lastAnalysis: result }, () => {
          sendResponse({ ok: true, result });
        });
      })
      .catch((err) => {
        console.error("Error analyzing email:", err);
        sendResponse({ ok: false, error: err.toString() });
      });

    // Keep the message channel open for async response
    return true;
  }

  if (message.type === "GET_LAST_ANALYSIS") {
    chrome.storage.local.get("lastAnalysis", ({ lastAnalysis }) => {
      sendResponse({ ok: true, result: lastAnalysis || null });
    });
    return true;
  }
});

/**
 * Call backend FastAPI to get phishing score.
 */
async function analyzeEmail(emailData) {
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(emailData)
  });

  if (!res.ok) {
    throw new Error(`Backend error: ${res.status}`);
  }

  const data = await res.json();
  return data;
}