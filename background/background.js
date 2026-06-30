chrome.runtime.onInstalled.addListener(() => {
  console.log("MES Flow Assistant installed");
});

function clearBadge() {
  chrome.action.setBadgeText({ text: "" }).catch(() => {});
}

function showDoneBadge() {
  chrome.action.setBadgeText({ text: "✓" }).catch(() => {});
  chrome.action
    .setBadgeBackgroundColor({ color: "#22C55E" })
    .catch(() => {});

  setTimeout(clearBadge, 2000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "MES_BADGE_DONE") {
    showDoneBadge();
  }
});
