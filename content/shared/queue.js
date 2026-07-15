window.MESQueue = {
  getRemainingAssets(assets, completed, skipped) {
    const skippedIds = skipped.map((x) => x.asset);

    return assets.filter((asset) => {
      return !completed.includes(asset) && !skippedIds.includes(asset);
    });
  }
};