// Shared content-script toolkit. Every mode, state detector, and workflow
// helper depends on this module, so it must load before them (see manifest
// order). This is a verbatim extraction of the former MESEOL toolkit, with the
// three per-mode click implementations unified into a single dispatchClick that
// takes the pre/post delays as arguments so each caller keeps its exact timing.

class MESStopError extends Error {
  constructor(message = "Stop requested") {
    super(message);
    this.name = "MESStopError";
  }
}

// Poll interval for the scoped poller (waitForScoped). Matches the former
// MRI_FAIL_POLL_MS so failure-dialog polling cadence is unchanged.
const CORE_SCOPED_POLL_MS = 150;

// Poll interval for the popup-closing poller (waitForElement).
const CORE_ELEMENT_POLL_MS = 250;

// Delay between characters for typeHuman (incremental typing cadence).
const CORE_TYPE_DELAY_MS = 30;

window.MESCore = {
  DEFAULT_TIMEOUT_MS: 15000,
  STOP_CHECK_INTERVAL_MS: 100,

  selectors: {
    firstScanText: /Scan the asset tag|serial number to get started/i,
    secondScanPlaceholder: "Scan asset tag or serial number",
    startButtonText: /^Start$/i,
    confirmWipeText: /Confirm\s+wipe/i
  },

  async typeAndSubmit(input, value, shouldStop) {
    this.throwIfStopped(shouldStop);

    input.focus();
    input.click();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    nativeSetter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    this.throwIfStopped(shouldStop);

    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await this.sleep(150, shouldStop);

    this.throwIfStopped(shouldStop);

    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      input.dispatchEvent(
        new KeyboardEvent(eventType, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );
    });

    await this.sleep(400, shouldStop);
  },

  // Type `value` into an input one character at a time with the full key/input
  // lifecycle per character (keydown -> keypress -> React-compatible value
  // append -> input[insertText] -> keyup), clearing any existing value first.
  // Some components (e.g. certain autocompletes) only react to genuine
  // incremental typing rather than a single bulk value assignment.
  async typeHuman(inputEl, value, shouldStop) {
    this.throwIfStopped(shouldStop);
    inputEl.focus();

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    // Clear any existing value first.
    nativeSetter.call(inputEl, "");
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    let typed = "";

    for (const char of value) {
      this.throwIfStopped(shouldStop);

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

      inputEl.dispatchEvent(
        typeof InputEvent === "function"
          ? new InputEvent("input", {
              bubbles: true,
              inputType: "insertText",
              data: char
            })
          : new Event("input", { bubbles: true })
      );

      inputEl.dispatchEvent(new KeyboardEvent("keyup", keyInit));

      await this.sleep(CORE_TYPE_DELAY_MS, shouldStop);
    }
  },

  async waitForInputByPlaceholderRegex(
    regex,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return regex.test(el.placeholder || "") && this.isVisible(el);
      });
    }, timeoutMs, shouldStop);
  },

  async waitForInputByPlaceholderExact(
    placeholder,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      return [...document.querySelectorAll("input, textarea")].find((el) => {
        return (el.placeholder || "") === placeholder && this.isVisible(el);
      });
    }, timeoutMs, shouldStop);
  },

  async waitForClickableByText(
    regex,
    timeoutMs = this.DEFAULT_TIMEOUT_MS,
    shouldStop
  ) {
    return this.waitForElement(() => {
      const candidates = [...document.querySelectorAll(this.buttonSelector())];

      return candidates.find((el) => {
        const text = this.getElementText(el);

        return regex.test(text) && this.isVisible(el) && !this.isDisabled(el);
      });
    }, timeoutMs, shouldStop);
  },

  // Unified click. Formerly EOL.safeClick (150/350), MRI.fastClick (75/300) and
  // RepairCleanup.fastClick (150/150); the event sequence is identical across
  // all three, so callers now pass their own pre/post delays.
  async dispatchClick(element, preMs, postMs, shouldStop) {
    this.throwIfStopped(shouldStop);

    element.scrollIntoView({ block: "center", inline: "center" });

    await this.sleep(preMs, shouldStop);

    this.throwIfStopped(shouldStop);

    element.focus();

    const rect = element.getBoundingClientRect();

    const clickOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    element.dispatchEvent(new MouseEvent("mouseover", clickOptions));
    element.dispatchEvent(new MouseEvent("mousedown", clickOptions));

    this.throwIfStopped(shouldStop);

    element.dispatchEvent(new MouseEvent("mouseup", clickOptions));
    element.dispatchEvent(new MouseEvent("click", clickOptions));

    await this.sleep(postMs, shouldStop);
  },

  // Popup-closing poller: runs closePopupIfPresent each tick and throws on
  // timeout. Use for normal page elements.
  async waitForElement(findFn, timeoutMs, shouldStop) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      this.throwIfStopped(shouldStop);

      await window.MESPopupHandler.closePopupIfPresent();

      this.throwIfStopped(shouldStop);

      const element = findFn();

      if (element) {
        return element;
      }

      await this.sleep(CORE_ELEMENT_POLL_MS, shouldStop);
    }

    throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for element`);
  },

  // Scoped poller (formerly MRI.waitForFailureElement). Unlike waitForElement it
  // does NOT run closePopupIfPresent, which would click a modal's Cancel/Close
  // button and dismiss the dialog we are interacting with. Returns null on
  // timeout so callers can raise a specific error.
  async waitForScoped(findFn, timeoutMs, shouldStop) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      this.throwIfStopped(shouldStop);

      const result = findFn();

      if (result) {
        return result;
      }

      await this.sleep(CORE_SCOPED_POLL_MS, shouldStop);
    }

    return null;
  },

  throwIfStopped(shouldStop) {
    if (typeof shouldStop === "function" && shouldStop()) {
      throw new MESStopError();
    }
  },

  isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  },

  isDisabled(element) {
    return (
      element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      element.classList.contains("disabled")
    );
  },

  buttonSelector() {
    return "button, [role='button'], input[type='button'], input[type='submit']";
  },

  getElementText(element) {
    return (
      element.innerText ||
      element.textContent ||
      element.value ||
      element.getAttribute("aria-label") ||
      ""
    ).trim();
  },

  async sleep(ms, shouldStop) {
    const start = Date.now();

    while (Date.now() - start < ms) {
      this.throwIfStopped(shouldStop);

      const remaining = ms - (Date.now() - start);
      const delay = Math.min(this.STOP_CHECK_INTERVAL_MS, remaining);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

window.MESStopError = MESStopError;
