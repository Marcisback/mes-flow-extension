const MOVE_TO_REPAIR_TIMEOUT_MS = 10000;
const MOVE_TO_REPAIR_DEFAULT_LOCATION = "NEW102-SMOBILE1-TECH-09-F01";

// Reusable "Move to Repair" workflow action: type the repair location, select
// the matching autocomplete suggestion, and confirm the move. repairLocation
// defaults to the MRI (FAIL) location so existing behavior is unchanged; Repair
// mode passes its configured locator. This combobox filters on programmatic
// input, so selection is suggestion-based here (distinct from the Repair Started
// combobox, which requires keyboard navigation via MESLocatorSelector). Log
// wording is left as-is ("MRI (FAIL): ...") to preserve the exact logging
// semantics both callers had.
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

    core.throwIfStopped(shouldStop);
    locationInput.focus();

    // Set the value React-compatibly (same technique as typeAndSubmit) without
    // submitting, clearing any existing value first.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(locationInput, "");
    locationInput.dispatchEvent(new Event("input", { bubbles: true }));

    nativeSetter.call(locationInput, repairLocation);
    locationInput.dispatchEvent(new Event("input", { bubbles: true }));

    const suggestion = await core.waitForScoped(
      () => this.findRepairLocationSuggestion(locationInput, repairLocation),
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!suggestion) {
      throw new Error("Move to Repair location suggestion did not appear");
    }

    await core.dispatchClick(suggestion, 75, 300, shouldStop);

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
  },

  findRepairLocationSuggestion(
    locationInput,
    repairLocation = MOVE_TO_REPAIR_DEFAULT_LOCATION
  ) {
    const core = window.MESCore;

    // Resolve the popup owned by the locator input (its id is dynamic and read
    // at runtime); fall back to the first document listbox only if the input
    // exposes no owned popup. Match the visible suggestion whose text contains
    // the typed location rather than a generated CSS class name.
    const listboxId =
      locationInput.getAttribute("aria-controls") ||
      locationInput.getAttribute("aria-owns");

    const listbox =
      (listboxId && document.getElementById(listboxId)) ||
      document.querySelector('[role="listbox"]');

    if (!listbox) {
      return null;
    }

    return (
      [...listbox.querySelectorAll('[role="option"]')].find(
        (option) =>
          core.isVisible(option) &&
          (option.textContent || "").includes(repairLocation)
      ) || null
    );
  }
};
