const FAILURE_DIALOG_TIMEOUT_MS = 10000;
const FAILURE_OPTION_TIMEOUT_MS = 8000;
const FAILURE_REASON_LABEL = "Phone - Display";

// Reusable failure-reason dialog workflow action: open the reason combobox,
// select the fixed failure reason, confirm it, and wait for the dialog to close.
// This is the production reference implementation (from the MRI (FAIL) diagnostic
// branch) reused verbatim by the Repair (Failed) workflow. logPrefix only
// affects log wording; it defaults so MRI (FAIL) output is unchanged.
window.MESFailureDialog = {
  async complete(shouldStop, logPrefix = "MRI (FAIL)") {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const dialog = await core.waitForScoped(
      () => this.findFailureReasonDialog(),
      FAILURE_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!dialog) {
      throw new Error("Failure reason dialog did not appear");
    }

    log(`${logPrefix}: Diagnostic failure dialog opened`);

    const combobox = await core.waitForScoped(
      () =>
        dialog.querySelector(
          'button[role="combobox"][aria-haspopup="listbox"]'
        ),
      FAILURE_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!combobox) {
      throw new Error("Failure reason combobox not found");
    }

    if (core.isDisabled(combobox)) {
      throw new Error("Failure reason combobox is disabled");
    }

    // This Meta ARIA combobox does not respond to synthetic mouse/pointer
    // events; it only opens via keyboard. Focus it and send a Space keydown.
    if (combobox.getAttribute("aria-expanded") !== "true") {
      combobox.focus();

      combobox.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          bubbles: true
        })
      );

      const expanded = await core.waitForScoped(
        () =>
          combobox.getAttribute("aria-expanded") === "true" ? combobox : null,
        FAILURE_DIALOG_TIMEOUT_MS,
        shouldStop
      );

      if (!expanded) {
        throw new Error("Failure reason combobox did not open");
      }
    }

    const optionSelector =
      '[role="option"][data-logging-label="' + FAILURE_REASON_LABEL + '"]';

    // Scope to the listbox the combobox owns. Its aria-controls id is dynamic,
    // so it is read at runtime (never hard-coded); fall back to document only
    // when the relationship cannot be resolved.
    const findOption = () => {
      const listbox = document.getElementById(
        combobox.getAttribute("aria-controls")
      );

      return (listbox || document).querySelector(optionSelector);
    };

    const option = await core.waitForScoped(
      findOption,
      FAILURE_OPTION_TIMEOUT_MS,
      shouldStop
    );

    if (!option) {
      throw new Error(`${FAILURE_REASON_LABEL} option not found`);
    }

    // Multiselect listbox: only click when not already selected so we never
    // toggle the intended reason back off.
    if (!this.isOptionSelected(option)) {
      await core.dispatchClick(option, 75, 300, shouldStop);
    }

    // Verify selection, preferring aria-selected, then the combobox display,
    // then the nested checkbox (covered by isOptionSelected).
    const confirmedSelection = await core.waitForScoped(
      () =>
        this.isOptionSelected(option) ||
        (combobox.textContent || "").includes(FAILURE_REASON_LABEL)
          ? option
          : null,
      FAILURE_OPTION_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmedSelection) {
      throw new Error(`${FAILURE_REASON_LABEL} option did not become selected`);
    }

    log(`${logPrefix}: Selected ${FAILURE_REASON_LABEL}`);

    const confirmButton = await core.waitForScoped(
      () => dialog.querySelector('button[aria-label="Confirm failure"]'),
      FAILURE_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmButton) {
      throw new Error("Confirm failure button not found");
    }

    const enabledConfirm = await core.waitForScoped(
      () => (!core.isDisabled(confirmButton) ? confirmButton : null),
      FAILURE_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!enabledConfirm) {
      throw new Error("Confirm failure button remained disabled");
    }

    await core.dispatchClick(confirmButton, 75, 300, shouldStop);

    const dialogClosed = await core.waitForScoped(
      () => (this.findFailureReasonDialog() ? null : true),
      FAILURE_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!dialogClosed) {
      throw new Error("Failure reason dialog did not close");
    }

    log(`${logPrefix}: Diagnostic failure confirmed`);
  },

  findFailureReasonDialog() {
    const core = window.MESCore;
    const heading = "Select failure reason";

    // Prefer a proper role="dialog" container when the page provides one.
    const roleDialog = [...document.querySelectorAll('[role="dialog"]')].find(
      (dialog) => (dialog.textContent || "").includes(heading)
    );

    if (roleDialog) {
      return roleDialog;
    }

    // Fallback for pages that do not use role="dialog": the smallest container
    // that holds both the heading text and the failure controls, so it still
    // scopes the combobox/confirm queries tightly.
    const candidates = [
      ...document.querySelectorAll("div, section, form")
    ].filter((element) => {
      return (
        core.isVisible(element) &&
        (element.textContent || "").includes(heading) &&
        (element.querySelector('button[aria-label="Confirm failure"]') ||
          element.querySelector(
            'button[role="combobox"][aria-haspopup="listbox"]'
          ))
      );
    });

    return window.MESState.innermost(candidates);
  },

  isOptionSelected(option) {
    return (
      option.getAttribute("aria-selected") === "true" ||
      option.querySelector('input[type="checkbox"]')?.checked === true
    );
  }
};
