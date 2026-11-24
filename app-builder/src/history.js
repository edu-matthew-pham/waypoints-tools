// Undo/redo as snapshots of the project JSON. Small projects, so this is simple and robust.
export class History {
  constructor(json) { this.stack = [json]; this.idx = 0; }
  get current() { return this.stack[this.idx]; }
  get canUndo() { return this.idx > 0; }
  get canRedo() { return this.idx < this.stack.length - 1; }
  // returns true if a new step was recorded
  push(json) {
    if (json === this.current) return false;
    this.stack = this.stack.slice(0, this.idx + 1);
    this.stack.push(json);
    if (this.stack.length > 150) this.stack.shift();
    this.idx = this.stack.length - 1;
    return true;
  }
  step(d) {
    const j = this.idx + d;
    if (j < 0 || j >= this.stack.length) return null;
    this.idx = j;
    return this.current;
  }
}
