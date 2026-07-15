const MRI_SHORT_DELAY_MS = 250;
const MRI_FINAL_SETTLE_MS = 500;

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
  // Both steps are shared workflow actions (MESFailureDialog / MESMoveToRepair).
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

    await window.MESFailureDialog.complete(shouldStop);

    await window.MESMoveToRepair.complete(shouldStop);

    log(`Done: ${asset}`);
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
