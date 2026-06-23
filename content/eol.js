class MESStopError extends Error {
  constructor(message = "Stop requested") {
    super(message);
    this.name = "MESStopError";
  }
}

window.MESEOL = {
  DEFAULT_TIMEOUT_MS: 15000,
  STOP_CHECK_INTERVAL_MS: 100,

  selectors: {
    firstScanText: /Scan the asset tag|serial number to get started/i,
    secondScanPlaceholder: "Scan asset tag or serial number",
    startButtonText: /^Start$/i,
    confirmWipeText: /Confirm\s+wipe/i
  },

  async processAsset(asset, shouldStop) {
    const log = window.MESLogger.log;

    this.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await this.waitForInputByPlaceholderRegex(
      this.selectors.firstScanText,
      this.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.typeAndSubmit(scan1, asset, shouldStop);

    await this.sleep(1200, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    if (this.isAlreadyProcessedPage(asset)) {
      throw new window.MESAssetError("Already Processed");
    }

    this.throwIfStopped(shouldStop);

    const startButton = await this.waitForClickableByText(
      this.selectors.startButtonText,
      this.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.safeClick(startButton, shouldStop);
    await this.sleep(700, shouldStop);

    this.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const scan2 = await this.waitForInputByPlaceholderExact(
      this.selectors.secondScanPlaceholder,
      this.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.typeAndSubmit(scan2, asset, shouldStop);
    await this.sleep(700, shouldStop);

    this.throwIfStopped(shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    const confirmButton = await this.waitForClickableByText(
      this.selectors.confirmWipeText,
      this.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    await this.safeClick(confirmButton, shouldStop);

    await this.sleep(1200, shouldStop);

    await window.MESPopupHandler.closePopupIfPresent();

    this.throwIfStopped(shouldStop);

    log(`Done: ${asset}`);
  },

  isAlreadyProcessedPage(asset) {
    if (!asset) return false;

    const pageText = document.body.innerText || "";

    const assetRegex = new RegExp(`\\b${asset}\\b`, "i");

    return (
      assetRegex.test(pageText) &&
      /\bEOL\b/i.test(pageText) &&
      /Move instruction/i.test(pageText) &&
      /\bWipe\b/i.test(pageText)
    );
  },

  async typeAndSubmit(input, value, shouldStop) {
    this.throwIfStopped(shouldStop);

    input.focus();
    input.click();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    this.throwIfStopped(shouldStop);

    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await this.sleep(150, shouldStop);

    this.throwIfStopped(shouldStop);

    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      input.dispatchEvent(
        new KeyboardEvent(eventType, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );
    });

    await this.sleep(400, shouldStop);
  },

  async waitForInputByPlaceholderRegex(
    regex,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return regex.test(el.placeholder || "") && this.isVisible(el);
      });
    }, timeoutMs, shouldStop);
  },

  async waitForInputByPlaceholderExact(
    placeholder,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return (el.placeholder || "") === placeholder && this.isVisible(el);
      });
    }, timeoutMs, shouldStop);
  },

  async waitForClickableByText(
    regex,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      const candidates = [
        ...document.querySelectorAll(
          "button, [role='button'], input[type='button'], input[type='submit']"
        )
      ];

      return candidates.find((el) => {
        const text = (
          el.innerText ||
          el.textContent ||
          el.value ||
          el.getAttribute("aria-label") ||
          ""
        ).trim();

        return regex.test(text) && this.isVisible(el) && !this.isDisabled(el);
      });
    }, timeoutMs, shouldStop);
  },

  async safeClick(element, shouldStop) {
    this.throwIfStopped(shouldStop);

    element.scrollIntoView({ block: "center", inline: "center" });

    await this.sleep(150, shouldStop);

    this.throwIfStopped(shouldStop);

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

    this.throwIfStopped(shouldStop);

    element.dispatchEvent(new MouseEvent("mouseup", clickOptions));
    element.dispatchEvent(new MouseEvent("click", clickOptions));

    await this.sleep(350, shouldStop);
  },

  async waitForElement(findFn, timeoutMs, shouldStop) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      this.throwIfStopped(shouldStop);

      await window.MESPopupHandler.closePopupIfPresent();

      this.throwIfStopped(shouldStop);

      const element = findFn();

      if (element) {
        return element;
      }

      await this.sleep(250, shouldStop);
    }

    throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for element`);
  },

  throwIfStopped(shouldStop) {
    if (typeof shouldStop === "function" && shouldStop()) {
      throw new MESStopError();
    }
  },

  isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  },

  isDisabled(element) {
    return (
      element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      element.classList.contains("disabled")
    );
  },

  async sleep(ms, shouldStop) {
    const start = Date.now();

    while (Date.now() - start < ms) {
      this.throwIfStopped(shouldStop);

      const remaining = ms - (Date.now() - start);
      const delay = Math.min(this.STOP_CHECK_INTERVAL_MS, remaining);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

window.MESStopError = MESStopError;