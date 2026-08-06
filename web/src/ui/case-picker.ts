/**
 * Choosing a case: the class fan, then a finding, then a record.
 *
 * # Why this takes elements rather than ids
 *
 * `test/page-wiring.test.ts` reads only a page's *entry module* and checks that
 * every id it looks up exists in that page's HTML. It does not follow imports.
 * So if this module did its own `document.getElementById` calls, those ids
 * would silently drop out of that check and a page could ship missing one — the
 * exact class of defect that wiring test exists to catch, reintroduced by the
 * refactor meant to tidy things up.
 *
 * The page therefore resolves its own elements and hands them over.
 */

import {
  CATEGORIES,
  categoryOf,
  type CorpusIndex,
  type Entry,
  type Statement,
} from "../app/corpus.ts";

export interface CasePickerElements {
  fan: HTMLElement;
  list: HTMLElement;
  count: HTMLElement;
  kind: HTMLSelectElement;
  source: HTMLSelectElement;
  search: HTMLInputElement;
}

export interface CasePickerOptions {
  el: CasePickerElements;
  index: CorpusIndex;
  /** Called when the reader lands on a case. */
  onPick: (code: string, entry: Entry) => void;
  /**
   * Cases to offer for a finding. Defaults to every case carrying it.
   *
   * The vector-loop page has no use for a case it will only refuse, so it
   * narrows this — but the narrowing is the page's judgement, not the picker's.
   */
  filterCases?: (cases: Entry[]) => Entry[];
}

export interface CasePicker {
  /** Re-render after a filter changes. */
  refresh(): void;
  /** Which finding is open, if any. */
  openCode(): string | null;
}

export function mountCasePicker(opts: CasePickerOptions): CasePicker {
  const { el, index } = opts;
  let openClass: string = CATEGORIES[0]!.id;
  let openCode: string | null = null;

  /** Statements passing every filter *except* the category. */
  function filteredCodes(): Statement[] {
    const kind = el.kind.value;
    const q = el.search.value.trim().toLowerCase();
    const source = el.source.value;

    return [...index.meta.values()]
      .filter((s) => casesFor(s.id).length > 0)
      .filter((s) => kind === "all" || s.kind === kind)
      .filter((s) =>
        !q ||
        s.id.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.sourceCode.toLowerCase().includes(q)
      )
      .sort((a, b) => a.description.localeCompare(b.description));
    function casesFor(code: string) {
      const all = (index.byCode.get(code) ?? [])
        .filter((e) => source === "all" || e.source === source);
      return opts.filterCases ? opts.filterCases(all) : all;
    }
  }

  function casesFor(code: string): Entry[] {
    const source = el.source.value;
    const all = (index.byCode.get(code) ?? [])
      .filter((e) => source === "all" || e.source === source);
    return opts.filterCases ? opts.filterCases(all) : all;
  }

  function renderFan(): void {
    const all = filteredCodes();
    el.fan.innerHTML = "";

    CATEGORIES.forEach((c, i) => {
      const codes = all.filter((s) => categoryOf(s) === c.id);
      // Distinct records: one ECG carrying both CLBBB and IVCD is one case
      // under Conduction, not two.
      const cases = new Set<string>();
      for (const s of codes) for (const e of casesFor(s.id)) cases.add(e.id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fan__card";
      btn.style.setProperty("--i", String(i));
      btn.setAttribute("role", "tab");
      btn.disabled = codes.length === 0;
      btn.setAttribute("aria-selected", String(openClass === c.id));
      if (openClass === c.id) btn.classList.add("fan__card--open");
      if (!codes.length) btn.classList.add("fan__card--empty");

      btn.innerHTML = `<span class="fan__label"></span>` +
        `<span class="fan__count"></span>` +
        `<span class="fan__blurb"></span>`;
      btn.querySelector(".fan__label")!.textContent = c.label;
      btn.querySelector(".fan__count")!.textContent = codes.length
        ? `${cases.size} ECG${cases.size === 1 ? "" : "s"} · ${codes.length} finding${
          codes.length === 1 ? "" : "s"
        }`
        : "nothing here under this filter";
      btn.querySelector(".fan__blurb")!.textContent = c.blurb;

      btn.addEventListener("click", () => {
        openClass = c.id;
        openCode = null;
        renderFan();
        renderFindings();
      });
      el.fan.appendChild(btn);
    });
  }

  function renderFindings(): void {
    const shown = filteredCodes().filter((s) => categoryOf(s) === openClass);
    el.list.innerHTML = "";

    // Both halves the same scope. Pairing the open category's finding count
    // with the whole corpus's case count reads as "these 2 findings cover 1,207
    // cases", which is false and flattering.
    const all = filteredCodes();
    const cases = new Set<string>();
    for (const s of all) for (const e of casesFor(s.id)) cases.add(e.id);
    el.count.textContent = `${all.length} findings · ${cases.size} cases` +
      (el.source.value === "all" ? "" : " in this corpus");

    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "chip-strip__empty";
      li.textContent = "No findings in this category match that filter.";
      el.list.appendChild(li);
      return;
    }

    for (const s of shown) {
      const cases = casesFor(s.id);
      const li = document.createElement("li");
      li.className = "chip-strip__item";

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      if (openCode === s.id) chip.classList.add("chip--open");
      chip.setAttribute("aria-expanded", String(openCode === s.id));
      chip.title = `${s.sourceCode} · ${s.kind}`;
      chip.innerHTML = `<span class="chip__name"></span><span class="chip__n"></span>`;
      chip.querySelector(".chip__name")!.textContent = s.description || s.id;
      chip.querySelector(".chip__n")!.textContent = String(cases.length);

      // One click reaches an ECG: choosing a finding opens its first case rather
      // than only revealing more buttons.
      chip.addEventListener("click", () => {
        if (openCode === s.id) return;
        openCode = s.id;
        renderFindings();
        if (cases[0]) opts.onPick(s.id, cases[0]);
      });
      li.appendChild(chip);

      if (openCode === s.id && cases.length > 1) {
        const row = document.createElement("div");
        row.className = "chip__cases";
        cases.slice(0, 12).forEach((e, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn--ghost";
          b.textContent = String(i + 1);
          b.addEventListener("click", () => opts.onPick(s.id, e));
          row.appendChild(b);
        });
        if (cases.length > 12) {
          const more = document.createElement("span");
          more.className = "chip__more";
          more.textContent = `+${cases.length - 12}`;
          row.appendChild(more);
        }
        li.appendChild(row);
      }
      el.list.appendChild(li);
    }
  }

  for (const c of [el.kind, el.source]) {
    c.addEventListener("change", () => {
      openCode = null;
      renderFan();
      renderFindings();
    });
  }
  el.search.addEventListener("input", () => {
    renderFan();
    renderFindings();
  });

  // Populate the corpus filter from what actually loaded.
  for (const [id, label] of [...index.sources].sort((a, b) => a[1].localeCompare(b[1]))) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = label;
    el.source.appendChild(o);
  }

  renderFan();
  renderFindings();

  return {
    refresh() {
      renderFan();
      renderFindings();
    },
    openCode: () => openCode,
  };
}
