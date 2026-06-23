const MES_TARGET_PATH = "/inventory/manufacturing/reverse/triage";

let stopRequested = false;
let isRunning = false;

const BETWEEN_ASSET_DELAY_MS = 1500;
const AFTER_SKIP_DELAY_MS = 2500;
const STOP_CHECK_INTERVAL_MS = 100;

let overlay = null;

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
    mode,
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
      mode,
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
      } else {
        throw new Error(`Unsupported mode: ${mode}`);
      }

      if (stopRequested) break;

      await window.MESStorage.markCompleted(asset);

      const stateAfterDone = await window.MESStorage.getState();

      updateOverlay({
        status: "Running",
        mode,
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
        mode,
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
    mode,
    currentAsset: stopRequested ? "Stopped by user" : "Complete",
    total: assets.length,
    done: finalState.completed.length,
    skipped: finalState.skipped.length
  });

  log("Queue stopped");
}

function createOverlay() {
  if (overlay) return;

  overlay = document.createElement("div");
  overlay.id = "mes-flow-overlay";

  overlay.innerHTML = `
    <div class="mfa-title-row">
      <strong>MES Flow Assistant</strong>
      <button id="mfa-close-btn">×</button>
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
      <strong id="mfa-current-asset">—</strong>
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
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 285px;
      z-index: 999999;
      background: rgba(15, 17, 21, 0.96);
      color: #f1f1f1;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      padding: 12px;
      font-family: Arial, sans-serif;
      font-size: 12px;
    }

    #mes-flow-overlay .mfa-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    #mes-flow-overlay .mfa-title-row strong {
      font-size: 14px;
    }

    #mfa-close-btn {
      background: transparent;
      border: none;
      color: #a8b3c4;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
    }

    #mes-flow-overlay .mfa-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
      color: #a8b3c4;
    }

    #mes-flow-overlay .mfa-row strong {
      color: #ffffff;
    }

    #mes-flow-overlay .mfa-current {
      margin-top: 10px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px;
    }

    #mes-flow-overlay .mfa-current span {
      display: block;
      color: #a8b3c4;
      font-size: 11px;
      margin-bottom: 3px;
    }

    #mes-flow-overlay .mfa-current strong {
      font-size: 15px;
      word-break: break-word;
    }

    #mes-flow-overlay .mfa-progress-bar {
      margin-top: 10px;
      height: 8px;
      background: rgba(255,255,255,0.10);
      border-radius: 999px;
      overflow: hidden;
    }

    #mfa-progress-fill {
      height: 100%;
      width: 0%;
      background: #2ea043;
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    #mes-flow-overlay .mfa-stats {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    #mes-flow-overlay .mfa-stats div {
      flex: 1;
      text-align: center;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px;
    }

    #mes-flow-overlay .mfa-stats strong {
      display: block;
      font-size: 15px;
    }

    #mes-flow-overlay .mfa-stats span {
      color: #a8b3c4;
      font-size: 10px;
    }

    #mfa-stop-btn {
      width: 100%;
      margin-top: 10px;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #f85149;
      background: rgba(248, 81, 73, 0.22);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }

    #mfa-stop-btn:hover {
      background: rgba(248, 81, 73, 0.34);
    }
  `;

  document.documentElement.appendChild(style);
  document.body.appendChild(overlay);

  document.getElementById("mfa-stop-btn").addEventListener("click", async () => {
    stopRequested = true;
    await window.MESStorage.setRunning(false);
    updateOverlayStatus("Stopping...");
  });

  document.getElementById("mfa-close-btn").addEventListener("click", () => {
    overlay.style.display = "none";
  });
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

  overlay.style.display = "block";
}

function updateOverlayStatus(status) {
  if (!overlay) return;

  const statusEl = document.getElementById("mfa-status");
  if (statusEl) statusEl.textContent = status;
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