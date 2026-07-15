const REPAIR_FINAL_SETTLE_MS = 400;
const REPAIR_STATE_TIMEOUT_MS = 2500;
const REPAIR_POLL_MS = 100;

// Repair Cleanup (EOL HANDOVER) mode. Workflow/orchestration only; stage
// detection lives in MESRepairState.
window.MESRepairCleanup = {
  async processAsset(asset, shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    core.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await core.waitForInputByPlaceholderRegex(
      core.selectors.firstScanText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.typeAndSubmit(scan1, asset, shouldStop);

    const repairState = await this.waitForRepairState(shouldStop);

    if (repairState.type === "pastRepair") {
      throw new window.MESAssetError("Already past Repair");
    }

    if (repairState.type !== "repair") {
      throw new window.MESAssetError("Repair state not found");
    }

    await core.typeAndSubmit(repairState.repairInput, asset, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const repairFailedButton = await this.waitForRepairFailedButton(shouldStop);

    await core.dispatchClick(repairFailedButton, 150, 150, shouldStop);
    await core.sleep(REPAIR_FINAL_SETTLE_MS, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    core.throwIfStopped(shouldStop);
    log(`Done: ${asset}`);
  },

  async waitForRepairState(shouldStop) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      const repairSection = state.findRepairSection();
      const repairInput = state.findRepairInput();

      if (repairSection && repairInput) {
        return {
          type: "repair",
          repairInput
        };
      }

      if (
        state.isPastRepairStateVisible() &&
        !repairSection &&
        !repairInput
      ) {
        return {
          type: "pastRepair"
        };
      }

      await core.sleep(REPAIR_POLL_MS, shouldStop);
    }

    return {
      type: "missing"
    };
  },

  async waitForRepairFailedButton(shouldStop) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      const repairFailedButton = state.findRepairFailedButton(true);

      if (repairFailedButton) {
        return repairFailedButton;
      }

      await core.sleep(REPAIR_POLL_MS, shouldStop);
    }

    throw new window.MESAssetError("Repair failed button not enabled");
  }
};
