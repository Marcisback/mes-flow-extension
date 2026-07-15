const LOCATOR_VERIFY_TIMEOUT_MS = 5000;

// Generic locator autocomplete selector. Single responsibility: given an
// already-located autocomplete input and a target locator string, type the
// locator, pick the matching suggestion, and confirm it committed. This helper
// is workflow-agnostic — it does not know whether it serves Move to Repair,
// Repair Started, or any future workflow. Callers locate their own input field
// and own their workflow-specific logging.
window.MESLocatorSelector = {
  // Select `locator` in the autocomplete owned by `inputEl`. Throws a
  // descriptive error if the suggestion never appears or the value does not
  // commit; returns nothing on success.
  async select(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    if (!inputEl) {
      throw new Error("Locator input element was not provided");
    }

    core.throwIfStopped(shouldStop);
    inputEl.focus();

    // Set the value React-compatibly (same technique as core.typeAndSubmit)
    // without submitting, clearing any existing value first.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(inputEl, "");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    nativeSetter.call(inputEl, locator);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    // Some locator comboboxes only open their suggestion listbox in response to
    // a keyboard event, not on input alone. Nudge it open with ArrowDown before
    // polling; this is harmless for comboboxes that already show suggestions.
    inputEl.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        code: "ArrowDown",
        keyCode: 40,
        which: 40,
        bubbles: true,
        cancelable: true
      })
    );

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

    // Verify the locator committed: selecting the suggestion sets the input's
    // value to the chosen locator. Poll until the field reflects it, so callers
    // can rely on a committed locator once select() returns.
    const committed = await core.waitForScoped(
      () => ((inputEl.value || "").includes(locator) ? inputEl : null),
      LOCATOR_VERIFY_TIMEOUT_MS,
      shouldStop
    );

    if (!committed) {
      throw new Error(`Locator "${locator}" was not committed after selection`);
    }
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
