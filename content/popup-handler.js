class MESAssetError extends Error {
  constructor(message = "Asset error") {
    super(message);
    this.name = "MESAssetError";
  }
}

window.MESPopupHandler = {
  popupRules: [
    {
      regex: /No order found for the scanned asset|Would you like to create a new order/i,
      message: "No Order Found"
    },
    {
      regex: /Asset Tag\/Serial Number Not Found|not found\. Please verify and try again|Failed to retrieve order/i,
      message: "Asset Not Found"
    },
    {
      regex: /Failed to execute instruction/i,
      message: "Failed Instruction"
    },
    {
      regex: /Query Error/i,
      message: "Query Error"
    }
  ],

  async closePopupIfPresent() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];

    for (const dialog of dialogs) {
      const text = dialog.innerText || "";

      const matchedRule = this.popupRules.find((rule) =>
        rule.regex.test(text)
      );

      if (matchedRule) {
        this.clickCloseButton(dialog);
        await this.sleep(800);
        throw new MESAssetError(matchedRule.message);
      }

      if (this.clickCloseButton(dialog)) {
        await this.sleep(500);
        return "CLOSED";
      }
    }

    return null;
  },

  clickCloseButton(root) {
    const buttons = [...root.querySelectorAll("button")];

    const closeButton = buttons.find((button) => {
      return /^(Close|Dismiss|Done|Cancel)$/i.test(
        button.innerText.trim()
      );
    });

    if (closeButton) {
      closeButton.click();
      return true;
    }

    return false;
  },

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

window.MESAssetError = MESAssetError;