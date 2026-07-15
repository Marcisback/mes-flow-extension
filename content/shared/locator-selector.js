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

    // ---- TEMPORARY DIAGNOSTIC HARNESS ------------------------------------
    // Throwaway debugging: run a fixed sequence of commit gestures, verifying
    // after each with the existing verifyCommitted(), and stop at the first
    // that commits. Discovers which interaction Meta's autocomplete accepts.
    // The suggestion lookup above and verifyCommitted() below are the existing
    // helpers, unchanged.
    const log = window.MESLogger.log;

    const pressableSelector =
      '[data-pressable-container], [data-interactive-id], button, [role="button"]';

    const getOption = () => this.findSuggestion(inputEl, locator);

    const centre = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
    };

    const pointer = (type, node, buttons) => {
      const Ctor =
        typeof PointerEvent === "function" ? PointerEvent : MouseEvent;

      node.dispatchEvent(
        new Ctor(type, {
          bubbles: type !== "pointerenter",
          cancelable: true,
          view: window,
          ...centre(node),
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons
        })
      );
    };

    const mouse = (type, node, buttons) => {
      node.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          ...centre(node),
          button: 0,
          buttons
        })
      );
    };

    const key = (type, node, keyName, code, keyCode) => {
      node.dispatchEvent(
        new KeyboardEvent(type, {
          key: keyName,
          code,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        })
      );
    };

    // Each strategy performs EXACTLY ONE commit gesture and nothing else. The
    // loop below owns the verify/log/stop control flow, so strategies stay
    // isolated to their single interaction.
    const strategies = [
      // Strategy 1: current implementation — MESCore.dispatchClick(option).
      async () => {
        const option = getOption();
        if (option) {
          await core.dispatchClick(option, 75, 300, shouldStop);
        }
      },
      // Strategy 2: PointerEvents on the option; no element.focus().
      async () => {
        const option = getOption();
        if (!option) return;
        pointer("pointerover", option, 0);
        pointer("pointerenter", option, 0);
        pointer("pointerdown", option, 1);
        pointer("pointerup", option, 0);
        mouse("click", option, 0);
      },
      // Strategy 3: PointerEvents on the nearest pressable ancestor.
      async () => {
        const option = getOption();
        const target = option && option.closest(pressableSelector);
        if (!target) return;
        pointer("pointerover", target, 0);
        pointer("pointerenter", target, 0);
        pointer("pointerdown", target, 1);
        pointer("pointerup", target, 0);
        mouse("click", target, 0);
      },
      // Strategy 4: Enter on the input; keep focus on the input, no click.
      async () => {
        inputEl.focus();
        key("keydown", inputEl, "Enter", "Enter", 13);
        key("keyup", inputEl, "Enter", "Enter", 13);
      },
      // Strategy 5: Tab on the input; keep focus on the input.
      async () => {
        inputEl.focus();
        key("keydown", inputEl, "Tab", "Tab", 9);
        key("keyup", inputEl, "Tab", "Tab", 9);
      },
      // Strategy 6: option.click() directly; no focus changes.
      async () => {
        const option = getOption();
        if (option) option.click();
      },
      // Strategy 7: Mouse events only on the option; no element.focus().
      async () => {
        const option = getOption();
        if (!option) return;
        mouse("mouseover", option, 0);
        mouse("mousedown", option, 1);
        mouse("mouseup", option, 0);
        mouse("click", option, 0);
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      const n = i + 1;

      core.throwIfStopped(shouldStop);
      log(`Locator Strategy ${n}...`);

      await strategies[i]();

      // Wait briefly (existing timing), then run the existing commit check.
      await core.sleep(LOCATOR_INPUT_SETTLE_MS, shouldStop);

      if (await this.verifyCommitted(inputEl, locator, shouldStop)) {
        log(`Locator Strategy ${n} SUCCESS`);
        return;
      }

      log(`Locator Strategy ${n} FAILED`);
    }

    log("Locator: All strategies failed");
    throw new Error(`Locator "${locator}" was not committed after selection`);
  },

  // Existing commit verification, extracted so the diagnostic harness can call
  // it after each strategy: poll (existing timeout) until the field reflects the
  // chosen locator; return a boolean so the caller can branch.
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
