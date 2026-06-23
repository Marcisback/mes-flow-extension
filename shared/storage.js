window.MESStorage = {
  async getState() {
    return chrome.storage.local.get({
      assets: [],
      completed: [],
      skipped: [],
      running: false,
      mode: "EOL"
    });
  },

  async setRunning(value) {
    return chrome.storage.local.set({ running: value });
  },

  async markCompleted(asset) {
    const state = await this.getState();
    const completed = [...new Set([...state.completed, asset])];

    return chrome.storage.local.set({ completed });
  },

  async markSkipped(asset, reason) {
    const state = await this.getState();

    const skipped = [
      ...state.skipped,
      {
        asset,
        reason,
        time: new Date().toISOString()
      }
    ];

    return chrome.storage.local.set({ skipped });
  }
};