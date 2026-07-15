// EOL workflow state detectors. Each stage is located by stable signals (scan
// placeholder text, button text) drawn from the shared core selectors, never
// generated CSS classes. Pure/read-only.
window.MESEolState = {
  findFirstScanInput() {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll("input, textarea")].find((el) => {
        return (
          core.selectors.firstScanText.test(el.placeholder || "") &&
          core.isVisible(el)
        );
      }) || null
    );
  },

  findStartButton() {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll(core.buttonSelector())].find((el) => {
        return (
          core.selectors.startButtonText.test(core.getElementText(el)) &&
          core.isVisible(el) &&
          !core.isDisabled(el)
        );
      }) || null
    );
  },

  findSecondScanInput() {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll("input, textarea")].find((el) => {
        return (
          (el.placeholder || "") === core.selectors.secondScanPlaceholder &&
          core.isVisible(el)
        );
      }) || null
    );
  },

  findConfirmWipeButton() {
    const core = window.MESCore;

    return (
      [...document.querySelectorAll(core.buttonSelector())].find((el) => {
        return (
          core.selectors.confirmWipeText.test(core.getElementText(el)) &&
          core.isVisible(el) &&
          !core.isDisabled(el)
        );
      }) || null
    );
  },

  isFirstScanStage() {
    return Boolean(this.findFirstScanInput());
  },

  isStartStage() {
    return Boolean(this.findStartButton());
  },

  isSecondScanStage() {
    return Boolean(this.findSecondScanInput());
  },

  isConfirmWipeStage() {
    return Boolean(this.findConfirmWipeButton());
  }
};
