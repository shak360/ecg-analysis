/**
 * The measuring tools, mounted onto any page that draws a tracing.
 *
 * Built in code rather than repeated in five HTML files. The markup is six
 * elements and the wiring is exclusivity plus a repeat toggle, and a copy of
 * that in every page is how three of them end up subtly different — one missing
 * the axis button, one where the caliper and magnifier can both be on at once.
 *
 * The caller supplies the canvas, a way to read the scale it was drawn at, and
 * optionally a way to read the measured frontal axis. A page with no axis to
 * show simply does not pass one and gets no axis button, which is better than a
 * button that opens an empty wheel.
 */

import { attachCalipers, type CaliperScale, MAG_ZOOM } from "./calipers.ts";
import { drawAxisWheel } from "./axis-wheel.ts";

export interface ToolsOptions {
  /** The tracing canvas the tools attach to. */
  canvas: HTMLCanvasElement;
  /** Where the buttons go — normally the panel's own toolbar. */
  mount: HTMLElement;
  /** The scale of the last draw. Read fresh, since gain and width both change. */
  getScale: () => CaliperScale;
  /**
   * The measured frontal axis, or null. Omit entirely on pages that do not
   * measure one; the axis button is then not created at all.
   */
  getAxis?: () => number | null;
  /**
   * Redraw the same tracing into `target`, which has been sized `zoom` times
   * wider than the on-screen canvas.
   *
   * This is what makes the magnifier a magnifier. Enlarging the on-screen
   * bitmap can only stretch pixels that were already rasterised, so the 1 mm
   * grid dissolves at exactly the scale someone reached for the lens to read.
   * Given this, the lens shows the trace re-drawn at `zoom` times the
   * millimetre scale instead.
   *
   * Called only while the magnifier is on, and the result is thrown away when
   * it is switched off — at 2.6x a full printout is some tens of megabytes of
   * bitmap, which is not worth holding for a tool nobody is using.
   */
  renderHiRes?: (target: HTMLCanvasElement, zoom: number) => void;
}

export interface Tools {
  /** Call after the tracing is repainted; the overlay cannot detect that. */
  redraw(): void;
}

function button(label: string, title: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn--ghost";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-pressed", "false");
  return b;
}

const pressed = (b: HTMLElement) => b.getAttribute("aria-pressed") === "true";
const press = (b: HTMLElement, on: boolean) => b.setAttribute("aria-pressed", String(on));

export function mountTools(opts: ToolsOptions): Tools {
  const { canvas, mount, getScale, getAxis } = opts;

  // The canvas needs a positioned parent for the overlay to sit on it. Wrapping
  // here rather than in every page's markup keeps the pages ignorant of it.
  if (!canvas.parentElement?.classList.contains("tracing")) {
    const wrap = document.createElement("div");
    wrap.className = "tracing";
    canvas.parentElement?.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
  }

  const group = document.createElement("span");
  group.className = "tool-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Measuring tools");

  const caliper = button("Calipers", "Drag across the tracing to measure an interval");
  const march = button("Step out", "Repeat the measured interval across the strip");
  const magnify = button("Magnify", "Magnify the tracing under the pointer");
  group.append(caliper, march, magnify);

  /**
   * The off-screen high-resolution copy. Attached to the document but parked
   * outside it, because `drawPrintout` and `drawOverlay` both size themselves
   * from `clientWidth`, which is zero for a detached element.
   */
  let hiRes: HTMLCanvasElement | null = null;

  function buildHiRes(): void {
    if (!opts.renderHiRes) return;
    dropHiRes();
    const c = document.createElement("canvas");
    c.style.cssText =
      `position:absolute;left:-99999px;top:0;width:${canvas.clientWidth * MAG_ZOOM}px;` +
      `pointer-events:none;visibility:hidden`;
    document.body.appendChild(c);
    opts.renderHiRes(c, MAG_ZOOM);
    hiRes = c;
  }

  function dropHiRes(): void {
    hiRes?.remove();
    hiRes = null;
  }

  const tools = attachCalipers(canvas, getScale, () => hiRes);

  // Caliper and magnifier both want the pointer, so they are exclusive. A mode
  // you can be in twice is a mode you cannot get out of.
  for (const [b, mode] of [[caliper, "caliper"], [magnify, "magnify"]] as const) {
    b.addEventListener("click", () => {
      const on = !pressed(b);
      press(caliper, b === caliper && on);
      press(magnify, b === magnify && on);
      tools.setMode(on ? mode : "off");
      if (b === magnify && on) buildHiRes();
      else dropHiRes();
      syncMarch();
    });
  }

  /**
   * "Step out" repeats a measured span, so it is live only when there is a span
   * to repeat: the calipers must be on *and* a measurement placed. Enabled on
   * the mode alone it was clickable with nothing to act on, which reads as the
   * button being broken rather than as not being applicable yet.
   */
  function syncMarch(): void {
    const usable = pressed(caliper) && tools.hasMeasurement();
    march.disabled = !usable;
    if (!usable && pressed(march)) {
      press(march, false);
      tools.setRepeat(false);
    }
  }

  march.disabled = true;
  march.addEventListener("click", () => {
    const on = !pressed(march);
    press(march, on);
    tools.setRepeat(on);
  });

  let wheel: HTMLCanvasElement | null = null;
  let box: HTMLElement | null = null;
  if (getAxis) {
    const axis = button("Axis", "Show the mean QRS axis on the hexaxial circle");
    group.appendChild(axis);

    box = document.createElement("div");
    box.className = "axis-box";
    box.hidden = true;
    wheel = document.createElement("canvas");
    const note = document.createElement("p");
    note.className = "axis-box__note";
    note.textContent =
      "Mean QRS axis on the hexaxial reference circle. The shaded sector is " +
      "−30° to +90°, the range this atlas's criteria treat as normal; other " +
      "sources use 0° to +90° or −30° to +100°. Derived from the limb-lead " +
      "amplitudes of the ensemble beat, not measured directly.";
    box.append(wheel, note);
    canvas.closest(".panel")?.appendChild(box);

    axis.addEventListener("click", () => {
      const on = !pressed(axis);
      press(axis, on);
      box!.hidden = !on;
      if (on) drawAxisWheel(wheel!, { axisDeg: getAxis() });
    });
  }

  tools.onMeasurementChange(syncMarch);
  mount.appendChild(group);

  return {
    redraw() {
      tools.redraw();
      // The tracing changed, so the enlarged copy is stale.
      if (hiRes) buildHiRes();
      if (wheel && box && !box.hidden) drawAxisWheel(wheel, { axisDeg: getAxis!() });
    },
  };
}
