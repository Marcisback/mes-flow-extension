const REPAIR_DEFAULT_LOCATOR = "NEW102-SMOBILE1-EOL-11-D01";
const REPAIR_SETTLE_MS = 300;
const REPAIR_STAGE_POLL_MS = 150;
const REPAIR_OPTIONAL_CONFIRM_TIMEOUT_MS = 4000;
const REPAIR_ADVANCE_TIMEOUT_MS = 10000;

// State-aware Repair mode. It does not assume it starts at Move to Repair; it
// detects the current stage (via MESRepairState) and reuses the shared workflow
// actions (MESMoveToRepair + MESFailureDialog) rather than duplicating any of
// them. This file holds Repair workflow/orchestration only.
window.MESRepair = {
  // options.repairOutcome: "confirmed" (default) | "failed".
  // options.repairLocator: Move to Repair location; defaults to the standard
  // repair locator when unset.
  async processAsset(asset, shouldStop, options = {}) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const log = window.MESLogger.log;

    const outcome = options.repairOutcome === "failed" ? "failed" : "confirmed";
    const repairLocator =
      (options.repairLocator || "").trim() || REPAIR_DEFAULT_LOCATOR;

    core.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    // Load the asset through the landing scan when it is present. This is
    // best-effort: when the page is already parked on a Repair stage there is
    // no landing scan and we go straight to state detection.
    const landingScan = state.findLandingScanInput();

    if (landingScan) {
      await core.typeAndSubmit(landingScan, asset, shouldStop);
      await core.sleep(REPAIR_SETTLE_MS, shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
    }

    // State-aware entry: the page may be at Move to Repair (State A) or already
    // at Repair Started (State B).
    const stage = await this.waitForEntryStage(shouldStop);

    if (stage === "moveToRepair") {
      // Reuse the shared Move to Repair action, passing the configured locator
      // instead of the MRI (FAIL) default.
      await window.MESMoveToRepair.complete(shouldStop, repairLocator);
      log("Repair: Move to Repair confirmed");

      // Detect again: Move to Repair advances into Repair Started.
      await this.waitForRepairStartedStage(shouldStop);
    }

    // State B: Repair Started. Some entries require the asset scanned into the
    // Repair Started input before its controls enable; fill it when present.
    const repairInput = state.findRepairInput();

    if (repairInput) {
      await core.typeAndSubmit(repairInput, asset, shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
    }

    if (outcome === "failed") {
      await this.completeRepairFailed(shouldStop);
    } else {
      await this.completeRepairConfirmed(shouldStop);
    }

    core.throwIfStopped(shouldStop);
    log(`Done: ${asset}`);
  },

  // Repair Confirmed: click Confirm Repair, then wait for the page to advance.
  async completeRepairConfirmed(shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const confirmRepair = await core.waitForClickableByText(
      window.MESRepairState.selectors.confirmRepairText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(confirmRepair, 75, 300, shouldStop);
    await this.waitForConfirmRepairToClear(shouldStop);

    log("Repair: Confirmed");
  },

  // Repair Failed: click Repair Failed, reuse the entire shared failure-reason
  // dialog, then confirm the repair when a Confirm Repair button is present
  // (Variant 1). Variant 2 has no Confirm Repair, so completion follows the
  // failure confirmation directly.
  async completeRepairFailed(shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const repairFailedButton = await core.waitForClickableByText(
      window.MESRepairState.selectors.repairFailedText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(repairFailedButton, 75, 300, shouldStop);

    // Reuse the shared failure-reason dialog verbatim (dialog detection,
    // Phone - Display selection, Confirm Failure and verification).
    await window.MESFailureDialog.complete(shouldStop, "Repair");

    const confirmRepair = await this.waitForOptionalConfirmRepair(shouldStop);

    if (confirmRepair) {
      await core.dispatchClick(confirmRepair, 75, 300, shouldStop);
      await this.waitForConfirmRepairToClear(shouldStop);
      log("Repair: Failure confirmed and repair confirmed");
    } else {
      log("Repair: Failure confirmed");
    }
  },

  async waitForEntryStage(shouldStop) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const start = Date.now();

    while (Date.now() - start < core.DEFAULT_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      if (state.isMoveToRepairStage()) {
        return "moveToRepair";
      }

      if (state.isRepairStartedStage()) {
        return "repairStarted";
      }

      await core.sleep(REPAIR_STAGE_POLL_MS, shouldStop);
    }

    throw new Error(
      "Repair stage not found (neither Move to Repair nor Repair Started)"
    );
  },

  async waitForRepairStartedStage(shouldStop) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const start = Date.now();

    while (Date.now() - start < core.DEFAULT_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      if (state.isRepairStartedStage()) {
        return true;
      }

      await core.sleep(REPAIR_STAGE_POLL_MS, shouldStop);
    }

    throw new Error("Repair Started stage did not appear after Move to Repair");
  },

  // Poll a bounded window for an enabled Confirm Repair button. Returns null
  // (never throws) so the Variant 2 "Repair Failed only" page completes cleanly.
  async waitForOptionalConfirmRepair(shouldStop) {
    const core = window.MESCore;
    const state = window.MESRepairState;
    const start = Date.now();

    while (Date.now() - start < REPAIR_OPTIONAL_CONFIRM_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      const confirmRepair = state.findConfirmRepairButton(true);

      if (confirmRepair) {
        return confirmRepair;
      }

      await core.sleep(REPAIR_STAGE_POLL_MS, shouldStop);
    }

    return null;
  },

  async waitForConfirmRepairToClear(shouldStop) {
    const advanced = await window.MESCore.waitForScoped(
      () =>
        window.MESRepairState.findConfirmRepairButton(false) ? null : true,
      REPAIR_ADVANCE_TIMEOUT_MS,
      shouldStop
    );

    if (!advanced) {
      throw new Error("Repair page did not advance after Confirm Repair");
    }
  }
};
