const MRI_SHORT_DELAY_MS = 250;
const MRI_SETTLE_MS = 300;
const MRI_FINAL_SETTLE_MS = 500;

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

    const diagnosticScan = await this.waitForStepInput("Diagnostic", shouldStop);

    await eol.typeAndSubmit(diagnosticScan, asset, shouldStop);

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
