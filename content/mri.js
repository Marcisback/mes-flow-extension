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
    await eol.sleep(700, shouldStop);

    const wipeScan = await eol.waitForInputByPlaceholderExact(
      eol.selectors.secondScanPlaceholder,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.typeAndSubmit(wipeScan, asset, shouldStop);
    await eol.sleep(700, shouldStop);

    const confirmWipeButton = await eol.waitForClickableByText(
      /Confirm\s+wipe/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(confirmWipeButton, shouldStop);
    await eol.sleep(1500, shouldStop);

    const diagnosticScan = await eol.waitForInputByPlaceholderExact(
      eol.selectors.secondScanPlaceholder,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.typeAndSubmit(diagnosticScan, asset, shouldStop);
    await eol.sleep(700, shouldStop);

    const confirmDiagnosticButton = await eol.waitForClickableByText(
      /Confirm\s+diagnostic/i,
      eol.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await eol.safeClick(confirmDiagnosticButton, shouldStop);
    await eol.sleep(1200, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    eol.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
  }
};