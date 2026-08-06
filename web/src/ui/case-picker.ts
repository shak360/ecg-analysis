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

/** How many numbered case buttons a chosen finding shows. */
const SHOWN = 12;

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

  /**
   * Follow the filter into whichever category still has something.
   *
   * Without this, typing a term that matches only Rhythm findings while the
   * Normal card is open shows an empty list and reads as "no results" — when
   * the results exist one card over. The filter is the reader's question; the
   * open category is not.
   */
  function followFilter(): void {
    const all = filteredCodes();
    if (all.some((s) => categoryOf(s) === openClass)) return;
    const fallback = all[0];
    if (fallback) {
      openClass = categoryOf(fallback);
      openCode = null;
    }
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

      // The chosen finding's cases sit directly beneath its chip. A case can
      // carry several findings, so a common one like sinus rhythm accumulates
      // every record that mentions it — hundreds of buttons wrapping into thirty
      // rows. Twelve is as many examples as anyone browses; the rest are
      // reachable by filtering, and the count on the chip says they exist.
      if (openCode === s.id) {
        const row = document.createElement("div");
        row.className = "chip__cases";
        cases.slice(0, SHOWN).forEach((e, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn--ghost";
          b.textContent = String(i + 1);
          // Which record a numbered button leads to, without opening it.
          b.title = `${e.id}${e.sex ? `, ${e.sex}` : ""}${e.age ? `, ${e.age}` : ""}`;
          b.addEventListener("click", () => opts.onPick(s.id, e));
          row.appendChild(b);
        });
        if (cases.length > SHOWN) {
          const more = document.createElement("span");
          more.className = "chip__more";
          more.textContent = `+${cases.length - SHOWN}`;
          row.appendChild(more);
        }
        li.appendChild(row);
      }
      el.list.appendChild(li);
    }
  }

  function refresh(): void {
    followFilter();
    renderFan();
    renderFindings();
  }

  for (const c of [el.kind, el.source]) {
    c.addEventListener("change", () => {
      openCode = null;
      refresh();
    });
  }
  el.search.addEventListener("input", refresh);

  // Populate the corpus filter from what actually loaded, with each corpus's
  // size — the reader is choosing between sources of very different weight, and
  // a bare list of names hides that.
  for (const [id, label] of [...index.sources].sort((a, b) => a[1].localeCompare(b[1]))) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${label} (${index.entries.filter((e) => e.source === id).length})`;
    el.source.appendChild(o);
  }

  renderFan();
  renderFindings();

  return { refresh, openCode: () => openCode };
}
