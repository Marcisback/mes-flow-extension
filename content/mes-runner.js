const MES_TARGET_PATH = "/inventory/manufacturing/reverse/triage";

let stopRequested = false;
let isRunning = false;

const BETWEEN_ASSET_DELAY_MS = 1500;
const AFTER_SKIP_DELAY_MS = 2500;
const STOP_CHECK_INTERVAL_MS = 100;
const THEME_STORAGE_KEY = "theme";
const MODE_LABELS = {
  EOL: "EOL",
  MRI: "MRI",
  REPAIR_CLEANUP: "Repair Cleanup (EOL HANDOVER)"
};

let overlay = null;
let selectedTheme = "auto";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function isTargetPage() {
  return (
    (window.location.hostname === "internalfb.com" ||
      window.location.hostname === "www.internalfb.com") &&
    window.location.pathname === MES_TARGET_PATH
  );
}

if (!isTargetPage()) {
  console.warn("MES Flow Assistant loaded on unsupported page");
} else {
  window.MESLogger.log("Content script ready on MES triage page");
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "MES_START") {
    stopRequested = false;
    runQueue(message.assets, message.mode || "EOL");
  }

  if (message.type === "MES_STOP") {
    stopRequested = true;
    window.MESStorage.setRunning(false);
    updateOverlayStatus("Stopping...");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[THEME_STORAGE_KEY]) return;

  applyOverlayTheme(changes[THEME_STORAGE_KEY].newValue || "auto");
});

systemTheme.addEventListener("change", () => {
  if (selectedTheme === "auto") {
    applyOverlayTheme("auto");
  }
});

async function runQueue(assets, mode) {
  const log = window.MESLogger.log;

  if (isRunning) {
    log("Already running");
    return;
  }

  if (!isTargetPage()) {
    log("Unsupported page. Navigate to MES triage page.");
    return;
  }

  isRunning = true;
  stopRequested = false;

  await window.MESStorage.setRunning(true);

  createOverlay();
  updateOverlay({
    status: "Running",
    mode: getModeLabel(mode),
    currentAsset: "Starting...",
    total: assets.length,
    done: 0,
    skipped: 0
  });

  log(`Started ${mode} queue with ${assets.length} assets`);

  for (const asset of assets) {
    if (stopRequested) break;

    const stateBefore = await window.MESStorage.getState();

    updateOverlay({
      status: "Running",
      mode: getModeLabel(mode),
      currentAsset: asset,
      total: assets.length,
      done: stateBefore.completed.length,
      skipped: stateBefore.skipped.length
    });

    try {
      log(`Processing: ${asset}`);

      if (mode === "EOL") {
        await window.MESEOL.processAsset(asset, () => stopRequested);
      } else if (mode === "MRI") {
        await window.MESMRI.processAsset(asset, () => stopRequested);
      } else if (mode === "REPAIR_CLEANUP") {
        await window.MESRepairCleanup.processAsset(asset, () => stopRequested);
      } else {
        throw new Error(`Unsupported mode: ${mode}`);
      }

      if (stopRequested) break;

      await window.MESStorage.markCompleted(asset);

      const stateAfterDone = await window.MESStorage.getState();

      updateOverlay({
        status: "Running",
        mode: getModeLabel(mode),
        currentAsset: asset,
        total: assets.length,
        done: stateAfterDone.completed.length,
        skipped: stateAfterDone.skipped.length
      });

      log(`Completed: ${asset}`);

      await sleep(BETWEEN_ASSET_DELAY_MS);
    } catch (error) {
      if (error?.name === "MESStopError") {
        break;
      }

      const reason = error?.message || "Unknown error";

      await window.MESStorage.markSkipped(asset, reason);

      const stateAfterSkip = await window.MESStorage.getState();

      updateOverlay({
        status: "Running",
        mode: getModeLabel(mode),
        currentAsset: asset,
        total: assets.length,
        done: stateAfterSkip.completed.length,
        skipped: stateAfterSkip.skipped.length
      });

      log(`Skipped: ${asset} - ${reason}`);

      await sleep(AFTER_SKIP_DELAY_MS);
    }
  }

  isRunning = false;
  await window.MESStorage.setRunning(false);

  const finalState = await window.MESStorage.getState();

  updateOverlay({
    status: stopRequested ? "Stopped" : "Finished",
    mode: getModeLabel(mode),
    currentAsset: stopRequested ? "Stopped by user" : "Complete",
    total: assets.length,
    done: finalState.completed.length,
    skipped: finalState.skipped.length
  });

  log("Queue stopped");

  chrome.runtime.sendMessage({
    type: "MES_BADGE_DONE"
  }).catch(() => {});
}

