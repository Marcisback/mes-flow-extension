window.MESEOL = {
  selectors: {
    firstScanText: /Scan the asset tag|serial number to get started/i,
    secondScanPlaceholder: "Scan asset tag or serial number",
    startButtonText: /^Start$/i,
    confirmWipeText: /^Confirm wipe$/i
  },

  async processAsset(asset, shouldStop) {
    const log = window.MESLogger.log;

    if (shouldStop()) return;

    await window.MESPopupHandler.closePopupIfPresent();

    const scan1 = await this.waitForInputByPlaceholderRegex(
      this.selectors.firstScanText
    );

    await this.typeAndSubmit(scan1, asset);

    if (shouldStop()) return;

    await window.MESPopupHandler.closePopupIfPresent();

    const startButton = await this.waitForButtonByText(
      this.selectors.startButtonText
    );

    startButton.click();

    await this.sleep(300);

    if (shouldStop()) return;

    await window.MESPopupHandler.closePopupIfPresent();

    const scan2 = await this.waitForInputByPlaceholderExact(
      this.selectors.secondScanPlaceholder
    );

    await this.typeAndSubmit(scan2, asset);

    if (shouldStop()) return;

    await window.MESPopupHandler.closePopupIfPresent();

    const confirmButton = await this.waitForButtonByText(
      this.selectors.confirmWipeText
    );

    confirmButton.click();

    await this.sleep(300);

    await window.MESPopupHandler.closePopupIfPresent();

    log(`Done: ${asset}`);
  },

  async typeAndSubmit(input, value) {
    input.focus();
    input.value = "";

    input.dispatchEvent(new Event("input", { bubbles: true }));

    input.value = value;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true
    }));
    input.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      bubbles: true
    }));
  },

  async waitForInputByPlaceholderRegex(regex, timeoutMs = 30000) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return regex.test(el.placeholder || "") && this.isVisible(el);
      });
    }, timeoutMs);
  },

  async waitForInputByPlaceholderExact(placeholder, timeoutMs = 30000) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return (el.placeholder || "") === placeholder && this.isVisible(el);
      });
    }, timeoutMs);
  },

  async waitForButtonByText(regex, timeoutMs = 30000) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("button")].find((button) => {
        return regex.test(button.innerText.trim()) && this.isVisible(button);
      });
    }, timeoutMs);
  },

  async waitForElement(findFn, timeoutMs) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const element = findFn();

      if (element) return element;

      await this.sleep(200);
    }

    throw new Error("Timed out waiting for element");
  },

  isVisible(element) {
    const rect = element.getBoundingClientRect();

    return Boolean(
      rect.width &&
      rect.height &&
      window.getComputedStyle(element).visibility !== "hidden"
    );
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};