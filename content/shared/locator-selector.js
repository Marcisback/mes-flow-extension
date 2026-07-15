const LOCATOR_VERIFY_TIMEOUT_MS = 5000;

// Generic locator autocomplete selector. Workflow-agnostic: callers locate their
// own input field and own their workflow-specific logging. It types the locator
// via MESCore.typeHuman (genuine incremental typing), picks the matching
// suggestion, and verifies the commit. Throws a descriptive error on any
// failure.
window.MESLocatorSelector = {
  async select(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    if (!inputEl) {
      throw new Error("Locator input element was not provided");
    }

    if (!locator) {
      throw new Error("Locator string was empty; nothing to select");
    }

    // Genuine incremental typing — some autocompletes ignore a bulk value set.
    await core.typeHuman(inputEl, locator, shouldStop);

    const suggestion = await core.waitForScoped(
      () => this.findSuggestion(inputEl, locator),
      core.DEFAULT_TIMEOUT_MS,
      shouldStop
    );

    if (!suggestion) {
      throw new Error(
        `Locator autocomplete suggestion for "${locator}" did not appear`
      );
    }

    await core.dispatchClick(suggestion, 75, 300, shouldStop);

    const committed = await this.verifyCommitted(inputEl, locator, shouldStop);

    if (!committed) {
      throw new Error(`Locator "${locator}" was not committed after selection`);
    }
  },

  async verifyCommitted(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    const committed = await core.waitForScoped(
      () => ((inputEl.value || "").includes(locator) ? inputEl : null),
      LOCATOR_VERIFY_TIMEOUT_MS,
      shouldStop
    );

    return Boolean(committed);
  },

  findSuggestion(inputEl, locator) {
    const core = window.MESCore;

    // Resolve the popup owned by the input (its id is dynamic and read at
    // runtime); fall back to the first document listbox only if the input
    // exposes no owned popup. Match the visible suggestion whose text contains
    // the locator rather than a generated CSS class name.
    const listboxId =
      inputEl.getAttribute("aria-controls") ||
      inputEl.getAttribute("aria-owns");

    const listbox =
      (listboxId && document.getElementById(listboxId)) ||
      document.querySelector('[role="listbox"]');

    if (!listbox) {
      return null;
    }

    return (
      [...listbox.querySelectorAll('[role="option"]')].find(
        (option) =>
          core.isVisible(option) &&
          (option.textContent || "").includes(locator)
      ) || null
    );
  }
};