function getModeLabel(mode) {
  return MODE_LABELS[mode] || mode;
}

function createOverlay() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.id = "mes-flow-overlay";
  overlay.dataset.theme = resolveOverlayTheme(selectedTheme);

  overlay.innerHTML = `
    <div class="mfa-title-row">
      <strong>MES Flow</strong>
      <button id="mfa-close-btn">x</button>
    </div>

    <div class="mfa-row">
      <span>Status</span>
      <strong id="mfa-status">Idle</strong>
    </div>

    <div class="mfa-row">
      <span>Mode</span>
      <strong id="mfa-mode">EOL</strong>
    </div>

    <div class="mfa-current">
      <span>Current Asset</span>
      <strong id="mfa-current-asset">-</strong>
    </div>

    <div class="mfa-progress-bar">
      <div id="mfa-progress-fill"></div>
    </div>

    <div class="mfa-stats">
      <div>
        <strong id="mfa-done">0</strong>
        <span>Done</span>
      </div>
      <div>
        <strong id="mfa-skipped">0</strong>
        <span>Skipped</span>
      </div>
      <div>
        <strong id="mfa-total">0</strong>
        <span>Total</span>
      </div>
    </div>

    <button id="mfa-stop-btn">Stop</button>
  `;

  const style = document.createElement("style");
  style.id = "mes-flow-overlay-style";
  style.textContent = `
    #mes-flow-overlay {
      --mfa-overlay: #ffffff;
      --mfa-card: #ffffff;
      --mfa-track: #e5e7eb;
      --mfa-text: #111827;
      --mfa-muted: #475569;
      --mfa-border: #e2e8f0;
      --mfa-red: #ff1f2d;
      --mfa-red-hover: #e91825;
      --mfa-green: #20c63a;
      --mfa-yellow: #f4b400;
      --mfa-on-red: #ffffff;
      --mfa-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 312px;
      z-index: 999999;
      background: var(--mfa-overlay);
      color: var(--mfa-text);
      border: 1px solid var(--mfa-border);
      border-radius: 18px;
      box-shadow: var(--mfa-shadow);
      padding: 14px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.35;
    }

    #mes-flow-overlay[data-theme="dark"] {
      --mfa-overlay: #0b0f14;
      --mfa-card: #0f141b;
      --mfa-track: #1f2937;
      --mfa-text: #f8fafc;
      --mfa-muted: #cbd5e1;
      --mfa-border: #26313f;
      --mfa-shadow: 0 12px 30px rgba(0,0,0,0.34);
    }

    #mes-flow-overlay .mfa-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    #mes-flow-overlay .mfa-title-row strong {
      color: var(--mfa-text);
      font-size: 16px;
      font-weight: 800;
    }

    #mfa-close-btn {
      background: transparent;
      border: none;
      color: var(--mfa-muted);
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
      padding: 0;
    }

    #mes-flow-overlay .mfa-row {
      display: flex;
      justify-content: space-between;
      margin: 6px 0;
      color: var(--mfa-muted);
      font-size: 12px;
    }

    #mes-flow-overlay .mfa-row strong {
      color: var(--mfa-text);
      font-weight: 800;
    }

    #mfa-status {
      color: var(--mfa-green) !important;
      text-transform: uppercase;
    }

    #mes-flow-overlay .mfa-current {
      margin-top: 12px;
      background: var(--mfa-card);
      border: 1px solid var(--mfa-border);
      border-radius: 9px;
      padding: 10px 12px;
    }

    #mes-flow-overlay .mfa-current span {
      display: block;
      color: var(--mfa-muted);
      font-size: 10px;
      margin-bottom: 6px;
    }

    #mes-flow-overlay .mfa-current strong {
      display: block;
      color: var(--mfa-text);
      font-size: 16px;
      font-weight: 900;
      word-break: break-word;
    }

    #mes-flow-overlay .mfa-progress-bar {
      margin-top: 10px;
      height: 8px;
      background: var(--mfa-track);
      border-radius: 999px;
      overflow: hidden;
    }

    #mfa-progress-fill {
      height: 100%;
      width: 0%;
      background: var(--mfa-green);
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    #mes-flow-overlay .mfa-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    #mes-flow-overlay .mfa-stats div {
      text-align: center;
      background: var(--mfa-card);
      border: 1px solid var(--mfa-border);
      border-radius: 8px;
      padding: 8px 6px;
    }

    #mes-flow-overlay .mfa-stats strong {
      display: block;
      color: var(--mfa-text);
      font-size: 21px;
      font-weight: 900;
      line-height: 1;
    }

    #mfa-done {
      color: var(--mfa-green) !important;
    }

    #mfa-skipped {
      color: var(--mfa-yellow) !important;
    }

    #mes-flow-overlay .mfa-stats span {
      display: block;
      margin-top: 6px;
      color: var(--mfa-muted);
      font-size: 10px;
      font-weight: 800;
    }

    #mfa-stop-btn {
      width: 100%;
      min-height: 38px;
      margin-top: 12px;
      padding: 9px;
      border-radius: 8px;
      border: 1px solid var(--mfa-red);
      background: var(--mfa-red);
      color: var(--mfa-on-red);
      font-weight: 800;
      cursor: pointer;
    }

    #mfa-stop-btn:hover {
      background: var(--mfa-red-hover);
    }

    #mfa-stop-btn[hidden] {
      display: none;
    }
  `;

  document.documentElement.appendChild(style);
  document.body.appendChild(overlay);
  syncOverlayTheme();

  document.getElementById("mfa-stop-btn").addEventListener("click", async () => {
    stopRequested = true;
    await window.MESStorage.setRunning(false);
    updateOverlayStatus("Stopping...");
  });

  document.getElementById("mfa-close-btn").addEventListener("click", () => {
    overlay.style.display = "none";
  });
}

