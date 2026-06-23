const MES_MAX_LOG_LINES = 200;

async function appendRuntimeLog(message) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${message}`;

  const data = await chrome.storage.local.get({
    runtimeLog: ""
  });

  const lines = data.runtimeLog
    .split("\n")
    .filter(Boolean);

  lines.push(line);

  const trimmed = lines.slice(-MES_MAX_LOG_LINES).join("\n") + "\n";

  await chrome.storage.local.set({
    runtimeLog: trimmed
  });
}

window.MESLogger = {
  async log(message) {
    console.log(`[MES Flow Assistant] ${message}`);

    await appendRuntimeLog(message);

    chrome.runtime.sendMessage({
      type: "MES_PROGRESS",
      message
    }).catch(() => {});
  }
};