const LOCATOR_VERIFY_TIMEOUT_MS = 5000;
const LOCATOR_INPUT_SETTLE_MS = 150;

// Generic locator autocomplete selector. Workflow-agnostic: callers locate their
// own input field and own their workflow-specific logging.
//
// Two commit paths are exposed because Meta's two locator comboboxes behave
// differently:
//   - Move to Repair opens its list from programmatic input, so select() drives
//     the whole thing automatically.
//   - Repair Started ignores programmatic input entirely, so its workflow
//     pre-fills the value with populate() and then relies on a human to open and
//     pick the suggestion, detected fail-closed by waitForManualCommit().
window.MESLocatorSelector = {
  // Automatic selection: type the locator, pick the matching suggestion, verify.
  // Used by comboboxes whose list opens on programmatic input (Move to Repair).
  async select(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    await this.populate(inputEl, locator, shouldStop);

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

  // Focus the input and populate the locator using the React-compatible native
  // setter. Shared by select() and by workflows that drive their own commit
  // (e.g. the Repair Started human checkpoint).
  async populate(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    if (!inputEl) {
      throw new Error("Locator input element was not provided");
    }

    if (!locator) {
      throw new Error("Locator string was empty; nothing to select");
    }

    core.throwIfStopped(shouldStop);
    inputEl.focus();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(inputEl, "");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    nativeSetter.call(inputEl, locator);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    await core.sleep(LOCATOR_INPUT_SETTLE_MS, shouldStop);
  },

  // Fail-closed detection of a MANUAL commit, for comboboxes that ignore
  // programmatic input. The populated value alone is never sufficient (we set
  // it), so a positive selection requires that the list actually opened (the
  // user engaged the autocomplete) AND then registered a selection — either an
  // explicit data-selected marker or the list closing with the matching option
  // no longer pending. Returns true only when a real selection is detected;
  // false on timeout.
  async waitForManualCommit(inputEl, locator, shouldStop) {
    const core = window.MESCore;
    const start = Date.now();
    let sawOpen = false;

    while (Date.now() - start < core.DEFAULT_TIMEOUT_MS) {
      core.throwIfStopped(shouldStop);

      const expanded = inputEl.getAttribute("aria-expanded") === "true";
      const pendingOption = this.findSuggestion(inputEl, locator);
      const open = expanded || Boolean(pendingOption);

      if (open) {
        sawOpen = true;
      }

      const valueReflects = (inputEl.value || "").includes(locator);
      const dataSelected = inputEl.getAttribute("data-selected") === "true";

      if (sawOpen && valueReflects && (dataSelected || !open)) {
        return true;
      }

      await core.sleep(LOCATOR_INPUT_SETTLE_MS, shouldStop);
    }

    return false;
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
