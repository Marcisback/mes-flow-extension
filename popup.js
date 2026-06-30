const TARGET_PATH = "/inventory/manufacturing/reverse/triage";
const THEME_STORAGE_KEY = "theme";
const THEME_OPTIONS = ["auto", "light", "dark"];
const BADGE_LOADING_COLOR = "#6B7280";
const BADGE_RUNNING_COLOR = "#22C55E";
const BADGE_STOPPING_COLOR = "#FBBF24";

const assetsBox = document.getElementById("assetsBox");
const modeSelect = document.getElementById("modeSelect");
const clearBtn = document.getElementById("clearBtn");
const actionBtn = document.getElementById("actionBtn");
const actionLabel = document.getElementById("actionLabel");
const pageStatus = document.getElementById("pageStatus");
const connectionStatus = document.getElementById("connectionStatus");
const autosaveStatus = document.getElementById("autosaveStatus");
const totalCount = document.getElementById("totalCount");
const completedCount = document.getElementById("completedCount");
const skippedCount = document.getElementById("skippedCount");
const logBox = document.getElementById("logBox");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

const totalCard = document.getElementById("totalCard");
const doneCard = document.getElementById("doneCard");
const skippedCard = document.getElementById("skippedCard");

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

let currentLogView = "total";
let autosaveTimer = null;
let isLoadingInitialState = true;
let selectedTheme = "auto";

let lastState = {
  assets: [],
  completed: [],
  skipped: [],
  running: false,
  mode: "EOL",
  runtimeLog: "",
  theme: "auto"
};

function setActionBadge(text, color) {
  chrome.action.setBadgeText({ text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

function clearActionBadge() {
  chrome.action.setBadgeText({ text: "" }).catch(() => {});
}

function showLoadingBadge() {
  setActionBadge("...", BADGE_LOADING_COLOR);
}

function showRunningBadge() {
  setActionBadge("RUN", BADGE_RUNNING_COLOR);
}

function showStoppingBadge() {
  setActionBadge("...", BADGE_STOPPING_COLOR);
}

showLoadingBadge();

function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") {
    return theme;
  }

  return systemTheme.matches ? "dark" : "light";
}

function renderTheme(theme) {
  selectedTheme = THEME_OPTIONS.includes(theme) ? theme : "auto";

  const resolved = resolveTheme(selectedTheme);
  const icon = {
    auto: "Auto",
    light: "Light",
    dark: "Dark"
  }[selectedTheme];
  const label = `Theme: ${selectedTheme[0].toUpperCase()}${selectedTheme.slice(1)}`;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeChoice = selectedTheme;
  themeIcon.textContent = icon;
  themeToggle.title = label;
  themeToggle.setAttribute("aria-label", label);
}

async function setTheme(theme) {
  renderTheme(theme);
  await chrome.storage.local.set({ [THEME_STORAGE_KEY]: selectedTheme });
}

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

function renderRunState() {
  const running = Boolean(lastState.running);

  pageStatus.textContent = running ? "Running" : "Ready";
  actionBtn.classList.toggle("start", !running);
  actionBtn.classList.toggle("stop", running);
  actionLabel.textContent = running ? "Stop" : "Start";
}

async function updateConnectionStatus() {
  const tab = await getActiveTab();
  const connected = Boolean(tab?.url && isTargetPage(tab.url));

  connectionStatus.textContent = connected ? "Connected" : "Disconnected";
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
    runtimeLog: "",
    [THEME_STORAGE_KEY]: "auto"
  });

  lastState = data;

  modeSelect.value = data.mode || "EOL";
  totalCount.textContent = data.assets.length;
  completedCount.textContent = data.completed.length;
  skippedCount.textContent = data.skipped.length;
  renderRunState();
  renderTheme(data[THEME_STORAGE_KEY]);

  if (updateAssetBox) {
    assetsBox.value = data.assets.join("\n");
  }

  if (renderLogs) {
    renderLogBox();
  }
}

async function startProcessing() {
  const tab = await getActiveTab();

  if (!tab?.url || !isTargetPage(tab.url)) {
    pageStatus.textContent = "Unsupported page";

    await chrome.storage.local.set({
      runtimeLog: `[${new Date().toLocaleTimeString()}] Navigate to MES triage page first\n`
    });

    await refreshState();
    await updateConnectionStatus();
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

  showRunningBadge();

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
}

async function stopProcessing() {
  showStoppingBadge();

  const tab = await getActiveTab();

  await chrome.storage.local.set({ running: false });

  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "MES_STOP"
    });
  }

  lastState.running = false;
  renderRunState();
  pageStatus.textContent = "Stopping";
}

totalCard.addEventListener("click", () => setActiveCard("total"));
doneCard.addEventListener("click", () => setActiveCard("done"));
skippedCard.addEventListener("click", () => setActiveCard("skipped"));

assetsBox.addEventListener("input", scheduleAutosave);
modeSelect.addEventListener("change", scheduleAutosave);

themeToggle.addEventListener("click", async () => {
  const currentIndex = THEME_OPTIONS.indexOf(selectedTheme);
  const nextTheme = THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length];

  await setTheme(nextTheme);
});

systemTheme.addEventListener("change", () => {
  if (selectedTheme === "auto") {
    renderTheme("auto");
  }
});

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

actionBtn.addEventListener("click", async () => {
  if (lastState.running) {
    await stopProcessing();
    return;
  }

  await startProcessing();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "MES_PROGRESS") {
    refreshState({ renderLogs: true });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[THEME_STORAGE_KEY]) return;

  renderTheme(changes[THEME_STORAGE_KEY].newValue || "auto");
});

(async function init() {
  isLoadingInitialState = true;
  await refreshState({ updateAssetBox: true });
  await updateConnectionStatus();
  isLoadingInitialState = false;
  setAutosaveStatus("Autosaved");

  if (lastState.running) {
    showRunningBadge();
  } else {
    clearActionBadge();
  }
})();
