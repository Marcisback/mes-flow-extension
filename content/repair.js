const REPAIR_DEFAULT_LOCATOR = "NEW102-SMOBILE1-EOL-11-D01";
const REPAIR_SETTLE_MS = 300;
const REPAIR_POLL_MS = 150;
const REPAIR_OPTIONAL_CONFIRM_TIMEOUT_MS = 4000;
const REPAIR_ADVANCE_TIMEOUT_MS = 10000;

// State-aware Repair mode. It does not assume it starts at Move to Repair; it
// detects the current stage and reuses the production MRI (FAIL) helpers
// (completeMoveToRepair + completeFailureReasonDialog) and the Repair Cleanup
// read-only detectors rather than duplicating any of them.
window.MESRepair = {
  selectors: {
    repairFailedText: /^Repair failed$/i,
    confirmRepairText: /^Confirm\s+repair$/i
  },

  // options.repairOutcome: "confirmed" (default) | "failed".
  // options.repairLocator: Move to Repair location; defaults to the standard
  // repair locator when unset.
  async processAsset(asset, shouldStop, options = {}) {
    const eol = window.MESEOL;
    const mri = window.MESMRI;
    const log = window.MESLogger.log;

    const outcome = options.repairOutcome === "failed" ? "failed" : "confirmed";
    const repairLocator =
      (options.repairLocator || "").trim() || REPAIR_DEFAULT_LOCATOR;

    eol.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    // Load the asset through the landing scan when it is present. This is
    // best-effort: when the page is already parked on a Repair stage there is
    // no landing scan and we go straight to state detection.
    const landingScan = this.findLandingScanInput();

    if (landingScan) {
      await eol.typeAndSubmit(landingScan, asset, shouldStop);
      await eol.sleep(REPAIR_SETTLE_MS, shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
    }

    // State-aware entry: the page may be at Move to Repair (State A) or already
    // at Repair Started (State B).
    const stage = await this.waitForEntryStage(shouldStop);

    if (stage === "moveToRepair") {
      // Reuse the MRI (FAIL) production Move to Repair implementation, passing
      // the configured locator instead of the MRI (FAIL) default.
      await mri.completeMoveToRepair(shouldStop, repairLocator);
      log("Repair: Move to Repair confirmed");

      // Detect again: Move to Repair advances into Repair Started.
      await this.waitForRepairStartedStage(shouldStop);
    }

    // State B: Repair Started. Some entries require the asset scanned into the
    // Repair Started input before its controls enable; fill it when present.
    const repairInput = this.findRepairInput();

    if (repairInput) {
      await eol.typeAndSubmit(repairInput, asset, shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
    }

    if (outcome === "failed") {
      await this.completeRepairFailed(shouldStop);
    } else {
      await this.completeRepairConfirmed(shouldStop);
    }

    eol.throwIfStopped(shouldStop);
    log(`Done: ${asset}`);
  },

  // Repair Confirmed: click Confirm Repair, then wait for the page to advance.
  async completeRepairConfirmed(shouldStop) {
    const eol = window.MESEOL;
    const mri = window.MESMRI;
    const log = window.MESLogger.log;

    const confirmRepair = await eol.waitForClickableByText(
      this.selectors.confirmRepairText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await mri.fastClick(confirmRepair, shouldStop);
    await this.waitForConfirmRepairToClear(shouldStop);

    log("Repair: Confirmed");
  },

  // Repair Failed: click Repair Failed, reuse the entire MRI failure-reason
  // dialog, then confirm the repair when a Confirm Repair button is present
  // (Variant 1). Variant 2 has no Confirm Repair, so completion follows the
  // failure confirmation directly.
  async completeRepairFailed(shouldStop) {
    const eol = window.MESEOL;
    const mri = window.MESMRI;
    const log = window.MESLogger.log;

    const repairFailedButton = await eol.waitForClickableByText(
      this.selectors.repairFailedText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await mri.fastClick(repairFailedButton, shouldStop);

    // Reuse the MRI (FAIL) failure-reason dialog verbatim (dialog detection,
    // Phone - Display selection, Confirm Failure and verification).
    await mri.completeFailureReasonDialog(shouldStop, "Repair");

    const confirmRepair = await this.waitForOptionalConfirmRepair(shouldStop);

    if (confirmRepair) {
      await mri.fastClick(confirmRepair, shouldStop);
      await this.waitForConfirmRepairToClear(shouldStop);
      log("Repair: Failure confirmed and repair confirmed");
    } else {
      log("Repair: Failure confirmed");
    }
  },

  isMoveToRepairStage() {
    // Stable signals: a "Move to Repair" section holding a locator input plus
    // the Confirm move button (aria-label), never generated CSS classes.
    return Boolean(
      window.MESMRI.findMoveToRepairInput() && this.findConfirmMoveButton()
    );
  },

  isRepairStartedStage() {
    // Stable signals: the innermost "Repair" + "Started" section plus a
    // "Repair failed" control (matched by button text). Delegates to the
    // Repair Cleanup read-only detectors to avoid duplicating them.
    return Boolean(
      this.findRepairStartedSection() && this.findRepairFailedButton(false)
    );
  },

  async waitForEntryStage(shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < eol.DEFAULT_TIMEOUT_MS) {
      eol.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      eol.throwIfStopped(shouldStop);

      if (this.isMoveToRepairStage()) {
        return "moveToRepair";
      }

      if (this.isRepairStartedStage()) {
        return "repairStarted";
      }

      await eol.sleep(REPAIR_POLL_MS, shouldStop);
    }

    throw new Error(
      "Repair stage not found (neither Move to Repair nor Repair Started)"
    );
  },

  async waitForRepairStartedStage(shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < eol.DEFAULT_TIMEOUT_MS) {
      eol.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      eol.throwIfStopped(shouldStop);

      if (this.isRepairStartedStage()) {
        return true;
      }

      await eol.sleep(REPAIR_POLL_MS, shouldStop);
    }

    throw new Error("Repair Started stage did not appear after Move to Repair");
  },

  // Poll a bounded window for an enabled Confirm Repair button. Returns null
  // (never throws) so the Variant 2 "Repair Failed only" page completes cleanly.
  async waitForOptionalConfirmRepair(shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < REPAIR_OPTIONAL_CONFIRM_TIMEOUT_MS) {
      eol.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      eol.throwIfStopped(shouldStop);

      const confirmRepair = this.findConfirmRepairButton(true);

      if (confirmRepair) {
        return confirmRepair;
      }

      await eol.sleep(REPAIR_POLL_MS, shouldStop);
    }

    return null;
  },

  async waitForConfirmRepairToClear(shouldStop) {
    const advanced = await window.MESMRI.waitForFailureElement(
      () => (this.findConfirmRepairButton(false) ? null : true),
      REPAIR_ADVANCE_TIMEOUT_MS,
      shouldStop
    );

    if (!advanced) {
      throw new Error("Repair page did not advance after Confirm Repair");
    }
  },

  findLandingScanInput() {
    const eol = window.MESEOL;

    return (
      [...document.querySelectorAll("input, textarea")].find((input) => {
        return (
          eol.selectors.firstScanText.test(input.placeholder || "") &&
          eol.isVisible(input)
        );
      }) || null
    );
  },

  findConfirmMoveButton() {
    const eol = window.MESEOL;
    const button = document.querySelector('button[aria-label="Confirm move"]');

    return button && eol.isVisible(button) ? button : null;
  },

  findConfirmRepairButton(requireClickable) {
    const eol = window.MESEOL;

    return (
      [...document.querySelectorAll(this.buttonSelector())].find((button) => {
        return (
          this.selectors.confirmRepairText.test(this.getElementText(button)) &&
          eol.isVisible(button) &&
          (!requireClickable || !eol.isDisabled(button))
        );
      }) || null
    );
  },

  // Read-only reuse of the Repair Cleanup detectors (never modified here).
  findRepairStartedSection() {
    return window.MESRepairCleanup.findRepairSection();
  },

  findRepairInput() {
    return window.MESRepairCleanup.findRepairInput() || null;
  },

  findRepairFailedButton(requireClickable) {
    return window.MESRepairCleanup.findRepairFailedButton(requireClickable) || null;
  },

  buttonSelector() {
    return "button, [role='button'], input[type='button'], input[type='submit']";
  },

  getElementText(element) {
    return (
      element.innerText ||
      element.textContent ||
      element.value ||
      element.getAttribute("aria-label") ||
      ""
    ).trim();
  }
};
