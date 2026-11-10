// Cross-cutting state-detection primitives shared by the workflow finders and
// per-mode state detectors.
window.MESState = {
  // From a list of candidate elements, return the innermost match — the one that
  // does not contain any other candidate — or null. Used to tightly scope a
  // section when several nested containers all satisfy the same text/control
  // signal.
  innermost(candidates) {
    return (
      candidates.find((element) => {
        return !candidates.some(
          (other) => element !== other && element.contains(other)
        );
      }) || null
    );
  }
};
