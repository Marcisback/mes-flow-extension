const MRI_SHORT_DELAY_MS = 250;
const MRI_FINAL_SETTLE_MS = 500;
const MRI_FAIL_DIALOG_TIMEOUT_MS = 10000;
const MRI_FAIL_OPTION_TIMEOUT_MS = 8000;
const MRI_FAIL_REASON_LABEL = "Phone - Display";
const MRI_FAIL_REPAIR_LOCATION = "NEW102-SMOBILE1-TECH-09-F01";

window.MESMRI = {
  // options.diagnosticOutcome: "success" (default, existing MRI) | "failure" (MRI (FAIL) mode).
  async processAsset(asset, shouldStop, options = {}) {
    const core = window.MESCore;
    const log = window.MESLogger.log;
    const diagnosticOutcome = options.diagnosticOutcome ?? "success";

    core.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await core.waitForInputByPlaceholderRegex(
      core.selectors.firstScanText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.typeAndSubmit(scan1, asset, shouldStop);
    await core.sleep(MRI_SHORT_DELAY_MS, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const startButton = await core.waitForClickableByText(
      core.selectors.startButtonText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(startButton, 150, 350, shouldStop);
    await core.sleep(MRI_SHORT_DELAY_MS, shouldStop);

    const wipeScan = await this.waitForStepInput("Wipe", shouldStop);

    await core.typeAndSubmit(wipeScan, asset, shouldStop);

    const confirmWipeButton = await core.waitForClickableByText(
      /Confirm\s+wipe/i,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(confirmWipeButton, 75, 300, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    if (diagnosticOutcome === "failure") {
      log("MRI (FAIL): Wipe stage completed");
    }

    const diagnosticScan = await this.waitForStepInput("Diagnostic", shouldStop);

    await core.typeAndSubmit(diagnosticScan, asset, shouldStop);

    if (diagnosticOutcome === "failure") {
      await this.completeFailedDiagnostic(asset, shouldStop);
      return;
    }

    const confirmDiagnosticButton = await core.waitForClickableByText(
      /Confirm\s+diagnostic/i,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(confirmDiagnosticButton, 75, 300, shouldStop);
    await core.sleep(MRI_FINAL_SETTLE_MS, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();
    core.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
  },

  // MRI (FAIL) diagnostic branch: reject the diagnostic with a fixed failure
  // reason instead of confirming it, then move the asset to a repair location.
  async completeFailedDiagnostic(asset, shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const failedButton = await core.waitForScoped(
      () => document.querySelector('button[aria-label="Diagnostic failed"]'),
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!failedButton) {
      throw new Error("Diagnostic failed button not found");
    }

    if (core.isDisabled(failedButton)) {
      throw new Error("Diagnostic failed button is disabled");
    }

    await core.dispatchClick(failedButton, 75, 300, shouldStop);

    await this.completeFailureReasonDialog(shouldStop);

    await this.completeMoveToRepair(shouldStop);

    log(`Done: ${asset}`);
  },

  // Shared failure-reason dialog handler: opens the reason combobox, selects the
  // fixed failure reason, confirms it, and waits for the dialog to close. This
  // is the production reference implementation extracted from the MRI (FAIL)
  // diagnostic branch so the Repair (Failed) workflow can reuse it verbatim.
  // logPrefix only affects log wording; it defaults so MRI (FAIL) output is
  // unchanged.
  async completeFailureReasonDialog(shouldStop, logPrefix = "MRI (FAIL)") {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    const dialog = await core.waitForScoped(
      () => this.findFailureReasonDialog(),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
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
      MRI_FAIL_DIALOG_TIMEOUT_MS,
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
        MRI_FAIL_DIALOG_TIMEOUT_MS,
        shouldStop
      );

      if (!expanded) {
        throw new Error("Failure reason combobox did not open");
      }
    }

    const optionSelector =
      '[role="option"][data-logging-label="' + MRI_FAIL_REASON_LABEL + '"]';

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
      MRI_FAIL_OPTION_TIMEOUT_MS,
      shouldStop
    );

    if (!option) {
      throw new Error(`${MRI_FAIL_REASON_LABEL} option not found`);
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
        (combobox.textContent || "").includes(MRI_FAIL_REASON_LABEL)
          ? option
          : null,
      MRI_FAIL_OPTION_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmedSelection) {
      throw new Error(`${MRI_FAIL_REASON_LABEL} option did not become selected`);
    }

    log(`${logPrefix}: Selected ${MRI_FAIL_REASON_LABEL}`);

    const confirmButton = await core.waitForScoped(
      () => dialog.querySelector('button[aria-label="Confirm failure"]'),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmButton) {
      throw new Error("Confirm failure button not found");
    }

    const enabledConfirm = await core.waitForScoped(
      () => (!core.isDisabled(confirmButton) ? confirmButton : null),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!enabledConfirm) {
      throw new Error("Confirm failure button remained disabled");
    }

    await core.dispatchClick(confirmButton, 75, 300, shouldStop);

    const dialogClosed = await core.waitForScoped(
      () => (this.findFailureReasonDialog() ? null : true),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!dialogClosed) {
      throw new Error("Failure reason dialog did not close");
    }

    log(`${logPrefix}: Diagnostic failure confirmed`);
  },

  // MRI (FAIL) Move to Repair step: type the repair location, then select the
  // matching autocomplete suggestion and confirm the move. repairLocation
  // defaults to the MRI (FAIL) constant so existing behavior is unchanged; the
  // Repair mode passes its configured locator.
  async completeMoveToRepair(shouldStop, repairLocation = MRI_FAIL_REPAIR_LOCATION) {
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
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmMove) {
      throw new Error("Confirm move button not found");
    }

    const enabledMove = await core.waitForScoped(
      () => (!core.isDisabled(confirmMove) ? confirmMove : null),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
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
      MRI_FAIL_DIALOG_TIMEOUT_MS,
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

    const section = candidates.find((element) => {
      return !candidates.some(
        (other) => element !== other && element.contains(other)
      );
    });

    const root = section || document;

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
    repairLocation = MRI_FAIL_REPAIR_LOCATION
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

    return (
      candidates.find((element) => {
        return !candidates.some(
          (other) => element !== other && element.contains(other)
        );
      }) || null
    );
  },

  isOptionSelected(option) {
    return (
      option.getAttribute("aria-selected") === "true" ||
      option.querySelector('input[type="checkbox"]')?.checked === true
    );
  },

  async waitForStepInput(stepName, shouldStop) {
    const core = window.MESCore;

    return core.waitForElement(() => {
      const sections = [...document.querySelectorAll("div, section, form")];

      const stepSection = sections.find((section) => {
        const text = section.innerText || "";
        return text.includes(stepName) && text.includes("Asset tag or serial number");
      });

      if (!stepSection) return null;

      return [...stepSection.querySelectorAll("input, textarea")].find((input) => {
        const placeholder = input.placeholder || "";

        return (
          /Scan asset tag or serial number/i.test(placeholder) &&
          core.isVisible(input) &&
          !core.isDisabled(input)
        );
      });
    }, core.DEFAULT_TIMEOUT_MS, shouldStop);
  }
};
