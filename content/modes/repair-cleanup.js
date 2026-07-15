const REPAIR_SHORT_DELAY_MS = 150;
const REPAIR_FINAL_SETTLE_MS = 400;
const REPAIR_STATE_TIMEOUT_MS = 2500;
const REPAIR_POLL_MS = 100;

window.MESRepairCleanup = {
  selectors: {
    repairScanPlaceholder: /^Scan asset tag or serial number$/i,
    repairFailedText: /^Repair failed$/i,
    eolText: /\bEOL\b|End of Line/i,
    wipeText: /\bWipe\b/i
  },

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

    const repairState = await this.waitForRepairState(shouldStop);

    if (repairState.type === "pastRepair") {
      throw new window.MESAssetError("Already past Repair");
    }

    if (repairState.type !== "repair") {
      throw new window.MESAssetError("Repair state not found");
    }

    await eol.typeAndSubmit(repairState.repairInput, asset, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const repairFailedButton = await this.waitForRepairFailedButton(shouldStop);

    await this.fastClick(repairFailedButton, shouldStop);
    await eol.sleep(REPAIR_FINAL_SETTLE_MS, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    eol.throwIfStopped(shouldStop);
    log(`Done: ${asset}`);
  },

  isRepairStartedState(asset) {
    void asset;

    return Boolean(this.findRepairSection() && this.findRepairInput());
  },

  async waitForRepairState(shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      eol.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      eol.throwIfStopped(shouldStop);

      const repairSection = this.findRepairSection();
      const repairInput = this.findRepairInput();

      if (repairSection && repairInput) {
        return {
          type: "repair",
          repairInput
        };
      }

      if (
        this.isPastRepairStateVisible() &&
        !repairSection &&
        !repairInput
      ) {
        return {
          type: "pastRepair"
        };
      }

      await eol.sleep(REPAIR_POLL_MS, shouldStop);
    }

    return {
      type: "missing"
    };
  },

  async waitForRepairFailedButton(shouldStop) {
    const eol = window.MESEOL;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      eol.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      eol.throwIfStopped(shouldStop);

      const repairFailedButton = this.findRepairFailedButton(true);

      if (repairFailedButton) {
        return repairFailedButton;
      }

      await eol.sleep(REPAIR_POLL_MS, shouldStop);
    }

    throw new window.MESAssetError("Repair failed button not enabled");
  },

  async fastClick(element, shouldStop) {
    const eol = window.MESEOL;

    eol.throwIfStopped(shouldStop);

    element.scrollIntoView({ block: "center", inline: "center" });

    await eol.sleep(REPAIR_SHORT_DELAY_MS, shouldStop);

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

    await eol.sleep(REPAIR_SHORT_DELAY_MS, shouldStop);
  },

  findRepairSection() {
    const sections = [
      ...document.querySelectorAll(
        "section, form, article, [role='region'], [role='group'], div"
      )
    ].filter((section) => {
      const text = this.getElementText(section);

      return (
        window.MESEOL.isVisible(section) &&
        /\bRepair\b/i.test(text) &&
        /\bStarted\b/i.test(text)
      );
    });

    return sections.find((section) => {
      return !sections.some((other) => {
        return section !== other && section.contains(other);
      });
    }) || null;
  },

  findRepairInput() {
    const eol = window.MESEOL;

    return [...document.querySelectorAll("input, textarea")].find((input) => {
      return (
        this.selectors.repairScanPlaceholder.test(input.placeholder || "") &&
        eol.isVisible(input) &&
        !eol.isDisabled(input)
      );
    });
  },

  findRepairFailedButton(requireClickable) {
    const eol = window.MESEOL;

    return [...document.querySelectorAll(this.buttonSelector())].find(
      (button) => {
        return (
          this.selectors.repairFailedText.test(this.getElementText(button)) &&
          eol.isVisible(button) &&
          (!requireClickable || !eol.isDisabled(button))
        );
      }
    );
  },

  isPastRepairStateVisible() {
    return [...document.querySelectorAll("h1, h2, h3, h4, span, div, label")]
      .some((element) => {
        const text = this.getElementText(element);

        return (
          window.MESEOL.isVisible(element) &&
          text.length <= 80 &&
          (this.selectors.eolText.test(text) ||
            this.selectors.wipeText.test(text))
        );
      });
  },

  buttonSelector() {
    return "button, [role='button'], input[type='button'], input[type='submit']";
  },

  getElementText(element) {
    return (
      element.innerText ||
      element.textContent ||
      element.value ||
      element.getAttribute("aria-label") ||
      ""
    ).trim();
  }
};
