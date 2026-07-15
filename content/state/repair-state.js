// Repair workflow state detectors, shared by Repair and Repair Cleanup. All
// detection relies on stable signals (headings, button text, aria-labels,
// roles), never generated CSS classes. Pure/read-only: no clicks, no waits.
window.MESRepairState = {
  selectors: {
    repairScanPlaceholder: /^Scan asset tag or serial number$/i,
    repairFailedText: /^Repair failed$/i,
    confirmRepairText: /^Confirm\s+repair$/i,
    eolText: /\bEOL\b|End of Line/i,
    wipeText: /\bWipe\b/i
  },

  // "Move to Repair" stage: a Move to Repair locator input plus the Confirm
  // move button.
  isMoveToRepairStage() {
    return Boolean(
      window.MESMoveToRepair.findMoveToRepairInput() &&
        this.findConfirmMoveButton()
    );
  },

  // "Repair Started" stage: the innermost Repair + Started section plus a
  // Repair failed control.
  isRepairStartedStage() {
    return Boolean(
      this.findRepairSection() && this.findRepairFailedButton(false)
    );
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

    return window.MESState.innermost(sections);
  },

  findRepairInput() {
    const core = window.MESCore;

    return [...document.querySelectorAll("input, textarea")].find((input) => {
      return (
        this.selectors.repairScanPlaceholder.test(input.placeholder || "") &&
        core.isVisible(input) &&
        !core.isDisabled(input)
      );
    }) || null;
  },

  // The locator autocomplete input on the Repair Started page. The locator is
  // the only autocomplete combobox on the page, so match it directly by its
  // stable ARIA (role="combobox" + aria-autocomplete="list") rather than
  // scoping through a section first. Exclude the plain asset-scan field so the
  // asset tag is never mistaken for the locator. Returns null when absent so
  // the caller fails safely before any asset is scanned.
  findRepairLocatorInput() {
    const core = window.MESCore;

    return [
      ...document.querySelectorAll(
        'input[role="combobox"][aria-autocomplete="list"]'
      )
    ].find((input) => {
      const isAssetScan = this.selectors.repairScanPlaceholder.test(
        input.placeholder || ""
      );

      return (
        !isAssetScan &&
        input.type !== "hidden" &&
        core.isVisible(input) &&
        !core.isDisabled(input)
      );
    }) || null;
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
    ) || null;
  },

  findConfirmMoveButton() {
    const core = window.MESCore;
    const button = document.querySelector('button[aria-label="Confirm move"]');

    return button && core.isVisible(button) ? button : null;
  },

  findConfirmRepairButton(requireClickable) {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll(core.buttonSelector())].find((button) => {
        return (
          this.selectors.confirmRepairText.test(core.getElementText(button)) &&
          core.isVisible(button) &&
          (!requireClickable || !core.isDisabled(button))
        );
      }) || null
    );
  },

  findLandingScanInput() {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll("input, textarea")].find((input) => {
        return (
          core.selectors.firstScanText.test(input.placeholder || "") &&
          core.isVisible(input)
        );
      }) || null
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
