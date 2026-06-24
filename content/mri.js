window.MESMRI = {
  async processAsset(asset, shouldStop) {
    const eol = window.MESEOL;
    const log = window.MESLogger.log;

    eol.throwIfStopped(shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await eol.waitForInputByPlaceholderRegex(
      eol.selectors.firstScanText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.typeAndSubmit(scan1, asset, shouldStop);
    await eol.sleep(1200, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const startButton = await eol.waitForClickableByText(
      eol.selectors.startButtonText,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(startButton, shouldStop);
    await eol.sleep(900, shouldStop);

    const wipeScan = await this.waitForStepInput("Wipe", shouldStop);

    await eol.typeAndSubmit(wipeScan, asset, shouldStop);
    await eol.sleep(900, shouldStop);

    const confirmWipeButton = await eol.waitForClickableByText(
      /Confirm\s+wipe/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(confirmWipeButton, shouldStop);
    await eol.sleep(2000, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const diagnosticScan = await this.waitForStepInput("Diagnostic", shouldStop);

    await eol.typeAndSubmit(diagnosticScan, asset, shouldStop);
    await eol.sleep(1200, shouldStop);

    const confirmDiagnosticButton = await eol.waitForClickableByText(
      /Confirm\s+diagnostic/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(confirmDiagnosticButton, shouldStop);
    await eol.sleep(1500, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();
    eol.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
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