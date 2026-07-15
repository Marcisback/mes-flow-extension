const MOVE_TO_REPAIR_TIMEOUT_MS = 10000;
const MOVE_TO_REPAIR_DEFAULT_LOCATION = "NEW102-SMOBILE1-TECH-09-F01";

// Reusable "Move to Repair" workflow action: locate its own locator input,
// select the locator via the shared MESLocatorSelector, and confirm the move.
// repairLocation defaults to the MRI (FAIL) location so existing behavior is
// unchanged; Repair mode passes its configured locator. Log wording is left
// as-is ("MRI (FAIL): ...") to preserve the exact logging semantics both
// callers had.
window.MESMoveToRepair = {
  async complete(shouldStop, repairLocation = MOVE_TO_REPAIR_DEFAULT_LOCATION) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const locationInput = await core.waitForScoped(
      () => this.findMoveToRepairInput(),
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!locationInput) {
      throw new Error("Move to Repair location input not found");
    }

    // Select + verify the locator via the shared, workflow-agnostic helper.
    await window.MESLocatorSelector.select(
      locationInput,
      repairLocation,
      shouldStop
    );

    log("MRI (FAIL): Selected repair location");

    const confirmMove = await core.waitForScoped(
      () => document.querySelector('button[aria-label="Confirm move"]'),
      MOVE_TO_REPAIR_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmMove) {
      throw new Error("Confirm move button not found");
    }

    const enabledMove = await core.waitForScoped(
      () => (!core.isDisabled(confirmMove) ? confirmMove : null),
      MOVE_TO_REPAIR_TIMEOUT_MS,
      shouldStop
    );

    if (!enabledMove) {
      throw new Error("Confirm move button never enabled");
    }

    await core.dispatchClick(confirmMove, 75, 300, shouldStop);

    const advanced = await core.waitForScoped(
      () =>
        document.querySelector('button[aria-label="Confirm move"]')
          ? null
          : true,
      MOVE_TO_REPAIR_TIMEOUT_MS,
      shouldStop
    );

    if (!advanced) {
      throw new Error("Repair page did not continue after Confirm move");
    }

    log("MRI (FAIL): Move to Repair confirmed");
  },

  findMoveToRepairInput() {
    const core = window.MESCore;

    // Innermost container that mentions the step and holds an input, matching
    // the scoping approach used by findFailureReasonDialog.
    const candidates = [
      ...document.querySelectorAll("div, section, form")
    ].filter((element) => {
      return (
        core.isVisible(element) &&
        /Move to Repair/i.test(element.innerText || "") &&
        element.querySelector("input, textarea")
      );
    });

    const root = window.MESState.innermost(candidates) || document;

    return (
      [...root.querySelectorAll("input, textarea")].find((input) => {
        return (
          input.type !== "hidden" &&
          core.isVisible(input) &&
          !core.isDisabled(input)
        );
      }) || null
    );
  }
};
