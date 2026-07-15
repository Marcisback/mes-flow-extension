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

    if (!locator) {
      throw new Error("Locator string was empty; nothing to select");
    }

    core.throwIfStopped(shouldStop);
    inputEl.focus();

    // React-compatible value setter (same technique as core.typeAndSubmit).
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    // Set the complete locator, then let React commit the value.
    nativeSetter.call(inputEl, locator);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    await core.sleep(LOCATOR_INPUT_SETTLE_MS, shouldStop);

    // Live testing shows this autocomplete only opens its list when the
    // committed value is *edited* — a bulk set (even followed by ArrowDown) and
    // a full character-by-character replay do not trigger it. So place the caret
    // at the end, delete the final character with a realistic Backspace, then
    // re-enter that same character, mirroring the exact edit a user makes.
    const finalChar = locator.slice(-1);
    const withoutFinal = locator.slice(0, -1);

    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);

    // Dispatch an input event carrying inputType (and data) when InputEvent is
    // available; fall back to a plain bubbling input event otherwise.
    const dispatchInput = (inputType, data) => {
      const event =
        typeof InputEvent === "function"
          ? new InputEvent("input", { bubbles: true, inputType, data })
          : new Event("input", { bubbles: true });

      inputEl.dispatchEvent(event);
    };

    const backspaceInit = {
      key: "Backspace",
      code: "Backspace",
      keyCode: 8,
      which: 8,
      bubbles: true,
      cancelable: true
    };

    // Remove the final character (Backspace edit).
    inputEl.dispatchEvent(new KeyboardEvent("keydown", backspaceInit));
    nativeSetter.call(inputEl, withoutFinal);
    dispatchInput("deleteContentBackward", null);
    inputEl.dispatchEvent(new KeyboardEvent("keyup", backspaceInit));

    // Re-enter the original final character.
    const finalKeyInit = {
      key: finalChar,
      keyCode: finalChar.charCodeAt(0),
      which: finalChar.charCodeAt(0),
      bubbles: true,
      cancelable: true
    };

    inputEl.dispatchEvent(new KeyboardEvent("keydown", finalKeyInit));
    inputEl.dispatchEvent(new KeyboardEvent("keypress", finalKeyInit));
    nativeSetter.call(inputEl, locator);
    dispatchInput("insertText", finalChar);
    inputEl.dispatchEvent(new KeyboardEvent("keyup", finalKeyInit));

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
