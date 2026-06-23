window.MESLogger = {
  log(message) {
    console.log(`[MES Flow Assistant] ${message}`);

    chrome.runtime.sendMessage({
      type: "MES_PROGRESS",
      message
    }).catch(() => {});
  }
};