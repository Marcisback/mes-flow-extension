// MRI workflow state detectors. The Wipe and Diagnostic stages both present the
// same scan input inside a step-labeled section; findStepInput locates it by the
// stable step heading text and input placeholder (never generated CSS classes).
window.MESMriState = {
  findStepInput(stepName) {
    const core = window.MESCore;

    const sections = [...document.querySelectorAll("div, section, form")];

    const stepSection = sections.find((section) => {
      const text = section.innerText || "";
      return (
        text.includes(stepName) &&
        text.includes("Asset tag or serial number")
      );
    });

    if (!stepSection) {
      return null;
    }

    return (
      [...stepSection.querySelectorAll("input, textarea")].find((input) => {
        const placeholder = input.placeholder || "";

        return (
          /Scan asset tag or serial number/i.test(placeholder) &&
          core.isVisible(input) &&
          !core.isDisabled(input)
        );
      }) || null
    );
  },

  isWipeStage() {
    return Boolean(this.findStepInput("Wipe"));
  },

  isDiagnosticStage() {
    return Boolean(this.findStepInput("Diagnostic"));
  }
};
