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

    const repairState = await this.waitForRepairState(shouldStop);

    if (repairState.type === "pastRepair") {
      throw new window.MESAssetError("Already past Repair");
    }

    if (repairState.type !== "repair") {
      throw new window.MESAssetError("Repair state not found");
    }

    await core.typeAndSubmit(repairState.repairInput, asset, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    const repairFailedButton = await this.waitForRepairFailedButton(shouldStop);

    await core.dispatchClick(repairFailedButton, 150, 150, shouldStop);
    await core.sleep(REPAIR_FINAL_SETTLE_MS, shouldStop);
    await window.MESPopupHandler.closePopupIfPresent();

    core.throwIfStopped(shouldStop);
    log(`Done: ${asset}`);
  },

  isRepairStartedState(asset) {
    void asset;

    return Boolean(this.findRepairSection() && this.findRepairInput());
  },

  async waitForRepairState(shouldStop) {
    const core = window.MESCore;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

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

      await core.sleep(REPAIR_POLL_MS, shouldStop);
    }

    return {
      type: "missing"
    };
  },

  async waitForRepairFailedButton(shouldStop) {
    const core = window.MESCore;
    const start = Date.now();

    while (Date.now() - start < REPAIR_STATE_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);
      await window.MESPopupHandler.closePopupIfPresent();
      core.throwIfStopped(shouldStop);

      const repairFailedButton = this.findRepairFailedButton(true);

      if (repairFailedButton) {
        return repairFailedButton;
      }

      await core.sleep(REPAIR_POLL_MS, shouldStop);
    }

    throw new window.MESAssetError("Repair failed button not enabled");
  },

  findRepairSection() {
    const core = window.MESCore;

    const sections = [
      ...document.querySelectorAll(
        "section, form, article, [role='region'], [role='group'], div"
      )
    ].filter((section) => {
      const text = core.getElementText(section);

      return (
        core.isVisible(section) &&
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
    const core = window.MESCore;

    return [...document.querySelectorAll("input, textarea")].find((input) => {
      return (
        this.selectors.repairScanPlaceholder.test(input.placeholder || "") &&
        core.isVisible(input) &&
        !core.isDisabled(input)
      );
    });
  },

  findRepairFailedButton(requireClickable) {
    const core = window.MESCore;

    return [...document.querySelectorAll(core.buttonSelector())].find(
      (button) => {
        return (
          this.selectors.repairFailedText.test(core.getElementText(button)) &&
          core.isVisible(button) &&
          (!requireClickable || !core.isDisabled(button))
        );
      }
    );
  },

  isPastRepairStateVisible() {
    const core = window.MESCore;

    return [...document.querySelectorAll("h1, h2, h3, h4, span, div, label")]
      .some((element) => {
        const text = core.getElementText(element);

        return (
          core.isVisible(element) &&
          text.length <= 80 &&
          (this.selectors.eolText.test(text) ||
            this.selectors.wipeText.test(text))
        );
      });
  }
};
