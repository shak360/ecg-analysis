/**
 * App shell.
 *
 * Responsibilities kept deliberately narrow: boot the WASM engine, wire the
 * ingest affordances, and own the in-memory study list. No patient data is ever
 * written to storage or sent over the network — studies live in memory for the
 * lifetime of the page and vanish on reload.
 */
import init, { rms_mv, version } from "../wasm/ecg_core.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

/** Boot the compute core and report it in the status bar. */
async function bootEngine(): Promise<void> {
  const status = $("engine-status");
  try {
    await init();

    // Round-trip a known signal so a silently-broken build surfaces here rather
    // than as wrong millivolts three stages downstream. A ±3 mV square wave has
    // an RMS of exactly 3.
    const probe = Float32Array.from([3, -3, 3, -3]);
    const got = rms_mv(probe);
    if (Math.abs(got - 3) > 1e-4) {
      throw new Error(`WASM self-check failed: expected RMS 3, got ${got}`);
    }

    status.textContent = `Engine ready — ecg-core ${version()}`;
    status.classList.add("statusbar__item--ok");
  } catch (err) {
    status.textContent = `Engine failed to start: ${err instanceof Error ? err.message : err}`;
    status.classList.add("statusbar__item--error");
    throw err;
  }
}

/** Wire drag-drop and the file picker. Routing lands in a later stage. */
function wireIngest(): void {
  const zone = $("dropzone");
  const input = $<HTMLInputElement>("file-input");

  const openPicker = () => input.click();
  zone.addEventListener("click", openPicker);
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });

  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add("dropzone--active");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove("dropzone--active");
    });
  }

  zone.addEventListener("drop", (e) => {
    const files = (e as DragEvent).dataTransfer?.files;
    if (files?.length) void acceptFiles(files);
  });
  input.addEventListener("change", () => {
    if (input.files?.length) void acceptFiles(input.files);
  });
}

/** Placeholder until the ingest router lands. */
function acceptFiles(files: FileList): void {
  const list = $("study-list");
  list.querySelector(".study-list__empty")?.remove();
  for (const file of Array.from(files)) {
    const li = document.createElement("li");
    li.className = "study-list__item";
    li.innerHTML =
      `<span class="study-list__name"></span><span class="study-list__meta"></span>`;
    li.querySelector(".study-list__name")!.textContent = file.name;
    li.querySelector(".study-list__meta")!.textContent = `${(file.size / 1024).toFixed(0)} KB — queued`;
    list.appendChild(li);
  }
}

function wireTheme(): void {
  const btn = $("theme-toggle");
  btn.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
  });
}

wireIngest();
wireTheme();
void bootEngine();
