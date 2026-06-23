class MESAssetError extends Error {
  constructor(message = "Asset error popup detected") {
    super(message);
    this.name = "MESAssetError";
  }
}

window.MESPopupHandler = {
  assetErrorTextRegex: /Failed to execute instruction|Query Error/i,

  async closePopupIfPresent() {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];

    for (const dialog of dialogs) {
      const text = dialog.innerText || "";

      if (this.assetErrorTextRegex.test(text)) {
        this.clickCloseButton(dialog);
        await this.sleep(200);
        throw new MESAssetError();
      }

      if (this.clickCloseButton(dialog)) {
        await this.sleep(200);
        return "CLOSED";
      }
    }

    return null;
  },

  clickCloseButton(root) {
    const buttons = [...root.querySelectorAll("button")];

    const closeButton = buttons.find((button) => {
      return /^(Close|Dismiss|Done|Cancel)$/i.test(button.innerText.trim());
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