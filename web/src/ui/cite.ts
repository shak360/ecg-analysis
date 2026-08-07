/**
 * Attaching a source to a claim the page makes in its own voice.
 *
 * The criteria panel already links its references, because every threshold
 * there came from a published table. The rest of the site had claims with no
 * such structure behind them — a derived quantity named but not sourced, a
 * corpus credited in prose, an anatomical statement written as though it were
 * common knowledge. Those are the ones a reader has no way to check.
 *
 * The same rule applies as in `criteria/references.ts`: an identifier is used
 * only if `tools/verify-citations.ts` resolved it against PubMed and the record
 * agreed with the citation. Nothing here invents one.
 */
import { REFERENCES, referenceLabel, referenceUrl } from "../criteria/references.ts";

/**
 * A link to one work, for prose.
 *
 * Returns an element rather than a string so a caller with a real DOM does not
 * have to concatenate HTML around text it did not escape.
 */
export function citeLink(key: string, text?: string): HTMLAnchorElement | null {
  const ref = REFERENCES[key];
  if (!ref) return null;
  const a = document.createElement("a");
  a.href = referenceUrl(ref);
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "cite";
  a.textContent = text ?? referenceLabel(ref);
  a.title = `${referenceLabel(ref)} · PMID ${ref.pmid}`;
  return a;
}

/**
 * `<a href=...>` for the templates that build markup as strings.
 *
 * `text` is escaped here rather than at each call site, because the one that
 * forgets is the one that takes a corpus label from a JSON file.
 */
export function citeHtml(key: string, text?: string): string {
  const ref = REFERENCES[key];
  if (!ref) return text ? esc(text) : "";
  const label = esc(text ?? referenceLabel(ref));
  const title = esc(`${referenceLabel(ref)} · PMID ${ref.pmid}`);
  return `<a class="cite" href="${esc(referenceUrl(ref))}" target="_blank" rel="noopener" title="${title}">${label}</a>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
