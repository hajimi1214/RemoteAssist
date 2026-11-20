// Ordered button messages and lossy motion messages can arrive across streams.
// A delayed motion must never move the pointer behind an already-applied click.
export class PointerOrder {
  private latest = 0;

  accept(type: string, sequence: unknown): boolean {
    const barrier=type==="release_all"||type==="disconnect";
    if (!barrier&&(!type.startsWith("mouse_") || type === "mouse_wheel")) return true;
    if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence <= 0) return false;
    if ((type === "mouse_move" || type === "mouse_relative") && sequence <= this.latest) return false;
    this.latest = Math.max(this.latest, sequence);
    // Reliable releases/clicks must still execute even if newer motion arrived.
    return true;
  }
}
