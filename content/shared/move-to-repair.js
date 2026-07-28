const MOVE_TO_REPAIR_TIMEOUT_MS = 10000;
const MOVE_TO_REPAIR_DEFAULT_LOCATION = "NEW102-SMOBILE1-TECH-09-F01";
const MOVE_TO_REPAIR_FOCUS_TIMEOUT_MS = 1500;
const MOVE_TO_REPAIR_SUGGESTION_ATTEMPT_TIMEOUTS_MS = [900, 2500, 5000];
const MOVE_TO_REPAIR_SELECTION_TIMEOUT_MS = MOVE_TO_REPAIR_TIMEOUT_MS;

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

    const suggestion = await this.enterRepairLocation(
      locationInput,
      repairLocation,
      shouldStop
    );

    if (!suggestion) {
      throw new Error("Move to Repair location suggestion did not appear");
    }

    await core.dispatchClick(suggestion, 75, 300, shouldStop);

    const selectionVerified = await core.waitForScoped(
      () =>
        this.isRepairLocationSelectionCommitted(locationInput, repairLocation)
          ? locationInput
          : null,
      MOVE_TO_REPAIR_SELECTION_TIMEOUT_MS,
      shouldStop
    );

    if (!selectionVerified) {
      throw new Error("Move to Repair location selection was not confirmed");
    }

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

  async enterRepairLocation(locationInput, repairLocation, shouldStop) {
    const core = window.MESCore;

    await this.focusMoveToRepairInput(locationInput, shouldStop);
    this.setRepairLocationValue(locationInput, "");

    await this.focusMoveToRepairInput(locationInput, shouldStop);
    this.setRepairLocationValue(locationInput, repairLocation);

    for (
      let attemptIndex = 0;
      attemptIndex < MOVE_TO_REPAIR_SUGGESTION_ATTEMPT_TIMEOUTS_MS.length;
      attemptIndex++
    ) {
      core.throwIfStopped(shouldStop);

      if (
        attemptIndex ===
        MOVE_TO_REPAIR_SUGGESTION_ATTEMPT_TIMEOUTS_MS.length - 1
      ) {
        await this.focusMoveToRepairInput(locationInput, shouldStop);
        this.setRepairLocationValue(locationInput, "");

        await this.focusMoveToRepairInput(locationInput, shouldStop);
        this.setRepairLocationValue(locationInput, repairLocation);
      }

      await this.focusMoveToRepairInput(locationInput, shouldStop);

      // This combobox can have the correct value before its dropdown opens.
      // ArrowDown mirrors the manual recovery path and prompts option
      // generation without changing the typed value.
      this.pressKey(locationInput, "ArrowDown", 40);

      const suggestion = await core.waitForScoped(
        () => this.findRepairLocationSuggestion(locationInput, repairLocation),
        MOVE_TO_REPAIR_SUGGESTION_ATTEMPT_TIMEOUTS_MS[attemptIndex],
        shouldStop
      );

      if (suggestion) {
        return suggestion;
      }
    }

    return null;
  },

  setRepairLocationValue(locationInput, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(locationInput, value);
    locationInput.dispatchEvent(new Event("input", { bubbles: true }));
  },

  async focusMoveToRepairInput(locationInput, shouldStop) {
    const core = window.MESCore;

    locationInput.scrollIntoView({ block: "center", inline: "center" });
    locationInput.click();
    locationInput.focus();

    const focused = await core.waitForScoped(
      () => (document.activeElement === locationInput ? locationInput : null),
      MOVE_TO_REPAIR_FOCUS_TIMEOUT_MS,
      shouldStop
    );

    if (!focused) {
      throw new Error("Move to Repair location input did not receive focus");
    }

    return focused;
  },

  pressKey(inputEl, key, keyCode) {
    const init = {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    };

    inputEl.dispatchEvent(new KeyboardEvent("keydown", init));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", init));
  },

  isRepairLocationSelectionCommitted(locationInput, repairLocation) {
    const confirmMove = document.querySelector(
      'button[aria-label="Confirm move"]'
    );

    return (
      (locationInput.value || "").includes(repairLocation) &&
      confirmMove &&
      !window.MESCore.isDisabled(confirmMove)
    );
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
