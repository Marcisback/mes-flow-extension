const LOCATOR_VERIFY_TIMEOUT_MS = 5000;
const LOCATOR_OPEN_TIMEOUT_MS = 5000;
const LOCATOR_NAV_DELAY_MS = 90;
const LOCATOR_MAX_NAV_ITERATIONS = 300;

// Generic locator selector. Workflow-agnostic: callers locate their own input
// field and own their workflow-specific logging.
//
// This drives the combobox purely through deterministic keyboard navigation —
// no autocomplete filtering, no dispatchClick, no clicking option DOM nodes:
// open with ArrowDown, walk the active option (aria-activedescendant) with
// ArrowDown, and commit the matching option with Enter.
window.MESLocatorSelector = {
  async select(inputEl, locator, shouldStop) {
    const core = window.MESCore;
    const log = window.MESLogger.log;

    if (!inputEl) {
      throw new Error("Locator input element was not provided");
    }

    if (!locator) {
      throw new Error("Locator string was empty; nothing to select");
    }

    core.throwIfStopped(shouldStop);

    // 1 + 2: click and focus the locator input (native input click only).
    inputEl.click();
    inputEl.focus();

    // 3: open the dropdown with a single ArrowDown.
    log("Locator: Opening dropdown");
    this.pressKey(inputEl, "ArrowDown", 40);

    // 4: wait until the dropdown is open with an active option.
    const opened = await core.waitForScoped(
      () =>
        inputEl.getAttribute("aria-expanded") === "true" &&
        inputEl.getAttribute("aria-activedescendant")
          ? inputEl
          : null,
      LOCATOR_OPEN_TIMEOUT_MS,
      shouldStop
    );

    if (!opened) {
      if (inputEl.getAttribute("aria-expanded") !== "true") {
        throw new Error(
          `Locator dropdown did not open (aria-expanded never true) for "${locator}"`
        );
      }

      throw new Error(
        `Locator dropdown has no active option (aria-activedescendant missing) for "${locator}"`
      );
    }

    // 5: navigate the options by keyboard, matching on the active option text.
    log("Locator: Searching...");

    const visited = new Set();
    const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
    let found = false;

    for (let i = 0; i < LOCATOR_MAX_NAV_ITERATIONS; i++) {
      core.throwIfStopped(shouldStop);

      const activeId = inputEl.getAttribute("aria-activedescendant");

      if (!activeId) {
        throw new Error(
          `Locator dropdown active option disappeared for "${locator}"`
        );
      }

      // Revisiting an active id means we have wrapped through the whole list.
      if (visited.has(activeId)) {
        throw new Error(`Locator "${locator}" was not found in dropdown.`);
      }

      visited.add(activeId);

      const option = document.getElementById(activeId);
      const text = normalize(option && option.textContent);

      if (text.includes(locator)) {
        log(`Locator: Found "${locator}"`);
        log("Locator: Pressing Enter");
        this.pressKey(inputEl, "Enter", 13);
        found = true;
        break;
      }

      this.pressKey(inputEl, "ArrowDown", 40);
      await core.sleep(LOCATOR_NAV_DELAY_MS, shouldStop);
    }

    if (!found) {
      throw new Error(
        `Locator "${locator}" navigation exceeded ${LOCATOR_MAX_NAV_ITERATIONS} iterations.`
      );
    }

    // Verification: confirm the field reflects the committed locator.
    const committed = await this.verifyCommitted(inputEl, locator, shouldStop);

    if (!committed) {
      throw new Error(`Locator "${locator}" was not committed after selection`);
    }

    log("Locator: Verified");
  },

  // Dispatch a full keydown + keyup for a navigation/commit key on the input.
  pressKey(inputEl, key, keyCode) {
    const init = {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    };

    inputEl.dispatchEvent(new KeyboardEvent("keydown", init));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", init));
  },

  async verifyCommitted(inputEl, locator, shouldStop) {
    const core = window.MESCore;

    const committed = await core.waitForScoped(
      () => ((inputEl.value || "").includes(locator) ? inputEl : null),
      LOCATOR_VERIFY_TIMEOUT_MS,
      shouldStop
    );

    return Boolean(committed);
  }
};
