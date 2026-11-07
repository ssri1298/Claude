// Hands a prepared topic batch (e.g. from Claude's inbox) to the Import page.
let pending = null;
export const setPrefill = (batch) => {
  pending = batch;
};
export const takePrefill = () => {
  const b = pending;
  pending = null;
  return b;
};
