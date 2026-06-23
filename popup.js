const TARGET_URL_PREFIX =
  "https://www.internalfb.com/inventory/manufacturing/reverse/triage";

const assetsBox = document.getElementById("assetsBox");
const modeSelect = document.getElementById("modeSelect");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const pageStatus = document.getElementById("pageStatus");
const totalCount = document.getElementById("totalCount");
const completedCount = document.getElementById("completedCount");
const skippedCount = document.getElementById("skippedCount");
const logBox = document.getElementById("logBox");

function parseAssets(text) {
  return [...new Set(
    text
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith("#"))
  )];
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  logBox.textContent += `[${time}] ${message}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshState() {
  const data = await chrome.storage.local.get({
    assets: [],
    completed: [],
    skipped: [],
    running: false,
    mode: "EOL"
  });

  assetsBox.value = data.assets.join("\n");
  modeSelect.value = data.mode || "EOL";
  totalCount.textContent = data.assets.length;
  completedCount.textContent = data.completed.length;
  skippedCount.textContent = data.skipped.length;
}

async function checkPage() {
  const tab = await getActiveTab();

  if (!tab?.url?.startsWith(TARGET_URL_PREFIX)) {
    pageStatus.textContent = "Unsupported page";
    startBtn.disabled = true;
    return;
  }

  pageStatus.textContent = "Ready on MES triage page";
  startBtn.disabled = false;
}

saveBtn.addEventListener("click", async () => {
  const assets = parseAssets(assetsBox.value);

  await chrome.storage.local.set({
    assets,
    mode: modeSelect.value,
    completed: [],
    skipped: [],
    running: false
  });

  await refreshState();
  log(`Saved ${assets.length} assets`);
});

clearBtn.addEventListener("click", async () => {
  assetsBox.value = "";

  await chrome.storage.local.set({
    assets: [],
    completed: [],
    skipped: [],
    running: false
  });

  await refreshState();
  log("Cleared assets");
});

startBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const assets = parseAssets(assetsBox.value);

  if (!assets.length) {
    log("No assets provided");
    return;
  }

  await chrome.storage.local.set({
    assets,
    completed: [],
    skipped: [],
    running: true,
    mode: modeSelect.value
  });

  chrome.tabs.sendMessage(tab.id, {
    type: "MES_START",
    assets,
    mode: modeSelect.value
  });

  await refreshState();
  log("Start sent to MES page");
});

stopBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();

  await chrome.storage.local.set({ running: false });

  chrome.tabs.sendMessage(tab.id, {
    type: "MES_STOP"
  });

  log("Stop sent");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "MES_PROGRESS") {
    refreshState();
    log(message.message);
  }
});

refreshState();
checkPage();