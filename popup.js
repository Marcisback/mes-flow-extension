const TARGET_PATH = "/inventory/manufacturing/reverse/triage";

const assetsBox = document.getElementById("assetsBox");
const modeSelect = document.getElementById("modeSelect");
const clearBtn = document.getElementById("clearBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const pageStatus = document.getElementById("pageStatus");
const autosaveStatus = document.getElementById("autosaveStatus");
const totalCount = document.getElementById("totalCount");
const completedCount = document.getElementById("completedCount");
const skippedCount = document.getElementById("skippedCount");
const logBox = document.getElementById("logBox");

const totalCard = document.getElementById("totalCard");
const doneCard = document.getElementById("doneCard");
const skippedCard = document.getElementById("skippedCard");

let currentLogView = "total";
let autosaveTimer = null;
let isLoadingInitialState = true;

let lastState = {
  assets: [],
  completed: [],
  skipped: [],
  running: false,
  mode: "EOL",
  runtimeLog: ""
};

pageStatus.textContent = "Ready";

function isTargetPage(url) {
  try {
    const parsed = new URL(url);

    return (
      (parsed.hostname === "internalfb.com" ||
        parsed.hostname === "www.internalfb.com") &&
      parsed.pathname === TARGET_PATH
    );
  } catch {
    return false;
  }
}

function parseAssets(text) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x && !x.startsWith("#"))
    )
  ];
}

function formatSkipped(skipped) {
  return skipped
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      return `${item.asset} - ${item.reason || "Skipped"}`;
    })
    .join("\n");
}

function setAutosaveStatus(text) {
  autosaveStatus.textContent = text;
}

function scheduleAutosave() {
  if (isLoadingInitialState) return;

  setAutosaveStatus("Saving...");

  clearTimeout(autosaveTimer);

  autosaveTimer = setTimeout(async () => {
    const assets = parseAssets(assetsBox.value);

    await chrome.storage.local.set({
      assets,
      mode: modeSelect.value
    });

    lastState.assets = assets;
    lastState.mode = modeSelect.value;

    totalCount.textContent = assets.length;
    setAutosaveStatus("Autosaved");
  }, 500);
}

function setActiveCard(view) {
  currentLogView = view;

  totalCard.classList.toggle("active", view === "total");
  doneCard.classList.toggle("active", view === "done");
  skippedCard.classList.toggle("active", view === "skipped");

  renderLogBox();
}

function renderLogBox() {
  if (currentLogView === "total") {
    logBox.textContent =
      lastState.runtimeLog || "Runtime log will appear here.";
  }

  if (currentLogView === "done") {
    logBox.textContent =
      lastState.completed.length > 0
        ? lastState.completed.join("\n")
        : "No completed assets yet.";
  }

  if (currentLogView === "skipped") {
    logBox.textContent =
      lastState.skipped.length > 0
        ? formatSkipped(lastState.skipped)
        : "No skipped assets yet.";
  }

  logBox.scrollTop = logBox.scrollHeight;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0];
}

async function refreshState({ renderLogs = true, updateAssetBox = false } = {}) {
  const data = await chrome.storage.local.get({
    assets: [],
    completed: [],
    skipped: [],
    running: false,
    mode: "EOL",
    runtimeLog: ""
  });

  lastState = data;

  modeSelect.value = data.mode || "EOL";
  totalCount.textContent = data.assets.length;
  completedCount.textContent = data.completed.length;
  skippedCount.textContent = data.skipped.length;

  if (updateAssetBox) {
    assetsBox.value = data.assets.join("\n");
  }

  if (renderLogs) {
    renderLogBox();
  }
}

totalCard.addEventListener("click", () => setActiveCard("total"));
doneCard.addEventListener("click", () => setActiveCard("done"));
skippedCard.addEventListener("click", () => setActiveCard("skipped"));

assetsBox.addEventListener("input", scheduleAutosave);
modeSelect.addEventListener("change", scheduleAutosave);

clearBtn.addEventListener("click", async () => {
  assetsBox.value = "";

  await chrome.storage.local.set({
    assets: [],
    completed: [],
    skipped: [],
    running: false,
    runtimeLog: ""
  });

  await refreshState({ updateAssetBox: false });
  setAutosaveStatus("Autosaved");
});

startBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();

  if (!tab?.url || !isTargetPage(tab.url)) {
    pageStatus.textContent = "Unsupported page";

    await chrome.storage.local.set({
      runtimeLog: `[${new Date().toLocaleTimeString()}] Navigate to MES triage page first\n`
    });

    await refreshState();
    return;
  }

  const assets = parseAssets(assetsBox.value);

  if (!assets.length) {
    await chrome.storage.local.set({
      runtimeLog: `[${new Date().toLocaleTimeString()}] No assets provided\n`
    });

    await refreshState();
    return;
  }

  await chrome.storage.local.set({
    assets,
    completed: [],
    skipped: [],
    running: true,
    mode: modeSelect.value,
    runtimeLog: ""
  });

  lastState.assets = assets;
  lastState.completed = [];
  lastState.skipped = [];
  lastState.running = true;
  lastState.mode = modeSelect.value;
  lastState.runtimeLog = "";

  chrome.tabs.sendMessage(tab.id, {
    type: "MES_START",
    assets,
    mode: modeSelect.value
  });

  await refreshState({ renderLogs: true });
  pageStatus.textContent = "Running";
});

stopBtn.addEventListener("click", async () => {
  const tab = await getActiveTab();

  await chrome.storage.local.set({ running: false });

  chrome.tabs.sendMessage(tab.id, {
    type: "MES_STOP"
  });

  pageStatus.textContent = "Stopping";
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "MES_PROGRESS") {
    refreshState({ renderLogs: true });
  }
});

(async function init() {
  isLoadingInitialState = true;
  await refreshState({ updateAssetBox: true });
  isLoadingInitialState = false;
  setAutosaveStatus("Autosaved");
})();