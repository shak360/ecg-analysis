/**
 * The frontal-plane axis, drawn on the hexaxial reference circle.
 *
 * A number like "−22°" means nothing until you can see where it sits between
 * lead I at 0° and aVF at +90°. This draws the six limb-lead vectors in their
 * conventional positions and puts the measured mean QRS axis among them, which
 * is the picture every textbook uses and the one the number is shorthand for.
 *
 * # Conventions, which are easy to get wrong
 *
 * The hexaxial system runs **clockwise-positive**: lead I is 0°, aVF is +90°
 * *downward*, aVL is −30° *upward*, aVR is −150°. Canvas y also grows downward,
 * so screen angle and ECG angle happen to agree — but only because two sign
 * flips cancel, which is worth stating so nobody "fixes" one of them.
 *
 * The normal adult range shown is **−30° to +90°**, which is the range this
 * project's criteria document uses. Ranges of 0°–90° and −30°–+100° are also in
 * print; the band is drawn as context and labelled, never as a verdict, in
 * keeping with the rest of the atlas.
 */

/** Lead name to its hexaxial angle in degrees, clockwise-positive from lead I. */
const LIMB_AXES: readonly (readonly [string, number])[] = [
  ["I", 0],
  ["II", 60],
  ["aVF", 90],
  ["III", 120],
  ["aVR", -150],
  ["aVL", -30],
];

const NORMAL_FROM = -30;
const NORMAL_TO = 90;

export interface AxisWheelOptions {
  /** Measured mean QRS axis in degrees, or null when it was not measurable. */
  axisDeg: number | null;
  /** Edge length in CSS pixels. */
  size?: number;
}

/**
 * Draw the wheel. Returns nothing; the canvas is sized to `size` square.
 *
 * A null axis draws the reference circle with an explicit "not measured" note
 * rather than an empty box or a needle at zero — zero is a real axis and would
 * be read as one.
 */
export function drawAxisWheel(canvas: HTMLCanvasElement, opts: AxisWheelOptions): void {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches &&
    document.documentElement.dataset.theme !== "light";
  const ink = dark ? "#e8eaee" : "#16191d";
  const faint = dark ? "#3d444f" : "#c9ced6";
  const muted = dark ? "#a2aab6" : "#5c646f";
  const accent = dark ? "#4da3e8" : "#0b6ab8";
  const band = dark ? "rgba(77,163,232,0.12)" : "rgba(11,106,184,0.10)";

  const size = opts.size ?? 240;
  const dpr = globalThis.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const at = (deg: number, radius: number) => ({
    x: cx + Math.cos(rad(deg)) * radius,
    y: cy + Math.sin(rad(deg)) * radius,
  });

  // The normal band first, so every line sits on top of it.
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, rad(NORMAL_FROM), rad(NORMAL_TO));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Each limb lead as a full diameter: a lead axis is a line, not a ray, and
  // drawing only the positive half is what makes people forget the negative
  // deflection is the same lead.
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [name, deg] of LIMB_AXES) {
    const a = at(deg, r);
    const b = at(deg + 180, r);
    ctx.strokeStyle = faint;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    const label = at(deg, r + 13);
    ctx.fillStyle = muted;
    ctx.fillText(name, label.x, label.y);
  }

  ctx.fillStyle = muted;
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText("0°", at(0, r + 13).x + 8, at(0, r + 13).y + 11);

  if (opts.axisDeg === null || !Number.isFinite(opts.axisDeg)) {
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("axis not measured", cx, cy);
    return;
  }

  // The needle.
  const tip = at(opts.axisDeg, r - 6);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.font = "600 13px ui-monospace, monospace";
  ctx.fillText(`${opts.axisDeg.toFixed(0)}°`, cx, cy + r * 0.55);
}

/** Whether an axis falls in the range drawn as normal. Context, not a verdict. */
export function inNormalRange(axisDeg: number): boolean {
  return axisDeg >= NORMAL_FROM && axisDeg <= NORMAL_TO;
}

export { LIMB_AXES, NORMAL_FROM, NORMAL_TO };
