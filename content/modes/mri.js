const MRI_SHORT_DELAY_MS = 250;
const MRI_SETTLE_MS = 300;
const MRI_FINAL_SETTLE_MS = 500;
const MRI_FAIL_POLL_MS = 150;
const MRI_FAIL_DIALOG_TIMEOUT_MS = 10000;
const MRI_FAIL_OPTION_TIMEOUT_MS = 8000;
const MRI_FAIL_REASON_LABEL = "Phone - Display";
const MRI_FAIL_REPAIR_LOCATION = "NEW102-SMOBILE1-TECH-09-F01";

window.MESMRI = {
  // options.diagnosticOutcome: "success" (default, existing MRI) | "failure" (MRI (FAIL) mode).
  async processAsset(asset, shouldStop, options = {}) {
    const eol = window.MESEOL;
    const log = window.MESLogger.log;
    const diagnosticOutcome = options.diagnosticOutcome ?? "success";

    eol.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await eol.waitForInputByPlaceholderRegex(
      eol.selectors.firstScanText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.typeAndSubmit(scan1, asset, shouldStop);
    await eol.sleep(MRI_SHORT_DELAY_MS, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const startButton = await eol.waitForClickableByText(
      eol.selectors.startButtonText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(startButton, shouldStop);
    await eol.sleep(MRI_SHORT_DELAY_MS, shouldStop);

    const wipeScan = await this.waitForStepInput("Wipe", shouldStop);

    await eol.typeAndSubmit(wipeScan, asset, shouldStop);

    const confirmWipeButton = await eol.waitForClickableByText(
      /Confirm\s+wipe/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.fastClick(confirmWipeButton, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    if (diagnosticOutcome === "failure") {
      log("MRI (FAIL): Wipe stage completed");
    }

    const diagnosticScan = await this.waitForStepInput("Diagnostic", shouldStop);

    await eol.typeAndSubmit(diagnosticScan, asset, shouldStop);

    if (diagnosticOutcome === "failure") {
      await this.completeFailedDiagnostic(asset, shouldStop);
      return;
    }

    const confirmDiagnosticButton = await eol.waitForClickableByText(
      /Confirm\s+diagnostic/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.fastClick(confirmDiagnosticButton, shouldStop);
    await eol.sleep(MRI_FINAL_SETTLE_MS, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();
    eol.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
  },

  // MRI (FAIL) diagnostic branch: reject the diagnostic with a fixed failure
  // reason instead of confirming it, then move the asset to a repair location.
  async completeFailedDiagnostic(asset, shouldStop) {
    const eol = window.MESEOL;
    const log = window.MESLogger.log;

    const failedButton = await this.waitForFailureElement(
      () => document.querySelector('button[aria-label="Diagnostic failed"]'),
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!failedButton) {
      throw new Error("Diagnostic failed button not found");
    }

    if (eol.isDisabled(failedButton)) {
      throw new Error("Diagnostic failed button is disabled");
    }

    await this.fastClick(failedButton, shouldStop);

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
    const eol = window.MESEOL;
    const log = window.MESLogger.log;

    const dialog = await this.waitForFailureElement(
      () => this.findFailureReasonDialog(),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!dialog) {
      throw new Error("Failure reason dialog did not appear");
    }

    log(`${logPrefix}: Diagnostic failure dialog opened`);

    const combobox = await this.waitForFailureElement(
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

    if (eol.isDisabled(combobox)) {
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

      const expanded = await this.waitForFailureElement(
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

    const option = await this.waitForFailureElement(
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
      await this.fastClick(option, shouldStop);
    }

    // Verify selection, preferring aria-selected, then the combobox display,
    // then the nested checkbox (covered by isOptionSelected).
    const confirmedSelection = await this.waitForFailureElement(
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

    const confirmButton = await this.waitForFailureElement(
      () => dialog.querySelector('button[aria-label="Confirm failure"]'),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmButton) {
      throw new Error("Confirm failure button not found");
    }

    const enabledConfirm = await this.waitForFailureElement(
      () => (!eol.isDisabled(confirmButton) ? confirmButton : null),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!enabledConfirm) {
      throw new Error("Confirm failure button remained disabled");
    }

    await this.fastClick(confirmButton, shouldStop);

    const dialogClosed = await this.waitForFailureElement(
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
    const eol = window.MESEOL;
    const log = window.MESLogger.log;

    const locationInput = await this.waitForFailureElement(
      () => this.findMoveToRepairInput(),
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!locationInput) {
      throw new Error("Move to Repair location input not found");
    }

    eol.throwIfStopped(shouldStop);
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

    const suggestion = await this.waitForFailureElement(
      () => this.findRepairLocationSuggestion(locationInput, repairLocation),
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!suggestion) {
      throw new Error("Move to Repair location suggestion did not appear");
    }

    await this.fastClick(suggestion, shouldStop);

    log("MRI (FAIL): Selected repair location");

    const confirmMove = await this.waitForFailureElement(
      () => document.querySelector('button[aria-label="Confirm move"]'),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!confirmMove) {
      throw new Error("Confirm move button not found");
    }

    const enabledMove = await this.waitForFailureElement(
      () => (!eol.isDisabled(confirmMove) ? confirmMove : null),
      MRI_FAIL_DIALOG_TIMEOUT_MS,
      shouldStop
    );

    if (!enabledMove) {
      throw new Error("Confirm move button never enabled");
    }

    await this.fastClick(confirmMove, shouldStop);

    const advanced = await this.waitForFailureElement(
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
    const eol = window.MESEOL;

    // Innermost container that mentions the step and holds an input, matching
    // the scoping approach used by findFailureReasonDialog.
    const candidates = [
      ...document.querySelectorAll("div, section, form")
    ].filter((element) => {
      return (
        eol.isVisible(element) &&
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
          eol.isVisible(input) &&
          !eol.isDisabled(input)
        );
      }) || null
    );
  },

  findRepairLocationSuggestion(
    locationInput,
    repairLocation = MRI_FAIL_REPAIR_LOCATION
  ) {
    const eol = window.MESEOL;

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
          eol.isVisible(option) &&
          (option.textContent || "").includes(repairLocation)
      ) || null
    );
  },

  findFailureReasonDialog() {
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
        window.MESEOL.isVisible(element) &&
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

  // Scoped poller for the failure dialog. Unlike eol.waitForElement it does not
  // run closePopupIfPresent, which would click the dialog's Cancel/Close button
  // and dismiss the modal we are interacting with. Returns null on timeout so
  // callers can raise a specific error.
  async waitForFailureElement(findFn, timeoutMs, shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      eol.throwIfStopped(shouldStop);

      const result = findFn();

      if (result) {
        return result;
      }

      await eol.sleep(MRI_FAIL_POLL_MS, shouldStop);
    }

    return null;
  },

  async fastClick(element, shouldStop) {
    const eol = window.MESEOL;

    eol.throwIfStopped(shouldStop);

    element.scrollIntoView({ block: "center", inline: "center" });

    await eol.sleep(75, shouldStop);

    eol.throwIfStopped(shouldStop);

    element.focus();

    const rect = element.getBoundingClientRect();

    const clickOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    element.dispatchEvent(new MouseEvent("mouseover", clickOptions));
    element.dispatchEvent(new MouseEvent("mousedown", clickOptions));

    eol.throwIfStopped(shouldStop);

    element.dispatchEvent(new MouseEvent("mouseup", clickOptions));
    element.dispatchEvent(new MouseEvent("click", clickOptions));

    await eol.sleep(MRI_SETTLE_MS, shouldStop);
  },

  async waitForStepInput(stepName, shouldStop) {
    const eol = window.MESEOL;

    return eol.waitForElement(() => {
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
          eol.isVisible(input) &&
          !eol.isDisabled(input)
        );
      });
    }, eol.DEFAULT_TIMEOUT_MS, shouldStop);
  }
};
