const LOCATOR_VERIFY_TIMEOUT_MS = 5000;
const LOCATOR_INPUT_SETTLE_MS = 150;

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

    // React-compatible value setter (same technique as core.typeAndSubmit).
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    // Clear any existing value first.
    nativeSetter.call(inputEl, "");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    // Enter the locator one character at a time. Some locator comboboxes react
    // to real incremental keyboard input rather than a single bulk value
    // assignment, so each character is entered with a full
    // keydown -> keypress -> value append -> input -> keyup sequence.
    let typed = "";

    for (const char of locator) {
      core.throwIfStopped(shouldStop);

      const keyInit = {
        key: char,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true
      };

      inputEl.dispatchEvent(new KeyboardEvent("keydown", keyInit));
      inputEl.dispatchEvent(new KeyboardEvent("keypress", keyInit));

      typed += char;
      nativeSetter.call(inputEl, typed);
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));

      inputEl.dispatchEvent(new KeyboardEvent("keyup", keyInit));
    }

    // Wait briefly for React to process the incremental input before navigating.
    await core.sleep(LOCATOR_INPUT_SETTLE_MS, shouldStop);

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
