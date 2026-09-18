// extension/content.js

/**
 * Try to extract Gmail email details from the DOM.
 * This is heuristic and may need adjustment if Gmail changes its layout.
 */
function extractEmailData() {
  // Subject: Gmail usually uses h2 with specific attributes
  const subjectNode =
    document.querySelector("h2.hP") ||
    document.querySelector("h2[data-thread-perm-id]");

  const subject = subjectNode ? subjectNode.innerText.trim() : "(No subject)";

  // Sender: span with class gD in Gmail
  const senderNode = document.querySelector("span.gD");
  const sender = senderNode ? senderNode.getAttribute("email") || senderNode.innerText.trim() : "(Unknown sender)";

  // Body: main email body div
  const bodyNode = document.querySelector("div.a3s.aiL") || document.querySelector("div[role='listitem'] div.a3s");
  const bodyText = bodyNode ? bodyNode.innerText.trim() : "";

  // Links in the body
  const links = [];
  if (bodyNode) {
    const anchors = bodyNode.querySelectorAll("a[href]");
    anchors.forEach((a) => {
      links.push({
        text: a.innerText.trim(),
        href: a.href
      });
    });
  }

  return {
    sender,
    subject,
    body: bodyText,
    links
  };
}

/**
 * Inject or update a banner at top of email with the analysis result.
 */
function renderBanner(result) {
  const existing = document.getElementById("phishguard-banner");
  if (existing) existing.remove();

  const container = document.querySelector("div.nH.aqK");
  if (!container) return;

  const banner = document.createElement("div");
  banner.id = "phishguard-banner";

  // Base layout
  banner.style.display = "flex";
  banner.style.alignItems = "center";
  banner.style.justifyContent = "space-between";
  banner.style.gap = "12px";
  banner.style.margin = "8px 0";
  banner.style.padding = "8px 12px";
  banner.style.borderRadius = "999px";
  banner.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  banner.style.fontSize = "12px";
  banner.style.border = "1px solid rgba(15,23,42,0.12)";
  banner.style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.18)";

  let bg = "rgba(22,163,74,0.08)";
  let accent = "#16a34a";
  let fg = "#111827";
  let label = "Safe";

  if (result && result.label === "phishing") {
    bg = "rgba(239,68,68,0.08)";
    accent = "#ef4444";
    fg = "#111827";
    label = "Phishing";
  } else if (result && result.label === "suspicious") {
    bg = "rgba(234,179,8,0.08)";
    accent = "#eab308";
    fg = "#111827";
    label = "Suspicious";
  }

  banner.style.backgroundColor = bg;
  banner.style.color = fg;

  // Left group: label + score
  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "8px";

  const dot = document.createElement("span");
  dot.style.display = "inline-block";
  dot.style.width = "10px";
  dot.style.height = "10px";
  dot.style.borderRadius = "999px";
  dot.style.backgroundColor = accent;

  const title = document.createElement("strong");
  title.textContent = `PhishGuard: ${label}`;
  title.style.fontSize = "12px";

  const scoreSpan = document.createElement("span");
  const score = result && typeof result.score === "number" ? result.score : 0;
  scoreSpan.textContent = `${Math.round(score * 100)}% risk`;
  scoreSpan.style.fontSize = "11px";
  scoreSpan.style.color = "#4b5563";

  left.appendChild(dot);
  left.appendChild(title);
  left.appendChild(scoreSpan);

  // Right group: top reason
  const right = document.createElement("div");
  right.style.fontSize = "11px";
  right.style.color = "#4b5563";
  right.style.textAlign = "right";

  const reasonSpan = document.createElement("span");
  if (result && result.reasons && result.reasons.length) {
    reasonSpan.textContent = result.reasons[0];
  } else {
    reasonSpan.textContent = "No strong signals detected.";
  }

  right.appendChild(reasonSpan);

  banner.appendChild(left);
  banner.appendChild(right);

  container.parentNode.insertBefore(banner, container.nextSibling);
}
/**
 * Analyze current email and show banner.
 */
function analyzeCurrentEmail() {
  const emailData = extractEmailData();

  // Skip when body is empty (e.g. inbox list view)
  if (!emailData.body || emailData.body.length < 20) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "ANALYZE_EMAIL",
      emailData
    },
    (response) => {
      if (!response || !response.ok) {
        console.warn("PhishGuard analysis failed:", response && response.error);
        return;
      }
      renderBanner(response.result);
    }
  );
}

/**
 * Use MutationObserver because Gmail is a SPA and does not always reload page.
 */
function setupObserver() {
  const target = document.body;

  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === "childList" && mut.addedNodes.length > 0) {
        // Heuristic: whenever message view container appears, try analyze
        const messageView = document.querySelector("div.if");
        if (messageView) {
          // Delay a bit to allow DOM to settle
          setTimeout(analyzeCurrentEmail, 1500);
          break;
        }
      }
    }
  });

  observer.observe(target, {
    childList: true,
    subtree: true
  });
}

// Initialize when script is loaded
setupObserver();
// Listen for popup-triggered rescan
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRIGGER_ANALYZE") {
    analyzeCurrentEmail();
    sendResponse({ ok: true });
  }
});