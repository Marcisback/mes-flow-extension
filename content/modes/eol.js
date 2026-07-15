// EOL mode workflow. The shared toolkit now lives in content/shared/core.js
// (MESCore); this file only describes the EOL step sequence.
window.MESEOL = {
  async processAsset(asset, shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    core.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await core.waitForInputByPlaceholderRegex(
      core.selectors.firstScanText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.typeAndSubmit(scan1, asset, shouldStop);
    await core.sleep(1200, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    core.throwIfStopped(shouldStop);

    const startButton = await core.waitForClickableByText(
      core.selectors.startButtonText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(startButton, 150, 350, shouldStop);
    await core.sleep(700, shouldStop);

    core.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const scan2 = await core.waitForInputByPlaceholderExact(
      core.selectors.secondScanPlaceholder,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.typeAndSubmit(scan2, asset, shouldStop);
    await core.sleep(700, shouldStop);

    core.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const confirmButton = await core.waitForClickableByText(
      core.selectors.confirmWipeText,
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await core.dispatchClick(confirmButton, 150, 350, shouldStop);
    await core.sleep(1200, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    core.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
  }
};
