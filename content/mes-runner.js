const MES_TARGET_URL_PREFIX =
  "https://www.internalfb.com/inventory/manufacturing/reverse/triage";

let stopRequested = false;
let isRunning = false;

if (!window.location.href.startsWith(MES_TARGET_URL_PREFIX)) {
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
    window.MESLogger.log("Stop requested");
  }
});

async function runQueue(assets, mode) {
  const log = window.MESLogger.log;

  if (isRunning) {
    log("Already running");
    return;
  }

  if (!window.location.href.startsWith(MES_TARGET_URL_PREFIX)) {
    log("Unsupported page. Navigate to MES triage page.");
    return;
  }

  isRunning = true;
  await window.MESStorage.setRunning(true);

  log(`Started ${mode} queue with ${assets.length} assets`);

  for (const asset of assets) {
    if (stopRequested) {
      log("Stopped by user");
      break;
    }

    try {
      log(`Processing: ${asset}`);

      if (mode === "EOL") {
        await processWithRetry(asset, window.MESEOL.processAsset.bind(window.MESEOL));
      } else if (mode === "MRI") {
        await processWithRetry(asset, window.MESMRI.processAsset.bind(window.MESMRI));
      } else {
        throw new Error(`Unsupported mode: ${mode}`);
      }

      await window.MESStorage.markCompleted(asset);
      log(`Completed: ${asset}`);
    } catch (error) {
      const reason = error?.message || "Unknown error";

      await window.MESStorage.markSkipped(asset, reason);
      log(`Skipped: ${asset} - ${reason}`);
    }
  }

  isRunning = false;
  await window.MESStorage.setRunning(false);

  log("Queue finished");
}

async function processWithRetry(asset, fn) {
  try {
    await fn(asset, () => stopRequested);
  } catch (firstError) {
    if (firstError.name === "MESAssetError") {
      throw firstError;
    }

    window.MESLogger.log(`Retrying ${asset} after error: ${firstError.message}`);

    await sleep(500);

    await fn(asset, () => stopRequested);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}