function resolveOverlayTheme(theme) {
  if (theme === "dark" || theme === "light") {
    return theme;
  }

  return systemTheme.matches ? "dark" : "light";
}

function applyOverlayTheme(theme) {
  selectedTheme = theme === "dark" || theme === "light" ? theme : "auto";

  if (overlay) {
    overlay.dataset.theme = resolveOverlayTheme(selectedTheme);
  }
}

async function syncOverlayTheme() {
  const data = await chrome.storage.local.get({
    [THEME_STORAGE_KEY]: "auto"
  });

  applyOverlayTheme(data[THEME_STORAGE_KEY]);
}

function updateOverlay({
  status,
  mode,
  currentAsset,
  total,
  done,
  skipped
}) {
  createOverlay();

  const processed = done + skipped;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  document.getElementById("mfa-status").textContent = status;
  document.getElementById("mfa-mode").textContent = mode;
  document.getElementById("mfa-current-asset").textContent = currentAsset;
  document.getElementById("mfa-total").textContent = total;
  document.getElementById("mfa-done").textContent = done;
  document.getElementById("mfa-skipped").textContent = skipped;
  document.getElementById("mfa-progress-fill").style.width = `${percent}%`;
  setOverlayStopVisibility(status);

  overlay.style.display = "block";
}

function updateOverlayStatus(status) {
  if (!overlay) return;

  const statusEl = document.getElementById("mfa-status");
  if (statusEl) statusEl.textContent = status;

  setOverlayStopVisibility(status);
}

function setOverlayStopVisibility(status) {
  const stopBtn = document.getElementById("mfa-stop-btn");
  if (!stopBtn) return;

  stopBtn.hidden = status !== "Running";
}

async function sleep(ms) {
  const start = Date.now();

  while (Date.now() - start < ms) {
    if (stopRequested) {
      throw new window.MESStopError();
    }

    const remaining = ms - (Date.now() - start);
    const delay = Math.min(STOP_CHECK_INTERVAL_MS, remaining);

    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
