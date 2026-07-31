# ATLAS + DE-IDENTIFICATION — MERGED ENGINEERING SPEC v1.0
Governs `web/src/atlas/**`, `web/src/deid/**`, `crates/ecg-core/src/atlas/**`, `tools/synth/**`. Extends `docs/engineering-spec.md` (cited **ES §n**). Every threshold marked **DEFAULT** is the shipping value.

---

## 1. DECISIONS TABLE

### 1.1 De-identification (leads, because everything else follows from D1)

| # | Decision | Picked | Why (one line) |
|---|---|---|---|
| **D1** | **De-identification method** | **KEEP-LIST, not redaction. The atlas never stores the source file, any page raster, any thumbnail, any content stream, or any byte derived from the document other than decoded waveform samples and a closed list of enumerated scalars.** | Redaction asks "did I remove everything?" — unbounded, unverifiable, silent on failure. Copying asks "did I copy only what is on the list?" — bounded, enumerable, verifiable by *type*. We already decode the page to `Float32Array` millivolts, so the safest artifact is the one we were going to produce anyway. |
| D2 | The black-rectangle trap | **Structurally absent, not mitigated** | No content stream is ever copied, so covered-but-present text, unapplied `/Redact` annots, incremental-update revisions, `/ActualText`, invisible `3 Tr` OCR layers, `/Thumb`, `/PieceInfo`, font subsets and glyph-advance residue (arXiv:2206.02285) have no vehicle into the atlas. |
| D3 | Stored rendering (PDF or raster) | **None. Zero.** | Slice B's geometry-only PDF and slice D's re-rendered WebP both re-open a bytes channel for a preview we can draw from the stored `Float32Array` instead. Thumbnails, review panes and overlays all render from samples (ES canonical model). A page thumbnail is a full-resolution leak with a small `width` attribute. |
| D4 | Raster (photo/scan) pixel masking | **Retained, but demoted from a PHI control to measurement hygiene + a review aid** | Under D1 no pixel is stored, so masking cannot be the thing that prevents a leak. It still must exist so header ink does not poison Sauvola/Otsu/hue statistics and so the review pane is safe on a shared screen. |
| D5 | Cart-printed measurements (HR/PR/QRS/QT/axes) | **DROPPED in v1** | On every major cart the measurement block is spatially interleaved with operator-editable free text ("Referred by", "Room 4B", "when compared with ECG of 14-MAR-2024"). Keeping it requires classifying arbitrary free text — the exact capability we must not depend on. Shown once in review, from memory, never stored. |
| D6 | Cart interpretation statements | **DROPPED, no allow-list in v1** | Same reason, one degree worse. |
| D7 | Unclassified text | **Removed. There is no Keep affordance and no "advanced" path.** | If we cannot name it, we cannot promise it is not an identifier. The default branch is always removal. |
| D8 | What the app claims | **Only "removed N items, by class". Never "de-identified".** | Safe Harbor's (b)(2)(ii) actual-knowledge prong is a determination by the covered entity, not a property of a file; and the retained waveform is an unsettled category (§2.4). |
| D9 | Failure policy | **Fail closed: refuse to store, zeroize, no override, no "proceed anyway" flag** | A partial ingest is a PHI store the user believes is clean. |
| D10 | Human-in-the-loop shape | **One screen, one confirm click, per source file. The human reviews the KEEP list, not the remove list.** | The keep list is 4–8 rows and every row is a claim measurement depends on; the remove list is 60 rows the user cannot verify by reading. Reviewing 60 removals is where de-identification UIs die. |
| D11 | Slice C's 1:1 pan/zoom coverage gate | **CUT** | Its purpose was to make a human the last defence against a pixel leak. There is no pixel to leak. It cost ~60 s/study for zero PHI benefit, and a flow people avoid is a flow that does not happen. Its residual target (handwriting vectorised as a trace) is now handled by the shape assertion V3 (§3.3). |
| D12 | DICOM / SCP-ECG / MUSE XML / Sierra XML / HL7 aECG ingest | **Refuse in v1** | Each has a named demographics section and, for DICOM, private tags vendors abuse. Their existence is why `/Names /EmbeddedFiles` is a hard block on every PDF. |
| D13 | HEIC without a native decoder | **Refuse the file; do not bundle libheif-wasm** | A second decoder is a second orientation implementation and a second auxiliary-item policy for a case the user fixes with one iOS setting. |
| D14 | Verifier liveness | **Poison canary corpus, once per session before the first ingest; ingest disabled if any poison fails to trip its code** | The dominant failure of a verifier is that it silently stops checking. |
| D15 | Export of a de-identified PDF or masked PNG | **P2, opt-in, never stored, gated by the slice-B byte scanner and slice-C PNG seal** | Every trap in §2.5 goes live the instant an export path exists; it is not on the P0 path. |

### 1.2 Data, time, storage

| # | Decision | Picked | Why |
|---|---|---|---|
| D16 | Timeline | **`offset_s: i64`, integer seconds from the subject's anchor study; anchor ≡ 0; negatives legal, never rebased** | a real subject folder supplied during development holds two studies **19 min 5 s apart**; day granularity cannot order them and would refuse the highest-value acute comparison. Elapsed seconds encode no calendar position. |
| D17 | Date shifting (MIMIC-style) | **Rejected** | A shifted date is still a date element; it carries exactly the information of an offset *plus* a fake calendar anchor that invites being mistaken for a real one. |
| D18 | Year | **Not stored. DEFAULT off.** Opt-in per subject. | Year alone is permissible, but year + `offset_s` across a series pins each study to a window of days. |
| D19 | Time of day | **Never stored, in any form** | A (C) element and the strongest join key against an EMR audit log. `seq_in_day` (ordinal) is derived for display only. |
| D20 | Calendar anchor | **One record per subject, in a **separate object store** sealed under a **separate key**, shreddable in one write** | Placing study *k* needs `acq_anchor`; no blinding trick avoids that. Hold it explicitly, minimally, separately. A payload-only leak then carries intervals but no dates. |
| D21 | Age | **5-year `AgeBand`, `"90+"` aggregate. Exact age and DOB discarded at ingest.** | Bands satisfy every threshold the pipeline needs (V2–V3 STE splits at 40 → `35-39` vs `40-44` is clean; QTc splits on sex only) and are strictly less identifying than integer years. This also deletes slice A's `[39,41]` boundary problem. |
| D22 | `SubjectId` / `EntryId` | **128 random bits from `crypto.getRandomValues`** | §164.514(c)(1): a re-identification code must not be derived from or related to information about the individual. `SHA-256(MRN)` over ≤10⁹ candidates is brute-forced in seconds — the single most common de-identification self-own in the field. |
| D23 | Source-file duplicate detection | **`HMAC-SHA-256(K_dedupe, original bytes)`, non-extractable device-local key, dropped on export** | A bare digest of the file is a unique code enabling confirm-a-guess membership inference. HMAC of *file bytes* is fine; HMAC of a *parsed identifier* is not, and is banned. |
| D24 | Backend | **IndexedDB, one DB, metadata rows separate from payload rows, payloads as `Blob`** | OPFS has no transactions; an atlas that must fail closed on PHI cannot have a backend whose native failure mode is a half-written record. Cache API has no indexes or transactions. |
| D25 | Encryption at rest | **ON, uniformly, `extractable: false` AES-GCM-256 `CryptoKey` stored in IDB** | The only genuine erase primitive a browser offers. A per-kind exemption is a branch, and if `kind` is ever wrong an `own` entry lands in plaintext. |
| D26 | Reference (31 patterns) + fixture atlases | **Bundled static JSON, hydrated read-only, never written to IndexedDB** | Delete-all never has to reason about them, the storage meter reads honestly, and the atlas is fully explorable at zero stored bytes. |
| D27 | Store discriminant | **One schema, one store, `Provenance` tagged union; the `own` variant carries a non-optional `DeidReceipt` whose `confirmed_by_user` has the literal type `true`** | Type-level fail-closed: an `own` entry is unconstructible by any automated path. |
| D28 | Free text in the payload | **Zero fields. Every stored string is a member of a build-time enum, a UUID, or a hex hash.** | One `notes?: string` added in six months is where the whole header text ends up. Enforced by `auditRecordStrings` (§3.4) and a reflection test. |
| D29 | Subject label / tags / epoch | **Separate `subjects_local` store, never passed to any function that produces output** | Export/render/copy signatures take payload types with no label field, so the leak is unwritable rather than un-triggered. |
| D30 | Payload canonical form | **`ProvisionalSignal` post-calibration, post-Kaiser-resample, **pre-detrend**, 500 Hz** | Conditioning parity (ES decision #41) becomes *structural* rather than checked: detrend/ensemble/fiducials are recomputed by the current engine at compare time. Only acquisition conditioning (HP/LP/gain/speed — burned into paper) is a stored property and a possible block. |
| D31 | Signal container | **`ATLS1`, little-endian, section-table binary, packed and hashed in Rust** | One implementation of the content hash; no wall-clock field in the header, so packing the same study twice is byte-identical and dedupe actually fires. |
| D32 | Sort key | **`(offset_s ?? +∞, content_hash)` ascending; no user sort in the overlay** | Reversing a serial timeline turns evolving ST elevation into resolving ST elevation. |
| D33 | Overlay colour | **Rank-ordinal ColorBrewer Blues, not time-proportional; interval goes in the label** | With two studies 19 min apart and a baseline 3 years earlier, a proportional ramp gives the two interesting tracings indistinguishable hues. |
| D34 | Personal × reference/fixture comparison | **Morphology only. No numbers, ever. Enforced by overload resolution — `MorphologyOverlay` has no numeric field.** | `σ_Δ² = σ_A² + σ_B² − 2ρσ_Aσ_B` with a synthetic reference gives `σ_B = 0`, which *shrinks* MDC and manufactures significance. |
| D35 | `precheck` | **The same Rust function `gate_st` calls, exposed to wasm; TS never reimplements a precondition** | Otherwise the atlas eventually says "ready" for a pair the gate refuses. |
| D36 | Reprocessing after a de-id fix | **Impossible by construction. A superseded ruleset can only *quarantine*, never repair.** | The original is gone — that is the price of D1 and it is the right price. Mitigant: the payload holds no text and no pixels, so a later text-detector fix cannot expose anything new; only the receipt is stale (§5.5). |
| D37 | Export container | **`ECGATLAS1`, plaintext header, encrypted by default whenever any `own` entry is present; PBKDF2-HMAC-SHA256 ×600 000 → KEK wraps a fresh CEK** | Eviction cannot be prevented, so the atlas must be designed to be losable; export is the durability story, not a convenience. |

---

## 2. THE DE-IDENTIFICATION CONTRACT

### 2.1 What is copied into the atlas — the complete keep-list

Nothing outside this list reaches persistent storage. Adding a line requires an entry in this document and a new case in `auditRecordStrings`.

| Kept | Type | Source | Why it survives |
|---|---|---|---|
| Per-lead millivolts, 500 Hz | `Float32Array` | decoded traces | the product |
| Rhythm strip | `Float32Array` | decoded | the product |
| `valid_mask` per lead | `Uint8Array` (0 = EDGE\|INTERP\|MERGED\|CLIPPED\|NaN) | pipeline | ES risk #7 |
| `t0_offset_s` per lead | `f32` | panel layout | ES §4 registration |
| Source vertices in `(s, mV)` (tier A only) | `Float32Array` pair | polyline decode | ES §4.2(c) sub-sample alignment; **never** the polyline in PDF points |
| `speed_mm_s` | enum `{25, 50}` | measured column width / header | ES risk #2 |
| `gain_mm_mv[row]`, `gain_source`, `gain_confirmed` | `f32[]` + enums | pulse / header / user | ES risk #1 |
| `hp_hz`, `lp_hz`, `mains_hz` | enums, **`null` legal** | header text / pulse droop | ES risk #3 — a hard block on ST deltas |
| `layout`, `source`, `tier`, `device_model` | enums, **allow-list only** | classifier | fixture selection; **never a serial number** |
| `sex` | `{M, F, unspecified}` | header | ES §6.1 required |
| `age_band` | 5-year enum, `"90+"` | header | ES §6.1 required |
| `offset_s`, `subject`, `id` | `i64`, 2×UUIDv4 | §4 | serial comparison |
| Quality: `sigma_hat_mv`, `grade`, `grade_lead`, `n_beats`, `coverage_st`, `hr_bpm`, `rhythm_class`, `identity_ok`, `flags[]` | numbers + enums | pipeline | ES §5.4 |
| `DeidReceipt` | counts + enums + bboxes in mm | verifier | audit |

### 2.2 What is removed — every Safe Harbor category, mapped

`Band`: **H** header, **F** footer, **S** side, **T** interpretation prose, **M** document metadata, **N** filename/path, **X** external (barcode/sticker/handwriting).

| § | Category | On an ECG | Where | Measured example |
|---|---|---|---|---|
| A | Names — patient, relatives, employers, household | always | H, M, N, T | `/Info /Title` = `MUSE(R) Report For <LAST>, <FIRST> <9-digit MRN>` |
| A′ | Clinician names | always | H, F, T | `Confirmed by <LAST>, <FIRST> (<5-digit uid>) on MM/DD/YYYY H:MM:SS AM`; `Technician:`; `Referred By:` |
| B | Geography < state | usually indirect | H, S, F | institution name resolves to a street address; `Room`, `Bed`, `Site` |
| C | All date elements except year; ages > 89 | **central** | H, F, M, N | header `DD-MMM-YYYY HH:MM:SS` **and** confirmation `MM/DD/YYYY H:MM:SS AM` in the *same document* |
| D–G | Phone, fax, email, SSN | rare–regional | F, M, H | EMR print-driver footers; SSN/NHS/CPR used as MRN abroad |
| H | Medical record numbers | always | H, M, N | `ID:#########`; **directory name is the 9-digit MRN**; filename is the acquisition timestamp |
| I, J | Health-plan and account numbers | often | F right strip | `ACCOUNT: #########` at x 160–270 mm, y 204.4 mm — **a top-band-only rule keeps this** |
| K | Certificate/licence numbers | sometimes | H, T | NPI; the `(#####)` MUSE user id |
| M | Device identifiers **and serial numbers** | always | F, M | cart serial, `EID:`, acquisition-module serial |
| N, O | URLs, IP addresses | sometimes | F, M | `/OpenAction` URI; print-server host in `/Producer` |
| P | Biometric identifiers | **the waveform** | W | see §2.4 — retained, cannot be removed |
| Q | Full-face and comparable images | phone-photo ingest | X | a person, a wristband, a chart label in frame |
| R | Any other unique number/characteristic/code | always | H, F, S, M, X | `ORDER: #########`; barcode/QR/DataMatrix encoding the MRN; `xmpMM:DocumentID`; PDF `/ID` |

Permitted but quasi-identifying, and **dropped anyway** because nothing in this product uses them: race/ethnicity, height/weight/BMI, room/bed, indication free text, insurance.

Never read at all, in any code path: `File.name`, `File.lastModified`, `File.webkitRelativePath`, `FileSystemFileHandle.name`, `DataTransfer` `text/uri-list`, clipboard `text/html` source URL. Lint-banned in `web/src/deid/**` and `web/src/atlas/**`.

### 2.3 What the verifier checks — three independent gates, all mandatory, none skippable

**V1 — surface completeness (source side).** Every PHI surface enumerated in §3.2 must be *reached* and must return without throwing, on **every page** of a multi-page document. `numPages` is iterated; page 1 is never assumed to be the ECG (EMR wrappers add a cover sheet; carts emit a median-complex page 2 **with the header repeated**). Any exception, timeout, or unreached surface ⇒ refuse. `receipt.surfaces` must deep-equal `ALL_SURFACES` or `put()` throws.

**V2 — type closure (artifact side).** The record, serialized exactly as it will be stored, contains only: `number`, `boolean`, `null`, `Float32Array`/`Uint8Array`/`Int32Array`, plain arrays and plain objects of those, and strings that are members of the closed enum set or match the UUID/hex-hash patterns. Anything else ⇒ refuse.

**V3 — shape (artifact side).** Every stored trace is single-valued in x within its `PanelRect` (≤ 1 y-run per column after the envelope step) and spans ≥ 60 % of the panel width. Glyph clusters, barcodes, signatures and handwriting fail both. Violation ⇒ drop that panel and flag; never "best effort".

**V4 — canary.** Six poison inputs (§3.5) must each trip their designated failure code before the first ingest of a session.

### 2.4 What the app does NOT claim — the exact UI strings

Ship verbatim. Every one of these is in `web/src/atlas/strings.ts`.

> **`honesty.whatWeDid`** — "We removed the items listed above from what we stored. That is all we can tell you."
>
> **`honesty.notACertification`** — "This is not a certification. We do not claim this study is de-identified. We claim only that these specific items were found and removed, by these detectors, at this version."
>
> **`honesty.automatedLimits`** — "Automatic detection misses things. Published PHI detectors miss roughly a quarter of identifiers in free text. That is why anything we could not identify is removed rather than kept, and why nothing here is a guarantee."
>
> **`honesty.biometric`** — "The tracing itself can identify a person. Research systems match people to their own ECGs with better than 99% accuracy. Removing names and numbers does not make a tracing anonymous. Treat this atlas as patient data."
>
> **`honesty.whereItLives`** — "Everything is stored in this browser, on this device. It is readable by browser extensions you install, and it may be included in device backups. We cannot delete copies you exported, printed, or screenshotted."

**Banned strings**, enforced by a `deno lint` custom rule over `web/src/**` that fails CI: `de-identified` / `deidentified` as a predicate applied to a file or entry, `anonymous`, `anonymized`, `anonymised`, `HIPAA compliant`, `Safe Harbor compliant`, `PHI-free`, `PHI removed` as a completed claim, `safe to share`, `scrubbed`, `sanitized`, `securely erased`, `permanently deleted`. Permitted forms are past-tense reports of specific actions: `removed 63 items`, `we removed the following`, `the decryption key has been destroyed`.

The honest position on the waveform, stated in the receipt view and in the code comments: a 12-lead ECG identifies its subject at rank-1 0.812 / EER 2.53 % over ~23 000 held-out identities on a single cart family (arXiv 2602.02776), and 0.819 from interpretable PQRST features alone over 223 participants (arXiv 2408.10228). Whether that is §(P) "biometric identifiers" or §(R) "any other unique identifying characteristic" is unsettled by HHS for ECG. It is **not** a practical threat to a local, never-uploaded, single-user atlas — an adversary holding the atlas has already compromised the machine, where cheaper identifiers abound. It is **decisively** a threat to any export or sharing workflow. Consequences, all enforced: waveform export is off by default and is a per-session setting, never persisted; the reference and fixture atlases are synthetic-only; and **subject linkage is always a user action — never de-duplicate or auto-link by waveform similarity**, because building the matcher is building the attack and a false link merges two patients' timelines into one record.

### 2.5 Failure policy

```ts
export class DeidRefusal extends Error {
  constructor(readonly failures: VerifyFailure[]) {
    super(`E_DEID_REFUSED:${failures.map(f => f.code).join(",")}`);  // codes only, never values
  }
}
```

On any non-empty `failures`: **(1)** do not store — not the record, not a partial, not a quarantine copy; **(2)** zeroize — `sourceBytes.fill(0)`, drop every `Float32Array`, `canvas.width = canvas.height = 0`, `worker.terminate()`; **(3)** surface only `code` and structural `locus` to the UI and to any log; never a value, never a pdf.js exception `message` (a parse error can quote file content into it); **(4)** offer exactly two actions — retry ingest, or discard. There is no override, no admin flag, no "store anyway". If a legitimate ECG cannot be ingested, that is a bug for us to fix in the gates, not a decision for a clinician at 2 a.m.

The confirm button's enabled state is derived from `verifier_ran_to_completion && every_finding_classified && reconstruction_produced_≥1_lead` — **never** from `findings.isEmpty()`. Silent success is the failure mode; an empty finding list is what a dead verifier returns.

### 2.6 Traps the keep-list kills, and the ones it does not

| Killed structurally by D1/D3 (no vehicle exists) | Still live, and how each is handled |
|---|---|
| Black rectangle over text; unapplied `/Redact` `/OverlayText`; white/clipped/under-image text; `3 Tr` invisible OCR layers; `/ActualText`, `/Alt`, `/E`; incremental-update `/Prev` chains and second `%%EOF`; `/ObjStm`, `/XRef` streams, free and orphaned objects; linearization first-page dict; `/Thumb`; `/PieceInfo`; `/Info` and XMP (doc-level **and** per-XObject); trailer `/ID`; `/AcroForm`, `/XFA`, widget `/V`, `/TU`; annotation `/AP /N` appearance streams and hidden `/F 2` annots; `/Names /EmbeddedFiles` (MUSE/Sierra XML with full demographics); `/OCProperties` hidden layers; outlines, named dests, page labels; `/OpenAction`, `/AA`, doc JS; digital-signature `/Contents` PKCS#7 carrying the signed original; font subsets, `/Differences`, `/ToUnicode`, `CIDSet`, glyph-advance residue; EXIF/GPS/MakerNote, **EXIF IFD1 pre-crop thumbnail**, ExtendedXMP across multiple APP1 segments, IPTC/8BIM, APP2 MPF second image and HDR gain map, HEIF depth/gain-map/burst items, the MP4 appended after `FFD9` (Android Motion Photo, Samsung trailer), PNG `eXIf`/`tEXt`/`iTXt`/`zTXt`, aCropalypse-class data after `IEND`/`EOI`; scanner job name | **Glyph ink vectorised as a trace** → V3 shape gate; `STROKE_OPS` must drop `fillStroke`/`eoFillStroke`/`closeFillStroke`/`closeEOFillStroke` (outlined glyphs and barcodes paint with fills); reject closed polylines and bboxes < 6 × 6 mm. **Barcode/QR/DataMatrix inside the plot area** → symbology sweep, unconditional discard, no keep-list entry. **Annotation-drawn geometry harvested as page content** → `extractPageGeometry` currently uses the pdf.js default `AnnotationMode.ENABLE`; change to `DISABLE` and assert no `beginAnnotation`(80). **Handwriting / stickers** → V3 + the fact that pixels are never stored. **`File.name` / `lastModified`** → never read (§2.2). **The audit log becoming the leak** → §3.6. **The receipt storing removed values** → counts only. **Object URLs, canvas snapshots, pdf.js worker copies outliving ingest** → §7.7. **The waveform itself** → §2.4, unsolved and stated. |

---

## 3. THE VERIFICATION PASS

Impossible to skip because `atlas.put()` accepts only a `SealedRecord`, whose sole constructor is `sealAfterVerification(record, VerifyToken, HumanAck)`, and `VerifyToken` is minted only by `verifyOrThrow`. A lint rule forbids importing either constructor outside `web/src/deid/gate.ts`.

### 3.1 Orchestration — `web/src/deid/ingest.ts`

```ts
export async function ingest(file: File, ui: HitlGates): Promise<EntryId> {
  let src: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  let doc: PDFDocumentProxy | null = null;
  try {
    await assertVerifierIsLive();                      // §3.5 — once per session, before anything
    const inv = await inventorySource(src, file.type); // §3.2 (PDF) or §3.3 (raster). V1.
    if (inv.blocked.length) throw new DeidRefusal(inv.blocked);
    const geo    = await extractGeometry(src, inv);    // annotationMode: DISABLE
    const gated  = applyShapeGates(geo);               // V3
    const kept   = parseKeepList(inv.textItems);       // §3.4 closed grammar; never persisted raw
    const ack    = await ui.confirm({ inv, kept, preview: renderFromSamples(gated) });  // §7.3
    if (!ack) throw new DeidRefusal([{ code: "USER_CANCELLED", locus: "ui" }]);
    const rec    = buildRecord(gated, kept, ack);
    const token  = await verifyOrThrow(rec, inv);      // V2 + V3, on the SERIALIZED form
    return await atlas.put(sealAfterVerification(rec, token, ack));
  } finally {
    src?.fill(0); src = null;                          // unconditional: success, refusal, throw
    if (doc) { await doc.cleanup(); await doc.destroy(); }
    await destroyPdfWorker();                          // the worker holds its own copy of the bytes
    ui.fileInput.value = ""; revokeAllObjectUrls();
    ingestWorker.terminate();                          // destroying the isolate is the only deterministic release
  }
}
```

### 3.2 PDF — adversarial source inventory, `web/src/deid/verify-pdf.ts`

Runs on a **dedicated fresh worker** so no cached state from the extraction pass can answer these questions. `bytes.slice()` because `getDocument({data})` neuters the caller's array — and a detached zero-length array trivially "passes".

```ts
export const ALL_SURFACES = [
  "info","xmp","attachments","outline","dests","pagelabels","docjs","markinfo",
  "fields","permissions","ocg","signatures","bytescan",
  "page.text","page.annots","page.structtree","page.js","page.xfa","page.ops",
] as const;

export async function inventoryPdf(bytes: Uint8Array): Promise<Inventory> {
  const F: VerifyFailure[] = [], seen = new Set<string>();
  const fail = (code: string, locus: string, count?: number) => F.push({ code, locus, count });
  const surface = <T>(id: string, f: () => Promise<T>) =>
    f().then(v => { seen.add(id); return v; },
             e => { fail("SURFACE_THREW", `${id}:${(e as Error).name}`); throw e; });

  if (bytes.length === 0) { fail("EMPTY_INPUT", "doc"); return done(); }

  // 0. Raw-byte structural scan (Rust/wasm). Independent of pdf.js by construction:
  //    a different language, a different parse model, no shared blind spots.
  const scan = JSON.parse(scan_source_bytes(bytes)) as ByteScan; seen.add("bytescan");
  if (scan.eof_count  > 1) fail("MULTI_REVISION",  "@raw", scan.eof_count);   // prior revision intact
  if (scan.has_encrypt)     fail("ENCRYPTED",      "@raw");
  if (scan.has_xfa)         fail("XFA_PRESENT",    "@raw");
  if (scan.has_sig)         fail("SIGNED",         "@raw");   // PKCS#7 may embed the original
  if (scan.has_embedded)    fail("EMBEDDED_FILE",  "@raw");   // MUSE/Sierra XML sidecar
  if (scan.has_redact_annot)fail("UNAPPLIED_REDACT","@raw");
  if (scan.trailing_bytes)  fail("TRAILING_BYTES", "@raw", scan.trailing_bytes);

  const worker = new PDFWorker({ name: `verify-${crypto.randomUUID()}` });
  const task = getDocument({ data: bytes.slice(), worker, isEvalSupported: false,
    disableAutoFetch: true, disableStream: true, disableFontFace: true,
    useSystemFonts: false, useWorkerFetch: false, stopAtErrors: false });
  try {
    const doc = await task.promise;

    const { info, metadata } = await surface("info", () => doc.getMetadata());
    for (const k of Object.keys(info ?? {}))
      if (!INFO_STRUCTURAL.has(k)) fail("INFO_KEY", `info.${k}`);   // /Title carries name + MRN
    seen.add("xmp"); if (metadata) fail("XMP_PRESENT", "catalog./Metadata");
    const nz = (id: string, v: unknown, code: string, locus: string) => {
      seen.add(id);
      const n = v instanceof Map ? v.size : Array.isArray(v) ? v.length
              : v && typeof v === "object" ? Object.keys(v).length : v ? 1 : 0;
      if (n) fail(code, locus, n);
    };
    nz("attachments", await surface("attachments", () => doc.getAttachments()), "ATTACHMENTS", "/EmbeddedFiles");
    nz("outline",   await surface("outline",   () => doc.getOutline()),   "OUTLINE",     "/Outlines");
    nz("dests",     await surface("dests",     () => doc.getDestinations()),"NAMED_DESTS","/Dests");
    nz("pagelabels",await surface("pagelabels",() => doc.getPageLabels()), "PAGE_LABELS", "/PageLabels");
    nz("docjs",     await surface("docjs",     () => doc.getJSActions()),  "DOC_JS",      "/JavaScript");
    nz("markinfo",  await surface("markinfo",  () => doc.getMarkInfo()),   "MARKINFO",    "/MarkInfo");
    nz("fields",    await surface("fields",    () => doc.getFieldObjects()),"ACROFORM",   "/AcroForm");
    nz("permissions",await surface("permissions",()=>doc.getPermissions()),"ENCRYPTED",   "/Encrypt");
    nz("signatures",await surface("signatures",() => (doc as any).getSignatures?.()),"SIGS","doc");
    const occ = await surface("ocg", () => doc.getOptionalContentConfig());
    if (occ?.getOrder() !== null) fail("OCG", "/OCProperties");   // a layer set OFF is still present

    for (let p = 1; p <= doc.numPages; p++) {           // EVERY page. Never assume page 1 is the ECG.
      const page = await doc.getPage(p), at = `page[${p}]`;
      // includeMarkedContent surfaces /ActualText spans; disableNormalization stops pdf.js
      // folding ligatures/CID mojibake away and masking what is actually in the file.
      const tc = await surface("page.text", () => page.getTextContent(
        { includeMarkedContent: true, disableNormalization: true }));
      inv.textItems.push(...coalesceByBaseline(tc.items, 0.3 /*mm*/));   // MRNs arrive split
      if (tc.items.length === 0) inv.notes.push("NO_TEXT_LAYER");        // §7.3 copy, NOT "clean"
      // intent:"any" ⇒ RenderingIntentFlag.ANY, so Hidden/NoView annots are STILL returned.
      // "display" would silently pass a hidden FreeText carrying the patient name, and
      // getTextContent never sees annotation /AP /N text at all.
      nz("page.annots", await surface("page.annots", () => page.getAnnotations({ intent: "any" })),
         "ANNOTS", at);
      nz("page.structtree", await surface("page.structtree", () => page.getStructTree()), "STRUCT_TREE", at);
      nz("page.js",   await surface("page.js",   () => page.getJSActions()), "PAGE_JS", at);
      nz("page.xfa",  await surface("page.xfa",  () => (page as any).getXfa?.()), "PAGE_XFA", at);
      const ops = await surface("page.ops", () => page.getOperatorList(
        { intent: "display", annotationMode: AnnotationMode.DISABLE }));
      if (ops.fnArray.includes(OPS.beginAnnotation)) fail("ANNOT_GEOMETRY", at);
      inv.imageOps += ops.fnArray.filter(f => IMAGE_OPS.has(f)).length;   // report-only under D1
      inv.symbology.push(...detectSymbology(ops, page.getViewport({ scale: 1 }).transform));
      page.cleanup();
    }
  } catch (e) { fail("PARSE_THREW", (e as Error).name ?? "Error"); }
  finally { await task.destroy(); worker.destroy(); }

  for (const s of ALL_SURFACES) if (!seen.has(s)) fail("SURFACE_MISSING", s);  // V1
  return done();
}
```

### 3.3 Raster — adversarial source inventory + shape gate

Orientation is a PHI bug, not a cosmetic one: `createImageBitmap`'s `imageOrientation` default has moved across browsers and versions, so a mask or a panel map computed in the wrong space lands on the opposite page edge while every "did the pixels change" check still passes.

```ts
const bmp = await createImageBitmap(blob, { imageOrientation: "none",       // deterministic, universal
  premultiplyAlpha: "none", colorSpaceConversion: "default" });
if (bmp.width !== inv.rawWidth || bmp.height !== inv.rawHeight)
  throw new DeidRefusal([{ code: "DECODE_DIMS_DISAGREE_WITH_HEADER", locus: "decode" }]);
const { m, ow, oh } = orientTransform(inv.exifOrientation, bmp.width, bmp.height);  // 1..8; unknown ⇒ throw
```
`inv.exifOrientation` comes from our own segment walker (`inventoryJpeg` / `inventoryPng`), which also reports `exif` tag count and GPS presence, `exif-thumbnail` bytes, `xmp`, `mpf-auxiliary-images`, `iptc-8bim`, `jpeg-comment`, `heif-multi-item`, and `trailerBytes` after `FFD9`/`IEND`. An unparseable or out-of-range orientation is **fail-closed**, never "assume 1" — assuming 1 on a rotated phone photo is exactly the failure above. HEIC that `createImageBitmap` cannot decode ⇒ refuse (D13).

Masking (D4) fills `PHI_FILL_RGB = [255,0,255]` — saturated magenta — by **writing bytes into `ImageData`**, never `ctx.fillRect` (a fill is undone by any later repaint from the source bitmap, and a stale `globalAlpha` yields a translucent mask recoverable by contrast stretch). Never black (the tracker reads it as a giant ink run), never white (`TRK_INTERP_*` bridges it into a fabricated isoelectric ST), never blur or pixelation (reconstructible). Magenta is registered as an **occlusion**, so the tracker NaN-marks rather than interpolates — the same path as `GLARE_BLOB_MIN_MM2`. All mask rects carry a `space: "source"` brand; the applier takes no scale argument, which kills the "mask derived at 12 px/mm, applied at native 24 px/mm, covers one quarter of the target" bug. Bands are defined in **paper-mm** and mapped through the fitted homography, then the **AABB of the mapped quad** is filled — a strict superset, so tilt and perspective always push toward masking more. If the lattice fit fails, ingest refuses; there is nothing to store.

The gate that matters for storage is V3, and it is identical on both paths:

```rust
/// V3. A stored trace must be a function of time within its panel. A glyph cluster,
/// a barcode, a signature and a pen annotation are none of these.
pub fn assert_trace_shape(t: &LeadTrace, panel: &PanelRect, cfg: &Cfg) -> Result<(), Verify> {
    let cols = t.y_px.len();
    let spanned = t.y_px.iter().filter(|y| y.is_finite()).count() as f32 / cols as f32;
    if spanned < 0.60 { return Err(Verify::TraceSpan { lead: t.lead, spanned }); }
    if t.max_runs_per_col > 1 { return Err(Verify::TraceMultivalued { lead: t.lead }); }
    let bbox = t.bbox_mm();
    if bbox.w < 6.0 || bbox.h < 6.0 { return Err(Verify::TraceGlyphScale { lead: t.lead }); }
    if t.is_closed(0.1) { return Err(Verify::TraceClosed { lead: t.lead }); }
    Ok(())   // violation ⇒ the PANEL is dropped and flagged. Never "best effort".
}
```

### 3.4 Artifact side — V2, on the bytes that will actually be stored

The adversarial part is that this runs on the **serialized** record after a structured-clone round trip, not on the in-memory object. A `File`, `Blob` or — worst of all — a `FileSystemFileHandle` is structured-cloneable: persisting one stores a live, re-openable, permissioned pointer to the user's original file on disk, across sessions, with **zero bytes in the DB to reveal it**. That is the single worst thing this slice could accidentally do.

```ts
const CLOSED = new Set<string>([RECORD_SCHEMA, ...ALL_ENUM_MEMBERS]);     // build-time union
const UUID = /^(sub|ent)_[A-Za-z0-9_-]{22}$/, HEX = /^[0-9a-f]{64}$/;
const FORBIDDEN = ["File","Blob","FileSystemFileHandle","FileSystemDirectoryHandle",
                   "PDFDocumentProxy","ImageBitmap","ImageData","OffscreenCanvas","Uint8ClampedArray"];

export function auditRecord(v: unknown, path = "$", out: VerifyFailure[] = []): VerifyFailure[] {
  const ctor = (v as object)?.constructor?.name;
  if (ctor && FORBIDDEN.includes(ctor)) out.push({ code: "FORBIDDEN_TYPE", locus: `${path}:${ctor}` });
  else if (typeof v === "string") {
    if (!CLOSED.has(v) && !UUID.test(v) && !HEX.test(v))
      out.push({ code: "FREE_STRING", locus: path });                     // path only, never the value
  } else if (typeof v === "number") {
    if (Number.isInteger(v) && Math.abs(v) > 1e12)
      out.push({ code: "PLAUSIBLE_TIMESTAMP", locus: path });             // File.lastModified survives "no strings"
  } else if (ArrayBuffer.isView(v)) { /* Float32Array/Uint8Array/Int32Array only — checked by ctor above */ }
  else if (Array.isArray(v)) v.forEach((x, i) => auditRecord(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (!CLOSED.has(k) && !/^[a-z][a-z0-9_]*$/.test(k)) out.push({ code: "FREE_KEY", locus: path });
      auditRecord(x, `${path}.${k}`, out);
    }
  return out;
}

export async function verifyOrThrow(rec: AtlasEntry, inv: Inventory): Promise<VerifyToken> {
  const f: VerifyFailure[] = [];
  const round = structuredClone(rec);                        // exactly what IDB will persist
  f.push(...auditRecord(round));                             // V2
  f.push(...assertTraceShapes(round));                       // V3, mirror of the Rust gate
  // Raw byte scan of the serialized payload for any ASCII run >= 4 outside the enum set.
  const packed = pack_study(round);                          // Rust; also yields content_hash
  for (const run of asciiRuns(packed.bytes, 4))
    if (!CLOSED.has(run)) f.push({ code: "ASCII_IN_PAYLOAD", locus: `atls1@${run.offset}` });
  if (round.deid.surfaces.length !== ALL_SURFACES.length)
    f.push({ code: "SURFACE_MISSING", locus: "receipt" });   // V1, re-asserted at the store boundary
  if (round.deid.unresolved !== 0) f.push({ code: "UNRESOLVED", locus: "receipt" });
  if (f.length) throw new DeidRefusal(f);
  return VERIFY_TOKEN;                                       // module-private symbol
}
```

### 3.5 The canary — V4, `test/deid-poison.ts`, run in CI **and** once per session

```ts
export async function assertVerifierIsLive(): Promise<void> {
  const poisons: Array<[string, () => Promise<VerifyFailure[]>]> = [
    ["TEXT_ITEMS",       () => probe(poisonHiddenText())],     // "3 Tr" Tj under a filled black rect
    ["ANNOTS",           () => probe(poisonHiddenFreeText())], // /F 2 Hidden, text only in /AP /N
    ["INFO_KEY",         () => probe(poisonInfoTitle())],      // /Info /Title with a name + 9 digits
    ["ATTACHMENTS",      () => probe(poisonEmbeddedXml())],    // /Names /EmbeddedFiles
    ["XMP_PRESENT",      () => probe(poisonXmp())],            // catalog /Metadata dc:creator
    ["MULTI_REVISION",   () => probe(poisonIncremental())],    // valid file + appended revision
    ["FORBIDDEN_TYPE",   () => Promise.resolve(auditRecord({ h: new Blob([1]) }))],
    ["FREE_STRING",      () => Promise.resolve(auditRecord({ notes: "ZZLEAKZZ" }))],
    ["TraceGlyphScale",  () => Promise.resolve(assertTraceShapes(glyphClusterAsTrace()))],
  ];
  for (const [code, run] of poisons)
    if (!(await run()).some(x => x.code === code)) throw new Error(`E_VERIFIER_DEAD:${code}`);
}
```
The poison corpus is the regression suite: **every real-world leak we ever discover gets a new poison and a new required code**, and the corpus is re-run against every pdf.js bump (an API rename returning `{}` instead of `null` is how a verifier silently stops checking).

### 3.6 The receipt is itself a potential PHI store

`RemovalItem` records **category + site + count + character-class histogram + bbox in mm**. It never records the removed string, never a hash of it, never an HMAC of it — names, MRNs and dates are low-entropy and an HMAC whose key sits in the same database is a dictionary attack, not a protection. The plaintext is shown to the user **once**, in the confirm modal, from worker memory, masked by default, and is dropped when the modal closes. It is never persisted, never `console.*`-logged, never embedded in an `Error.message`, and never included in a crash report. `console.*` is lint-banned inside `web/src/deid/**`; the worker is served under `connect-src 'none'` so no accidental exfiltration path exists at all.

---

## 4. DATE / RELATIVE-TIMELINE DESIGN

**Decided.** Two stores that never merge.

```
ecg-atlas          payload; offsets only; DEFAULT
ecg-atlas-anchors  one record per subject; the ONLY calendar date in the app;
                   sealed under K_anchor, a DIFFERENT key from the CEK
```

```ts
export interface TimelineAnchor {              // K_anchor, separate store, excluded from export
  subject: SubjectId;
  anchor_entry: EntryId;
  anchor_instant_ms: number;                   // true UTC ms of the anchor acquisition
  date_format_used: "DMY" | "MDY" | "ISO" | "user";   // ES decision #40, per cart fingerprint
  source: "pdf-metadata" | "header-text" | "exif" | "user-entered";
}
export const place = (acq_ms: number | null, a: TimelineAnchor | null): number | null =>
  acq_ms === null ? null : a === null ? 0 : Math.round((acq_ms - a.anchor_instant_ms) / 1000);
```

**Rules.**
- `offset_s` is **integer seconds**, anchor ≡ 0. Not days: the repo's own pair is 19 min 5 s apart and day granularity refuses the comparison a clinician most wants.
- **Anchor policy: first-ingested.** Negative offsets are legal and are **never rebased** — rebasing rewrites every row, invalidates export deltas, and silently recolours the overlay under the user's hands. The only invariant is `offset_s(anchor_entry) === 0`.
- Deleting the anchor entry sets `anchor_entry = null` and **leaves every `offset_s` unchanged**. Deleting one study must never renumber the others.
- `offset_s: null` = *unplaced* (no readable acquisition time). Sorts last, renders dashed in `UNPLACED #94a3b8`, and is **barred from every serial verdict** — ES's own risk table: swapping study order turns evolving ST elevation into resolving ST elevation.
- No `year`, no time of day, no `File.lastModified` (D18, D19). `seq_in_day` is derived for display from `floor(offset_s/86400)` grouping, never stored.
- **Shredding the calendar** is one control, *Forget calendar dates*, which deletes the `atlas-anchor-v1` key record. Every anchor becomes undecryptable in a single write; all intervals, signals and comparisons keep working; only auto-placement of a *new* study is lost. Offered proactively once a subject has ≥ 2 entries.
- **Mapping back to reality** is the one-time re-identification slip: shown at the end of a successful ingest, before the original is released, carrying a random 128-bit `link_code` (Crockford base32, `K7Q2-9FMT-4X8N-P3RD`) beside the true date and every removed identifier. Print/copy only, never persisted, never in the audit log. Copy: *"This is the only copy. The app is about to forget it."* That is §164.514(c) exactly — a random code, with the mapping mechanism outside the app entirely.

**Consequences for the overlay and sorting.**
1. Sort key `(offset_s ?? +∞, content_hash)` ascending, everywhere in the overlay. Content-hash tiebreak is deterministic so two devices importing the same set produce the same order. A tie on `offset_s` with different hashes is physically impossible from one cart ⇒ flag `TIE_UNORDERED` and **refuse serial verdicts for that pair**; we genuinely do not know the order, so we must not invent one.
2. The library list may sort by anything; the **overlay always uses timeline order**. Separate state — one shared comparator is how this bug ships.
3. Colour ramp is **rank-ordinal**, domain = the *selected comparison set*, not the atlas. `RAMP_LIGHT = ["#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"]`, dark reversed. Adding a study recolours, and the legend says so, so nobody carries "blue = baseline" across two comparisons. Hard cap 6 tracings; beyond that rank labels `#1…#n` are mandatory and ES §7.33 trend sparklines take over.
4. The **reference study** (the one Δ is measured against) is marked by stroke weight (2.0 px vs 1.2 px), never by hue. Reference is usually oldest but is not required to be, and conflating role with age is a misread waiting to happen.
5. Legend rows format from `offset_s`: `< 1 h` → minutes, `< 48 h` → hours, else days. `#1 baseline · +0` / `#2 · +19 min` / `#3 · +294 d`. Unplaced reads `#? · time unknown`.
6. Beat markers currently use `#0b6ab8 / #c2410c / #a16207` (`web/src/try.ts`), which collides with Blues. In overlay mode move them to a separate channel — neutral grey ticks below the time axis — rather than recolouring studies.

**Regulatory posture, stated honestly.** No date element below year survives in the payload, so the payload is Safe-Harbor-shaped on (C). The *system* — payload plus a shreddable anchor — is Expert-Determination-shaped, because interval preservation is precisely what Safe Harbor destroys and Expert Determination exists to permit. Intervals are retained because they never leave the device; the export path offers coarsening to `minutes` or `days`; and the app never claims the result is de-identified.

---

## 5. DATA MODEL + STORAGE SCHEMA

### 5.1 `web/src/atlas/model.ts` — paste-ready

```ts
export const ENTRY_SCHEMA_VERSION = 1;          // sealed-payload shape. Independent of DB_VERSION.
export const CURRENT_DEID_POLICY  = 1;

export type SubjectId = string;   // "sub_" + base64url(crypto.getRandomValues(16)) — NEVER derived
export type EntryId   = string;   // "ent_" + same
export type AtlasKind = "personal" | "fixture" | "reference";
export type AgeBand = "0-4"|"5-9"|"10-14"|"15-19"|"20-24"|"25-29"|"30-34"|"35-39"|"40-44"
  |"45-49"|"50-54"|"55-59"|"60-64"|"65-69"|"70-74"|"75-79"|"80-84"|"85-89"|"90+";

export type Provenance =
  | { kind: "personal"; deid: DeidReceipt }                     // NON-OPTIONAL. Type-level fail-closed.
  | { kind: "fixture";  gen: GeneratorRef; truth: string; degradation: 0|1|2|3|4 }
  | { kind: "reference";gen: GeneratorRef; finding_id: string };  // finding_id ∈ closed enum

export interface DeidReceipt {
  policy: number;                       // must equal CURRENT_DEID_POLICY at store time
  ruleset_hash: string;                 // sha-256 hex of the serialized detector ruleset
  surfaces: SurfaceId[];                // MUST deep-equal ALL_SURFACES or put() throws
  confirmed_by_user: true;              // literal type. Unconstructible by any automated path.
  confirmed_at_ms: number;
  removed: RemovalItem[];               // category + site + count + char-class. NEVER a value.
  kept: KeptField[];                    // which enumerated fields were populated, and from where
  pages_scanned: number;
  unresolved: 0;                        // literal 0. Non-zero is unrepresentable.
  receipt_hash: string;
}
export interface RemovalItem {
  category: PhiCategory;                // A..R enum + "quasi_identifier" + "unclassified"
  site: "page_text"|"info_key"|"xmp"|"annotation"|"embedded_file"|"non_trace_ink"|"symbology"
      |"exif"|"exif_thumbnail"|"container_trailer"|"filename";
  page: number; bbox_mm: [number,number,number,number] | null;
  count: number; char_classes: [number,number,number,number];   // upper, lower, digit, other
}

/** PLAINTEXT metadata row. PHI-free BY SCHEMA: enums, numbers, hashes, random ids. Zero free text. */
export interface AtlasEntryMeta {
  id: EntryId; subject: SubjectId; schema: 1; kind: AtlasKind;
  offset_s: number | null;              // §4. null = unplaced ⇒ barred from serial verdicts.
  created_at_ms: number; updated_at_ms: number;      // ingest wall clock. NEVER used for ordering.
  content_hash: string;                 // sha-256 of ATLS1 bytes ONLY (no notes, no timestamps)
  source_hmac_b64: string | null;       // HMAC(K_dedupe, original bytes). Dropped on export.
  cond_hash: string;                    // ES decision #41
  deid_policy: number | null; deid_ruleset_hash: string | null;
  pipeline_version: string; atlas_generation: number;          // cross-tab resurrection guard
  tier: "A"|"B"|"C"|"D"; grade: "A"|"B"|"C"|"D"; grade_lead: LeadName;
  sigma_st_worst_mv: number; gain_confirmed: boolean; speed_confirmed: boolean;
  hp_hz: 0.05|0.5|0.67|1.0|null; lead_mask: number; n_beats_min: number;
  hr_bpm: number | null; rhythm_class: RhythmClass; has_source_vertices: boolean;
  review_state: "ok"|"deid_superseded"|"quarantined"|"import_unverified"; read_only: boolean;
  bytes_signal: number; bytes_sealed: number;
  key_id: string; sealed_iv_b64: string; signal_iv_b64: string;
}

/** SEALED payload. AES-GCM ciphertext under the CEK. Still zero free text (D28). */
export interface AtlasEntrySealed {
  id: EntryId; schema: 1; provenance: Provenance;
  age_band: AgeBand | null; sex: "M"|"F"|"unspecified";
  acquisition: {
    tier: "A"|"B"|"C"|"D"; source: "vector_pdf"|"scan"|"photo";
    hp_hz: 0.05|0.5|0.67|1.0|null; lp_hz: 40|100|150|null; mains_hz: 50|60|null;
    speed_mm_s: 25|50; speed_source: "column_width"|"header"|"user";
    gain_mm_mv: number[]; gain_source: "pulse"|"header"|"user"|"default"; gain_confirmed: boolean;
    gain_corroborated_by: ("pulse"|"header"|"user")[]; pulse_row_spread: number | null;
    grid_pitch_mm: { x: number; y: number }; grid_residual_mm: number | null;
    device_model: DeviceModel | null;                 // ALLOW-LIST enum. Never a serial number.
    layout: "3x4+1"|"3x4+3"|"6x2"|"12x1"|"cabrera_3x4";
  };
  quality: {
    sigma_hat_mv: Partial<Record<LeadName, number>>; grade: "A"|"B"|"C"|"D"; grade_lead: LeadName;
    n_beats: Partial<Record<LeadName, number>>; coverage_st: Partial<Record<LeadName, number>>;
    identity_ok: boolean; identity_residual_mv: number; hr_bpm: number;
    rhythm_class: RhythmClass; flags: ConditionFlag[]; hitl_done: HitlGate[];
  };
  link_code: string;                    // random 128-bit base32. The MAPPING is never stored.
  engine: { core: string; deid: string; policy: number };
}
/** Signals live in their own store, ATLS1-packed then encrypted. Never inside the meta row:
 *  IndexedDB deserializes the WHOLE value on read, so a 400-entry list view would decrypt
 *  and structured-clone ~350 MB instead of ~280 KB of metadata. */
```

### 5.2 `ATLS1` signal container — `crates/ecg-core/src/atlas/pack.rs`

Little-endian throughout; **say it in the code**, because a reader assuming host endianness is a silent corruption, not a crash.

```
off   size   field
0     5      magic "ATLS1"
5     1      u8   container_version = 1
6     2      u16  header_len
8     H      ContainerHeader: fs_milli_hz(u32=500_000) · n_strip(u32) · n_panel(u32) ·
                lead_mask(u16) · mm_per_sec_milli(u32) · mm_per_mv_milli[4](u32) · tier(u8) ·
                cond_hash[32] · pipeline_version[16] · has_source_vertices(bool)
                ── NO WALL-CLOCK FIELD. Packing the same study twice must be byte-identical. ──
8+H   1      u8   section_count
...   11×n   { u8 tag, u8 lead (0xFF = study-scoped), u32 off, u32 len, u8 dtype }
...          payloads, 4-byte aligned
tags: 0x01 SIG_MV  0x02 SIG_FLAGS  0x03 ENS_MV  0x04 ENS_SIGMA  0x05 ENS_N  0x06 R_SAMPLES
      0x07 BEAT_CLASS  0x08 FIDUCIALS  0x09 PANEL_TAU  0x0A SRC_VERT_T  0x0B SRC_VERT_V
```
`SRC_VERT_T` is `f32` seconds relative to the trace's own `t0` (`f64`, in the section preamble): at 10 s, f32 eps ≈ 0.95 µs, 500× finer than `ALIGN_SIGMA_TARGET_MS = 0.5`. No compression on signal sections (f32 ECG deflates ~12 % and costs a CPU pass on every read); the sealed JSON goes through `CompressionStream("deflate-raw")` (~75 %).

Measured size, 3×4 + strip, 10 s: **≈ 141 KB** without source vertices, **≈ 349 KB** with. Per entry total ≈ 0.15–0.36 MB — **an order of magnitude smaller than any design that stored a rendering**, which is the second-order dividend of D3.

`#[wasm_bindgen] pub fn pack_study(...) -> PackedStudy` returns `{ bytes, sha256_hex }`. TS never hashes signals itself: one implementation of `content_hash`.

### 5.3 IndexedDB schema — `web/src/atlas/db.ts`

```ts
export const DB_NAME = "ecg-atlas"; export const DB_VERSION = 1;
/** Export iterates THIS constant, never db.objectStoreNames — otherwise `keys` and `anchors`
 *  (the wrapped CEK and every calendar date) go out with everything else. */
export const EXPORTABLE_STORES = ["entries","sealed","signals","receipts","subjects"] as const;
/*
  entries   keyPath "id"      AtlasEntryMeta, PLAINTEXT, index-bearing
     idx by_subject_time ["subject","offset_s"]   idx by_kind "kind"
     idx by_content "content_hash" (NON-unique: a unique index throws ConstraintError from
       inside the transaction and aborts an import halfway; pre-check with getKey instead)
     idx by_source_hmac "source_hmac_b64"  idx by_deid "deid_ruleset_hash"
     idx by_review "review_state"          idx by_tier "tier"
  sealed    keyPath "id"          { id, iv_b64, ct: ArrayBuffer }
  signals   keyPath "id"          { id, iv_b64, ct: Blob }        // ATLS1, encrypted
  receipts  keyPath "receipt_id"  { receipt_id, id, iv_b64, ct }  idx by_entry "id"
  subjects  keyPath "subject"     fully sealed
  subjects_local keyPath "subject" { label, mnemonic, tags[] }    // D29 — NEVER exported
  anchors   keyPath "subject"     sealed under K_anchor           // §4 — separate key, shreddable
  keys      keyPath "key_id"      { key: CryptoKey, created_at_ms }
  prefs · audit(sealed) · migrations
*/
export const KEY_IDS = { cek: "atlas-cek-v1", anchor: "atlas-anchor-v1", dedupe: "atlas-dedupe-v1" };
// All generated with extractable === false. The CryptoKey OBJECT is structured-cloneable and
// storable; its bytes are unreachable from JS, from a compromised page, and from any export.
// Deleting the record is therefore a genuine crypto-shred — the only "erase" a browser offers.
const IV_BYTES = 12;                      // random per ciphertext; NIST SP 800-38D, ~10^4 messages
/** AAD binds ciphertext to its slot. Without it, a buggy migration or a hostile import could
 *  attach entry X's signals to entry Y's metadata and it would decrypt cleanly with a valid
 *  GCM tag — a silent cross-patient mix-up. */
const aad = (id: string, section: string, v: number) =>
  new TextEncoder().encode(`ecg-atlas|1|${id}|${section}|${v}`);
```

**Commit order, one `readwrite` transaction across `entries` + `sealed` + `signals` + `receipts`: payloads FIRST, meta row LAST.** A torn write then leaves an orphan payload (sweepable on open), never a meta row pointing at a receipt that was never written. `Blob` not `ArrayBuffer` for payloads: Chrome and Firefox file-back Blob values, so they never occupy the DB page cache; cap any single blob at 64 MB and assert it.

### 5.4 Versioning and the reprocessing flag

Two independent version numbers. **`DB_VERSION`** governs stores and indexes and is advanced in `onupgradeneeded`, which must be **structural only — no `await`, no `crypto.subtle`, no `fetch`, no `Date.now()`, no randomness**. An IndexedDB transaction auto-commits the moment the microtask queue yields to a non-IDB promise, and `crypto.subtle.decrypt` is exactly such a promise: any payload migration inside `versionchange` silently commits early and half-migrates the DB. This is the trap that eats teams; a lint rule fails CI on any `await` inside `onupgradeneeded`.

**`ENTRY_SCHEMA_VERSION`** governs the sealed payload and migrates **on read**:
```ts
const CHAIN: Record<number, (p: any) => any> = { /* 1: v1_to_v2, … */ };
const migrateOnRead = (p: any) => { while (p.schema < ENTRY_SCHEMA_VERSION) p = CHAIN[p.schema](p); return p; };
```
Each step is a pure function of the old payload. A background job (queued as a `migrations` row) persists results one entry per transaction; if it never runs, nothing breaks — "migrated" is a property of the read, not of the disk, so there is no half-migrated state. A migration that moves records to a new store **must** `deleteObjectStore` the old one; a test asserts `db.objectStoreNames` equals the expected set *exactly*, because a "v2 that removed field X" leaving the v1 store behind leaves PHI-bearing rows on disk. Downgrade is refused with *"This atlas was written by a newer version of the app"* — **never repaired by deletion**.

**The reprocessing flag.**
```ts
export const MIN_ACCEPTED_DEID = 1;
export const DEID_SUPERSEDES: Record<string /*ruleset_hash*/, {
  policy: number; severity: "advisory"|"reprocess-impossible"|"quarantine";
  affects: PhiCategory[]; note: string;
}> = { /* populated per release */ };
```
On app start, sweep `entries` by `by_deid`. `advisory` → a chip on the card. `quarantine` → `review_state = "quarantined"`; the entry drops out of overlays, export and comparison until the user acts.

**And the hard part, which must appear in the spec and in the UI: a later fix to the de-identifier can never repair an existing entry, because the original is gone (D36).** Actions offered on a superseded entry, and no others: **(1)** show the receipt — categories, counts, locations, and which categories the superseded ruleset could miss; **(2)** re-ingest from the EMR; **(3)** delete. Slice D's "re-scan the stored rendering" and "repair the rendering" are unavailable *by design*, because there is no rendering. The compensating fact, and it is a strong one: the stored payload contains **no text and no pixels**, so a later-discovered text-detection bug cannot expose anything that is not already absent. The only category a de-id fix could materially change is "glyph ink was stored as a trace", and V3 already blocks that at ingest — so a superseded ruleset is a stale *receipt*, not a live *leak*. Say exactly that in `strings.fail.olderPolicy`.

### 5.5 Quota, eviction, deletion

Chrome/Edge 60 % of disk; Firefox `min(10 % of disk, 10 GiB group limit)`; Safari 14+/iOS 17+ ~60 %, legacy 1 GiB. Against ~0.25 MB/entry: 1 000 entries ≈ 250 MB, so the binding constraint is legacy Safari at ~4 000 entries — comfortable. Gate writes at `usage + projected > 0.85 × quota`. WebKit deletes script-writable storage after **7 days without user interaction**; a home-screen web app keeps its own counter, so *Add to Home Screen* is a genuine mitigation and the UI offers it on iOS. Call `navigator.storage.persist()` **inside the click handler of the first atlas-write confirmation**, never on page load — engagement heuristics are more likely to grant, and a page-load call spends the request at zero engagement.

Eviction is a **data-loss** failure; privacy fails the other way, when data persists after the user believed it was gone. So: make eviction survivable (export), make deletion complete — in that order of effort.

`deleteAll(scope: AtlasKind[])` takes a **mandatory scope with no default**, so "reset fixtures" cannot reach `personal`. Full wipe order is the whole point: **keys first** — after that line every remaining byte is undecryptable ciphertext, so a crash mid-wipe leaves inert data rather than readable data. Then `anchors`, then every other store, then `deleteDatabase` (handling `blocked`), then `caches.keys()`, `localStorage`, `sessionStorage`, OPFS root, and any service-worker registration — **all six surfaces, then a hard reload.** A partial delete-all is worse than none. Then report the `navigator.storage.estimate()` delta.

Permitted claim, verbatim: *"The decryption key has been destroyed and the records removed. The app cannot guarantee the underlying bytes are physically unrecoverable."* Browsers expose no fsync, no TRIM, no overwrite; SSD wear levelling and copy-on-write filesystems (APFS, Btrfs, ZFS) retain old blocks by design; the profile may be in a backup; Firefox private-mode IndexedDB has been shown forensically recoverable (DFRWS 2024). Crypto-shred is the sanctioned alternative precisely because physical erasure on flash is not achievable from software.

---

## 6. PATTERN AND FIXTURE TABLES

### 6.1 Generator upgrades — REQUIRED before any pattern table is consumable

**(a) Limb leads become a frontal-plane vector.** Author each wave as `{amp_mv, axis_deg}`; project `V_L = g_L·A·cos(θ − φ_L)` with `φ = {I 0, II 60, III 120, aVR −150, aVL −30, aVF 90}`, `g = {1,1,1,√3/2,√3/2,√3/2}`. Compute I and II, then keep the existing `III = II − I`, `aVR = −(I+II)/2`, `aVL = I − II/2`, `aVF = II − I/2` path unchanged — algebraically identical, so both identities stay exact to f32 rounding and ES §5.4 C1 still validates. Negative `amp` is illegal; sign is carried by the axis. **Compatibility unit test** (must pass before regenerating goldens): `P 0.1528@49.1 · Q 0.0529@220.9 · R 1.0558@54.0 · S 0.0833@223.9 · T 0.3233@51.8` reproduces `DEFAULT_BEATS.I/II` to < 0.001 mV. Nine patterns are *defined* by a feature in a derived lead (inferior STEMI III>II, pericarditis II>III, LAFB/LPFB, RVH, AVB3, VT, WPW-B, lateral aVL) and fall out for free from vector authoring.

**(b) Clinical timing, Gaussians derived.** Author `PR_ms`, `QRS_ms`, `QTc_ms`; `k = QRS_ms/97.0`; `q c=−0.026k σ=0.007k`, `r c=0 σ=0.011k`, `s c=+0.028k σ=0.011k`, `onset=−0.0371k`, `J=+0.0599k` (recompute by bisection per pattern, §6.5); `σ_T = 0.048·mT`, `c_T = QT/1000 + onset − 2σ_T`; `σ_P = P_dur/4000`, `c_P = onset − PR/1000 + 2σ_P`. **Two defaults must change and the four committed goldens must be regenerated:** current `tCenter = 0.21` gives QT 343 ms → QTcF 358 at 68 bpm, i.e. pathologically short QT in the "normal" fixture → **DEFAULT `QTc_ms = 400`** (`c_T = 0.2669`); current P placement implies PR 177 → **DEFAULT `PR_ms = 160`**. Rate adaptation: `QT = QTc·RR^(1/3)` (Fridericia, matching ES §6.2), `PR = clamp(PR_base − 0.4(HR−68), 110, PR_base)`.

**(c) New components beyond P/Q/R/S/T:** `R2` (R′/notch), `T2` (bifid T), `U`, `delta` (WPW, σ≈0.018, c=onset+0.007), `J` (Osborn/early-repol notch, σ≈0.008). A morphology is a **list** of `WaveComponent`, not a fixed struct.

**(d) ST/PR segment model** replaces the ramp/fade: `st(dt) = (atJ + slope·(dt−J))·w(dt)` for `dt ≥ J`, `w` a cos² taper from `c_T+0.5σ_T` to `c_T+2.5σ_T`; shapes `linear` / `sagging` (digitalis, `−d·sin(π(dt−J)/L)`, d 0.06 mV) / `concave` (pericarditis, early repol). `slope` in mV/s — without it the UDMI-4 "horizontal or downsloping" requirement (ES §6.1) is untestable.

**(e) Rhythm becomes an event list**, atrial and ventricular trains generated **independently** and linked only by a conduction rule. AVB3, VT with AV dissociation and atrial flutter are *unrepresentable* if P is anchored at a fixed offset from R. Engines: `sinus(hr, rsa_pct)`, `sinus_pvc`, `avb1`, `avb2_wenckebach(pr_ladder[])`, `avb2_mobitz2`, `avb3`, `afib(RR = clamp(0.40 + Exp(0.267), 0.40, 1.60))`, `aflutter(sawtooth 5.0 Hz low-passed at 25 Hz, ratio)`, `vt(rate, dissoc_atrial, capture/fusion indices)`. **AF/flutter waves are added continuously across the whole record, including through QRS and T** — gating them on beats produces a fixture no real flutter ever looked like and lets a broken P-detector pass.

**(f) Artifacts POST-derivation (DEFAULT `artifact_mode: "post"`).** Real noise is per-electrode. Consequence to be *asserted, not discovered*: `RMS‖I−II+III‖ = RMS‖aVR+aVL+aVF‖ = sqrt(3σ² + 1.5W²)`. `"pre"` mode (residual exactly 0) exists only to isolate tracker error from identity error. Levels: noise {0, .010, .025, .060}; wander {0, .05, .15, .40} (0.05/0.15/0.33 Hz, ratio 1:0.6:0.3, random per-lead phase); mains {0, .03, .10} at 50/60 Hz with 0.15A third harmonic; emg 20–50 Hz limb-only; pop (1.2 mV step, τ 0.2 s); leadoff (1.2 s flat); clip ±1.5 mV.

**(g) Render-density constraint, easy to get silently wrong.** `renderPrintoutPdf` must emit **≥ 6 polyline points per mm of paper AND ≥ 8 points per mains cycle**. At 25 mm/s with 50 Hz mains that is 400 pts/s, well above the 150 pts/s geometric floor — mains sets the bound. Any decimation below it aliases mains into a low-frequency wobble and the notch filter will *appear* to work when it does not.

### 6.2 Reference atlas — 37 patterns. `pri` P0 = before any accuracy number is published.

Frontal plane, `amp mV @ axis deg`; every row is an override patch over `normal_sinus`. `·` = inherit. Precordial overrides in `tools/synth/patterns/precordial.ts` (format `p/q/r/s/t/ST_J(slope)`), reproduced in full there; the P0 rows are listed below the table.

| pri | id | HR | rhythm | PR | QRS | QTc | P | Q | R | S | T | ST_J (slope) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0 | `normal_sinus` | 68 | sinus | 160 | 97 | 400 | .153@49 | .053@221 | 1.056@54 | .083@224 | .323@52 | — |
| P0 | `stemi_ant_hyperacute` | 88 | sinus | 160 | 100 | 410 | · | · | · | · | .42@60 σT 67 | .05@280 (0) |
| P0 | `stemi_ant_acute` | 92 | sinus | 160 | 104 | 415 | · | · | · | · | .30@290 | .12@280 (0) |
| P0 | `stemi_inferior` | 58 | sinus | 190 | 100 | 400 | · | .06@280 | · | · | .45@95 | .30@100 (0) |
| P0 | `nstemi_std_twi` | 84 | sinus | 165 | 100 | 420 | · | · | · | · | .18@225 | .14@230 (−0.40) |
| P0 | `lvh_voltage` | 66 | sinus | 175 | 105 | 415 | · | · | 1.35@20 | .20@250 | .22@210 | .07@200 (−0.35) |
| P0 | `lbbb` | 72 | sinus | 165 | **150** | fix 440 | · | **0** | 1.10@30 +R2 .85@30 Δ+38 ms | · | .28@215 | .10@210 (0) |
| P0 | `rbbb` | 74 | sinus | 165 | **140** | fix 420 | · | · | .95@55 | .35@210 σs 20 | .30@52 | — |
| P0 | `afib` | mean 96 | afib | — | 97 | 400 | **0** | · | · | · | · | — |
| P1 | `stemi_ant_subacute` · `stemi_inf_late` · `stemi_lateral` · `pericarditis_st1/st2/st3` · `avb1` · `avb3` · `vt_mono` · `hyperk_k60/k70/k85` · `long_qt` · `wpw_a` · `early_repol` · `low_voltage` | | | | | | | | | | | |
| P2 | `wellens_b` · `rvh` · `lafb` · `lpfb` · `avb2_mobitz1` · `avb2_mobitz2` · `aflutter_2to1` · `hypok_u` · `brugada_t1/t2` · `wpw_b` · `electrical_alternans` · `digitalis_effect` | | | | | | | | | | | |

P0 precordial overrides (baseline = current `DEFAULT_BEATS`): `stemi_ant_acute` V1 ST .15 t .30 · V2 r .28 s −1.10 ST **.40** t .75 · V3 r .50 ST **.48** t .80 · V4 r 1.05 ST **.36** t .70 · V5 ST .15 t .45 · V6 ST .05 t .30. `lvh_voltage` V1 s **−2.20** · V2 s **−2.60** t .55 · V5 r **2.85** ST −.12(−.5) t −.35 · V6 r 2.30 ST −.10(−.5) t −.28. `lbbb` V1 r .05 s −1.80 ST **.20** t .55 · V5/V6 **q 0**, R2 Δ+38, ST −.12/−.10, t −.45/−.40. `rbbb` V1 r .15 s −.25 **R2 1.10 Δ+58 σ16** ST −.12 t −.35; V4–V6 σs 20. `afib` f-wave .10/.03×5.

**The assertion each P0 pattern buys — the only reason it is in the atlas. If the assertion is not implemented, do not generate the fixture.**

| id | REQUIRED assertion |
|---|---|
| `normal_sinus` | HR 68 ±0.5; every lead `NoChange` vs itself-at-another-seed, bound ≤ 0.06 mV |
| `stemi_ant_*` | ST_J V3 within 0.03 mV of analytic; contiguous-anterior regional flag |
| `stemi_inferior` | **III − II = +0.052 mV ±0.02**; aVL ST = −0.167 ±0.03; `reciprocal_change` set as a *modifier*, not a separate alert |
| `nstemi_std_twi` | slope at V4 = −0.40 mV/s ±0.15 **classified downsloping, not horizontal**; aVR ST +0.114 ±0.03 |
| `lvh_voltage` | Sokolow 5.05, Cornell 2.85 both positive; **ST rules suppressed** by `lvh_or_lbbb_or_paced` |
| `lbbb` | QRS 150 ±8 ms; q(V6) = 0; **JT/JTc primary, QTc suppressed** (ES §6.1) |
| `rbbb` | R′ present V1; S duration I ≥ 40 ms; **q(V6) ≠ 0** (the LBBB discriminator) |
| `afib` | RR SD > 0.10 s; no periodic atrial component 0.8–2 Hz; rhythm class `afib` |
| `hyperk_*` (P1) | T(V3) 1.30 ±0.08 **and T half-width ≤ 35 ms** — height alone does not separate hyperK from hyperacute MI |
| `hypok_u` (P2) | **QT measured 400 ±25 ms, NOT ~560 ms.** The U wave is the trap; a QT algorithm that runs into it fails here and nowhere else |
| `electrical_alternans` (P2) | alternans ratio 0.72 ±0.04 detected; **the ensemble averager must not average it away** — this is the ensemble's failure test |
| `long_qt` (P1) | QT 520 ±25; T2 lobe detected; QTcF 520 ±30 |
| `early_repol` (P1) | ST/T V6 < 0.25 (separates from pericarditis); J notch detected |

### 6.3 Serial pairs — end-to-end acceptance. Tolerance DEFAULT = ½·MDC95 for the pair tier.

| # | pri | pair | delta | expected recovered Δ (A↔A) | expected verdict |
|---|---|---|---|---|---|
| 1 | P0 | `evo_stemi_ant_hyper_to_acute` | ST_J V2 .12→.40, V3 .15→.48, V4 .12→.36 | +0.28 / **+0.33** / +0.24; ΔST V6 ≈ 0 | V2–V4 `Significant`, regional anterior flag; **V6 `NoChange ≤0.06`** |
| 2 | P0 | `evo_stemi_ant_acute_to_24h` | ST V3 .48→.14; new Q V2 0→−0.30 (26 ms); T V3 +.80→−.70 | −0.34; ΔQ amp −0.30, dur +26 ms; ΔT −1.50 | `new_or_deeper_q` and `new_t_inversion` both fire |
| 6 | P0 | `evo_new_lbbb` | QRS 97 → 150 | **+53 ms ±6** | `new_conduction_block`; all ST comparisons `Refused`/downgraded |
| 6b | P0 | `neg_ivcd_not_lbbb` | QRS 106 → 124, no LBBB morphology | +18 ms | `new_conduction_block` **must NOT fire** (ES §6.3 rank 5); 18 < 20 so `qrs_widening` must not either |
| 7b | P0 | `neg_qtc_rate_confound` | QT 400@HR 60 → 340@HR 95 | ΔQT −60; **ΔQTcF −4 ms ±14** | ΔQTcF `NoChange`; ΔHR 35 > 20 ⇒ ΔQTc forced `Indeterminate` |
| 9 | P0 | `evo_af_onset` | sinus 72 → afib 110 | ΔHR +38 | **`Refused(RateMismatch)`** on every ST comparison; `rhythm_class_changed` reported |
| 10 | P0 | `neg_nothing_changed` | seeds 2001 → 2002, HR 68 → 71 | every ΔST within ±0.03 of 0 | **every lead `NoChange`, bound ≤ 0.06.** The false-positive control — re-run at **every** L1 matrix cell |
| 11 | P0 | `neg_gain_only` | 10 → 20 mm/mV, render only | all Δ = 0 ±0.02 | non-zero ⇒ calibration was ignored |
| 11b | P0 | `neg_speed_only` | 25 → 50 mm/s, render only | ΔHR 0 ±2 bpm | any HR ratio near 2.0 ⇒ the ES §5.4 C2 paper-speed misread |
| 3,4,5,7,8,12 | P1 | inf resolving · pericarditis 1→2 · LVH 24 mo · QTc drug · hyperK ladder · **precordial electrode shift** | | | #12: `possible_precordial_electrode_shift` fires and `loss_of_r_progression` **must not** be reported as a true change (ES §6.3 rank 9, top false-positive generator) |
| 13,14 | P2 | lead reversal · pericarditis 2→3 | | | #13 `Refused(LeadReversalMismatch)` |

Pairs 1, 2, 6, 10 are additionally generated at **A↔C** and must assert the *widened* verdict from ES §5.2 — e.g. #1 at C↔C gives V2 `Significant` CI [0.12, 0.38] but V6 `Indeterminate`. **A pair reporting `NoChange` at C↔C where the spec says `Indeterminate` is a failing test even though the number is right.**

### 6.4 Fixture matrix — three layers. Full factorial over 11 axes is 6.7 × 10⁷ cells; unusable.

- **L0 — OFAT spine, 68 cells, CI on every commit.** Base: `normal_sinus`, 68 bpm, 25 mm/s, 10 mm/mV, 3x4+1, no artifacts, filter 0.05–150, vector. Vary exactly one level at a time. OFAT is the only design that **attributes** a regression to a single factor; a covering array tells you a row failed, not which factor did it. Both are needed; neither substitutes.
- **L1 — pairwise covering array, 45 rows, over the 8 acquisition axes** (HR 6 × speed 2 × gain 3 × layout 6 × noise 4 × wander 4 × mains 5 × filter 3). Strength-2 lower bound is 6×6 = 36; IPOG lands at ~45. **Generated ONCE with IPOG seeded at 7 and committed as a literal table in `tools/fixtures/ca2.json` — never regenerated per run**, or the fixtures change and reproducibility dies. Justification: 2-way detects 65–97 % of faults empirically (NIST/Kuhn), essentially no failure involves more than 6 factors.
- **L2 — targeted strength-3 only where the physics couples, 61 cells.** `{speed × gain × tier}` = 30, **full factorial** (smaller than any CA covering it) because mm-per-sample and mm-per-mV multiply into the same pixel budget. `{rhythm × noise × tier}` reduced to 3×3×3 = 27 (beat gating degrades non-linearly). Plus 4 explicit `{HR × speed × layout}` corners: (180, 25, 3x4+1), (180, 50, 12x1), (40, 25, 3x4+1), (150, 50, 6x2).
- **L3** all 37 patterns at tier vector (37) + the 9 P0 patterns at all 5 tiers (+36). **L4** 16 serial pairs A↔A + 12 cross-tier cells.
- **L5 — mandatory singletons, each the only cell exercising one code path:** `lvh_voltage @ 20 mm/mV` (R(V5) 2.85 × 20 = **57 mm > 46.5 mm row pitch** ⇒ guaranteed inter-panel collision, the commonest real failure of column-envelope tracking) · `electrical_alternans` (ensemble must not average) · `low_voltage @ 5 mm/mV` (1.4 mm R wave, under three grid pitches) · `vt_mono @ 50 mm/s 12x1` · `aflutter_2to1 @ 25 mm/s` (5 mm sawtooth period aliases against the 5 mm grid — deliberately adversarial) · `hypok_u` · `normal_sinus @ 3x4_nogrid` (pitch estimator must fail **closed**, not guess 1 mm) · `conf_lead_reversal` · `mains 50@.10 @ 25 mm/s` (render-density §6.1g).

**CI-REQUIRED: 93 cells** (L0 68 + L5 9 + L3-P0-vector 9 + L4-P0 8, deduped) ≈ 90 s generate + 60 s assert. **NIGHTLY: 280.** **Do not commit the PDFs** — 280 uncompressed ≈ 55 MB. Commit the fixture spec table, the seeds and the truth hashes; generate into `target/fixtures/` on demand. Exception: the 9 L5 singletons plus the 4 existing goldens are committed as binary, because they double as regression bait for the PDF writer itself.

### 6.5 Truth documents and the anti-tautology rules

**Truth is computed from the parameters by an independent closed-form evaluator, never measured from the generated samples and never copied from a previous run's output.** `tools/synth/truth.ts` must not import the sampling loop from `ecg.ts`; both are written independently from the equations in §6.1, because a shared bug passes the test while the product is wrong.

Exact rules. **Global QRS onset/J:** `E(t) = max over 12 leads of |Σ QRS-class components|` (P, T, U, ST excluded *by component id* — you know which Gaussian is which; a measurement tool does not); onset = smallest root of `E = 0.020 mV` from −0.20 s, J = largest root to +0.20 s, bisection to 1 µs. **T end** `= c_T + 2σ_T` exactly (the tangent extrapolation of a Gaussian hits baseline at exactly 2σ past peak — derive once, assert once). **ST_J = the full model evaluated at `t = J`, not the `atJ` parameter** — in V2 the S-wave Gaussian still contributes **−0.020 mV at J**, the same order as the entire vector-tier baseline error budget, so a test asserting against `intent.st.V2.atJ` is biased by 20 µV. Emit `stAtJ60_mV` too (leakage ~3 µV) and state which one each assertion uses. **Q duration** `= 2σ_q·√(2 ln(|A_q|/0.020))` — which is why patterns carry a `σq` override: amplitude alone cannot make a Q pathological by duration.

Rules 1–7, enforced in review:
1. **No test may assert against a stored measurement.** Legal comparands are `analytic.*` and `expected.*` only. A snapshot of pipeline output is banned. A metric with no closed form gets no assertion — it gets a `must_be_null`.
2. `spec_hash` (canonical JSON of `intent` + generator version) changing requires a regenerated truth **and a human-reviewed diff**; CI fails on a `spec_hash` change without a `test/fixtures/CHANGELOG` entry.
3. `sample_hash` changing while `spec_hash` is constant is a **hard failure, no override** — the generator regressed under a fixed spec.
4. `truth_hash` changing while `spec_hash` is constant is a **hard failure** — the analytic evaluator regressed, the most dangerous case, because it silently moves the target.
5. **Tolerances are derived, never typed.** Computed from the ES §5.2/§6.4 tables keyed by tier, with `tolerance_source` naming the table row. A hand-tuned tolerance is how a fixture stops testing anything; if one must widen, the *spec* changes, not the fixture.
6. **Every fixture carries its negative** — the metrics that must return `null`, `Refused` or `NoChange`. Minimum: `pr_interval_ms` and `p_duration_ms` `must_be_null` on **every** fixture (ES §6.4), and `neg_nothing_changed` runs at every L1 cell.
7. **Rhythm ground truth is the event list, not the R-peak array.** `analytic.events.ventricular_s` is what the QRS detector is scored against; `atrial_s` is separate and is **not** a detection target. Collapsing them is how AVB3 and VT fixtures accidentally pass.

---

## 7. SUBMISSION AND BROWSING UI

Interaction budget is a hard constraint, not an aspiration: **vector PDF into an existing subject = 2 interactions (drop; `Store 1 study`), ≤ 8 s human time; new subject = 3; a batch of 6 = 2.** Instrument `t_confirm` in dev builds; a regression above 12 s median on the fixture batch fails CI. The floor is equally hard: **exactly one confirm click per source file, and it can never be defaulted, remembered, auto-advanced, or suppressed by a "don't ask again" checkbox. No such checkbox exists, and there is no "apply to all".**

### 7.1 S0 — Drop
Full-viewport target, also the empty state. Accepts `application/pdf`, `image/png|jpeg|webp`, directory drop, paste, and `<input type="file" multiple>` for keyboard users. Files are **transferred** (not copied) into a single-use worker; the main thread's views are detached. Copy: `ingest.drop` = *"Drop ECGs here. PDF from a cart, a scan, or a phone photo."* · `ingest.neverUploaded` = *"Nothing is uploaded. This page cannot make network requests."*

### 7.2 S1 — Reading (no interaction)
Per-file progress; extraction, calibration, layout, label read, and the full §3 inventory, all in the worker. **Nothing is stored.** Copy: *"Reading on this device. Nothing has been stored yet."* Cancel returns to S0 and terminates the worker.

### 7.3 S2 — The ledger. The only mandatory screen.

**Left, vector PDF:** the recovered geometry **re-rendered from the polylines** — never the PDF page — with every text-bearing region drawn as a solid caution block. Caption: *"This is the tracing we recovered, not the original page. Grey blocks mark where text was."*
**Left, raster:** the source image, **screen only, never stored**, with the plot area outlined and everything outside it opaque. Caption: *"Only the outlined area is read. Everything outside it — headers, footers, anything written on the page — is discarded with the file. No part of this image is stored."*
**Left, third pane (both paths):** the atlas record **rendered back from the `Float32Array`s that will actually be stored**. This is the only honest evidence, because it is generated from the bytes that will persist.

**Right, top — the KEEP list, always expanded. This is what the human reviews.**
```
KEPT — these became settings. Check them.
  ✓ Paper speed   25 mm/s      from column width (25.00 mm ±0.02)        [change]
  ✓ Gain          10 mm/mV     from calibration pulse, all 3 rows        [change]
  ✓ Filter        0.05–150 Hz  from header text                          [change]
  ✓ Sex           Male         from header field                         [change]
  ✓ Age           45–49        exact age discarded                       [change]
  ✓ Study date    12 Mar 2025  → stored as “Day +14”. The date itself is not stored.
  ✓ Device        GE MAC 2000  matched to known model list               [change]
```
`ledger.keptWhy` = *"These seven values are what the measurements depend on. Everything else is discarded."*

**Right, middle — the REMOVE summary, collapsed, values masked.**
```
REMOVED — 63 items, by class.                                    [Show details ▾]
  Names 2 · Dates 4 · Identifiers 3 · Contacts 1 · Institution 2 · Unrecognised text 51
```
Expanded rows show class, page, bbox, and the value **masked** (`J•••• S••••`) with a per-row `Reveal`. Masked by default because a shared workstation or a screen share is a disclosure channel, and class + location already prove removal. `ledger.unrecognised` = *"Text we could not identify is removed. There is no option to keep it. If we cannot name it, we cannot promise it is not a patient identifier."*
If zero text items were recovered: *"No text layer was found. This file may draw text as vector paths; visual review of the left pane is the only check that applies."* — **not** "no PHI found". That distinction is the single most dangerous silent success in the feature.

**Right, bottom.**
```
Subject  [ Subject 3 · amber-kite ▾ ]  [+ New subject]
         Only studies of the same subject can be compared numerically.
[ Store 1 study ]    [ Discard ]
```
The dropdown pre-selects a subject **only** if the parsed identifier (held in worker memory for this session, never persisted) matched that subject's ingest-time value; on any doubt it defaults to `+ New subject`. Fail-closed direction: a spurious subject costs a merge; a wrong merge produces a cross-patient overlay, the worst outcome this screen can cause. `Discard` → *"Discarded. Nothing was stored and the file was not copied."*

**S3 — attention rows** (batch: one row per file; amber rows are *excluded*, the button reads `Store 4 of 6 studies` and never blocks on them): gain/speed sources disagree > 12 % (ES decision #39, modal); ambiguous date format (one radio, once per cart fingerprint, ES decision #40); any precordial label not CONFIDENT (ES decision #37, the HITL-1 lead grid); sex/age not found (`unspecified` allowed, sets `Unmeasurable(demographics_required)`); **unresolved detection — not resolvable by the user, refuse.**

**S4 — Stored.** Inline on the new card. *"Stored. The original file was not kept."* + 10 s `Undo`, with *"Undo deletes this entry. It cannot bring the original file back."*

### 7.4 Browse
Subjects are always the top grouping; **there is no flat "all studies" view**, because a flat list is where a cross-subject comparison gets attempted. Each subject shows a linear `offset_s` timeline ribbon with dots, and cards:

```
▁▂▇▁▂▇▁▂▇  (lead II, 2.5 s, DRAWN FROM signal.leads.II)
Day +14 · study 2 of 2
B · σ̂ 0.031 mV  (worst: V3)          ← letter NEVER appears alone
12 leads · 6 beats · HR 74 · sinus    ← n_beats on the face, not a tooltip (ES risk #9)
ⓥ Vector PDF  ⚡Gain: pulse  ⏱25 mm/s  ⌁HP 0.05 Hz  ✓Leads confirmed
⚠ V4 excluded — panel time-base mismatch
☐ Compare        Open ▸
```
Red chips for unilateral disqualifiers: `No calibration pulse`, `Filter setting unknown`, `Lead identity unresolved`, `Tier D — no amplitude comparison`, `< 2 beats`. Reference/fixture cards carry a permanent `Morphology only` chip. Sort is fixed (D32). Filters are multi-select chips, including the pivotal **`Comparable with ▸ [anchor]`**, which applies `precheck` and is how the user finds a valid partner without trial and error. Tags/labels live in `subjects_local`, have `spellcheck="false"` (Chrome Enhanced Spellcheck and Edge Editor **transmit form-field contents to the vendor** — an upload from an app whose core promise is no upload), `autocomplete="off"`, `data-lpignore="true"`, no `<form>` element, and carry `tags.caution` = *"Tags are stored on this device and never leave it, but they are also never checked for identifiers. Do not type names, dates, or record numbers."*

### 7.5 Selection and the readiness surface
Compare tray, 2–4 entries. **Cross-subject prevention is structural, not a warning:** the first selection fixes `tray.subject`; every card of a different `personal` subject has its checkbox `disabled`, dimmed with a diagonal hatch (never colour alone), reason in `aria-describedby`. There is no "compare anyway" affordance, and none can be added without deleting the `compareSerial` overload (D34).

`precheck(anchor, card)` — the same Rust function `gate_st` calls, metadata only, < 1 ms — drives a one-line readiness strip on **every card at browse time**, then a readiness panel in the tray:
```
✗ Different high-pass filter — 0.05 Hz vs 0.5 Hz
  ST comparison is blocked. A 0.5 Hz filter shifts the J point by up to 0.30 mV, larger than
  the change you would be looking for, and it cannot be undone.
  → What would fix this: re-print or re-export the later study at the same filter setting.
⚠ Detection limit in V2 is 0.13 mV, above the 0.10 mV clinical threshold. A change of clinical
  size can neither be confirmed nor excluded in this lead.
```
**Every block carries a `What would fix this` line; a block without a remedy fails review.** `Open overlay` is **never disabled by a block** (ES decision #50: render and overlay always) — its label becomes `Open overlay (morphology only) ▸`. Blocks suppress *numbers*, not *pixels*; disabling the button trains users to give up on cases where looking at the tracings is still the right move. Suppressed metrics render in the **same muted style as `Unmeasurable`**, never as a blank or a dash that reads as zero (ES risk #10).

### 7.6 Empty state — the app must be comprehensible at zero entries
Three panels: *"Your atlas is empty."* / *"See it work first."* — a bundled pair 14 days apart with 0.25 mV of new ST elevation in V2–V4 and nothing else changed, `[ Open the example ▸ ]` → tray → overlay, **one click from cold start to the primary deliverable with zero stored data and zero PHI risk**, chipped `Example data — not stored, disappears on reload` / *"Drop ECGs here."* Plus: *"The Reference tab has 31 ECG patterns you can look at right now."*

### 7.7 Persistent privacy chrome
Always visible: `⌂ On this device: 3 subjects · 7 studies · 1.2 MB · persistent ✓  [Manage]`. If `persisted() === false`: *"This browser has not marked the atlas as persistent. It may be deleted automatically — Safari clears this kind of storage after seven days without a visit. Export anything you need to keep."* `[Manage]` holds delete-all (§5.5) with a scrollable inventory rather than a type-DELETE challenge (typing a word trains people to type things without reading), *Forget who these are* (empties `subjects_local`), *Forget calendar dates* (§4), and the receipt view (`whatWeDid` + `notACertification` + `biometric`, counts only).

**Leak traps at this layer, each with its enforcement:** thumbnail cropped from the source page → A1, thumbnails are canvas renders of `signal.leads`; a `notes`/`title` field → D28; label reaching an export → D29, export signatures have no label field, tested with `ZZLEAKZZ` against every output byte stream; filename used as a card title, tooltip, error message or export filename → never read past MIME sniffing, exports are `ecg-atlas-<entryId>-<n>.png`; `FileSystemFileHandle` in IDB → §3.4; `document.title` set from a label (it reaches session restore, browser history, the OS window list and every screenshot, all outside delete-all) → static title, lint-banned assignment outside `main.ts`; label in a URL hash → routing state in memory, opaque ids only; `console.*` of extracted text or an `Error.message` embedding it, later exported by a diagnostics panel → enum codes only, `console.*` stripped in production; removed values persisted in the receipt → §3.6.

---

## 8. BUILD ORDER

Integrated with ES §7. The vector-PDF measurement path is mid-flight: **items 1–3 are done** (resample, running median, Pan–Tompkins). The single sequencing insight that makes this safe: **the atlas ships fixture- and reference-only first. The personal ingest path is gated behind the complete verifier and a live canary, so the entire storage layer is exercised at zero PHI risk before a real ECG ever touches it.**

### P0 — measurement path + the atlas that carries no PHI
| # | Item | Gate |
|---|---|---|
| ES 4–8 | `beats/panels.rs`, `dsp/detrend.rs`, `beats/median.rs`, `fiducial/`, `measure/` | unchanged from ES §7 |
| **A1** | **Generator upgrades §6.1 (a)–(g)** + regenerate the 4 goldens | compatibility unit test to < 0.001 mV; render-density assertion |
| **A2** | `ATLS1` pack/unpack in Rust + `content_hash` | pack twice → byte-identical; corrupt magic → throws, does not return zeros |
| **A3** | IndexedDB schema, encryption at rest, `assertStorable`, `auditRecord` | poison a record with a `Blob`/`FileSystemFileHandle`/free string → rejected |
| **A4** | Reference (31) + fixture atlases as bundled read-only JSON; browse UI; empty state | cold start renders, `Open the example` reaches the overlay in one click at zero stored bytes |
| **A5** | `serial/gate.rs` `precheck` + wasm binding; readiness strip and tray panel | property test: 10⁴ random `StudyMeta` pairs, `gate_st` returns `Refused` **iff** `precheck` returns a `Block`, zero disagreements |
| ES 9–13 | `serial/register.rs`, `serial/gate.rs`, `clinical/`, the ES §7.12 acceptance gate, the overlay UI | ΔST_J = 0.25 ± 0.03 mV in V2–V4 and \|ΔST\| < 0.03 elsewhere, **plus** the negative control that must fail |
| **A6** | `compareMorphology` / `MorphologyOverlay` (no numeric field), 2-row rendering, `MORPHOLOGY ONLY` band | `deno check` on a negative fixture calling `compareSerial` cross-subject must **fail** |
| ES 14 | All five HITL gates | before any raster work |
| **A7** | **CI-required fixture matrix: 93 cells** (§6.4 L0 + L5 + L3-P0 + L4-P0) | ≤ 150 s total; `neg_nothing_changed` at every cell |

### P1 — the personal ingest path, then raster
| # | Item | Gate |
|---|---|---|
| **B1** | §3.2 PDF source inventory, all `ALL_SURFACES`, all pages | every surface reached; `SURFACE_THREW` ⇒ refuse |
| **B2** | §3.4 `verifyOrThrow` + `sealAfterVerification` + `VerifyToken`; `atlas.put` accepts nothing else | lint rule: token/seal constructors importable only from `deid/gate.ts` |
| **B3** | §3.5 poison corpus + `assertVerifierIsLive`, in CI and once per session | all 9 poisons trip their code |
| **B4** | Required edits to existing code: `extractPageGeometry` → `annotationMode: DISABLE` and assert no `beginAnnotation`; **remove `fillStroke`/`eoFillStroke`/`closeFillStroke`/`closeEOFillStroke` from `STROKE_OPS`**; `getDocument` hardening flags + `bytes.slice()`; `paintOp` threaded through `Polyline` in `path-decode.ts`; re-export `PDFWorker`/`AnnotationMode` from `web/src/pdfjs.js` | fixtures with outlined-glyph headers and a Code-128 MRN must be rejected by the shape gate |
| **B5** | S2 ledger UI, §7.3, verbatim microcopy; banned-string lint over `web/dist/**` | interaction-budget test: 3 interactions first study, 2 second, none skippable |
| **B6** | §4 anchors store, `K_anchor`, one-time slip, *Forget calendar dates* | shred test: anchors undecryptable, every `offset_s` intact, all comparisons still produce verdicts |
| **B7** | Delete-all across all six surfaces + storage indicator + `persist()` on first write | write to all six, delete-all, assert all six empty |
| **B8** | `ECGATLAS1` export/import, PBKDF2 600 k, `MANIFEST` section hashes, import quarantine | wrong passphrase → clean failure, zero rows; truncate one section → manifest fails, zero rows; imported `personal` without a confirmed receipt → `quarantined` |
| ES 15–26 | Raster ingest in ES's strict order, **with §3.3 orientation and shape gates in front of the tracker** | ES 19 (nine quality gates) still lands before ES 23 (the tracker) |
| **B9** | Nightly fixture matrix, 280 cells; σ̂ calibration; `docs/accuracy/` | σ̂-vs-observed-p95, Q-vs-error, Bland–Altman per tier |

### P2
ES 27–33 unchanged, plus: **C1** the opt-in de-identified export artifacts — slice B's geometry-only PDF writer (zero text ops, zero fonts, no `/Filter`, single revision, 41-byte ASCII whitelist so a PDF string object is unencodable) and slice C's masked-PNG seal (chunk allow-list, exact-EOF-at-`IEND`, exact-fill re-decode, residual-CC re-detection), each gated by `crates/ecg-core/src/deid/bytescan.rs`; **C2** the opt-in cart-measurement keep (user draws the box, second review, persistent `CART_TEXT_KEPT_UNVERIFIED` flag that hard-excludes the record from export); **C3** DICOM/SCP-ECG ingest behind a strict tag allow-list with all UIDs regenerated and private tags dropped wholesale; **C4** N-study (> 2) overlay and trend sparklines.

**Add to `docs/engineering-spec.md` §8 as risk 0, outranking every measurement risk, per §9 below.**

---

## 9. TOP RISKS

**Stated plainly: PHI leakage risks rank above every measurement risk in this product.** A wrong ST number is a bounded, modelled, displayed error that a clinician can and does cross-check against the patient in front of them. A leaked identifier is unbounded, irreversible, invisible at the moment it happens, and defeats the one promise — nothing is uploaded, nothing identifiable is kept — on which every other feature is sold. Risks 0a–0f below outrank ES §8 risks 1–10 in their entirety; ES risk 1 (wrong gain) becomes risk 7 in the merged ordering.

| # | Risk | Why it looks fine | Mitigation | Runtime detector |
|---|---|---|---|---|
| **0a** | **A detector throws or is never reached, and the empty finding list is read as "clean"** | The UI shows a green ledger and stores the entry. Every visible surface is correct. This is the failure mode of *every* redaction tool that has ever failed publicly | V1: `receipt.surfaces` must deep-equal `ALL_SURFACES`; `SURFACE_THREW` is a refusal, never a fall-through; confirm-enabled derives from `verifier_ran_to_completion`, never from `findings.isEmpty()` | `SURFACE_MISSING` / `SURFACE_THREW` at ingest; the §3.5 canary, per session and in CI, refuses the whole session if any poison fails to trip |
| **0b** | **Glyph ink, a barcode, a signature or handwriting vectorised into a stored "trace"** — the one channel D1 does not close | The panel renders as a plausible squiggle; the atlas is 100 % numeric and passes every text check | V3 shape gate on both paths; `STROKE_OPS` drops all four fill-stroke ops; reject closed polylines and < 6 × 6 mm bboxes; symbology sweep with **no keep-list entry for any symbology** | `TraceMultivalued` / `TraceSpan < 0.60` / `TraceGlyphScale` / `TraceClosed` ⇒ panel dropped and flagged; `detectSymbology` hit ⇒ region discarded |
| **0c** | **A structured-cloneable handle or a free string lands in the payload** — `FileSystemFileHandle` persists a live, permissioned pointer to the identified original with **zero bytes in the DB to reveal it**; `notes?: string` added in six months becomes the header-text dump | Both are ordinary-looking code, both work, both pass every PDF-level check | D28 + `auditRecord` on the **structured-clone round trip**, at the store boundary; `FORBIDDEN` constructor list; reflection test asserting every payload string field is a literal union | `FORBIDDEN_TYPE` / `FREE_STRING` / `FREE_KEY` / `PLAUSIBLE_TIMESTAMP` (`File.lastModified` survives a "no strings" review because it is a number) |
| **0d** | **The audit trail becomes the PHI store** — removed values in the receipt, in `console.*`, in an `Error.message` a diagnostics export later ships, or a hash/HMAC of a low-entropy name | The audit view is a *privacy* feature, which makes it feel exempt | §3.6: category + site + count + char-class + bbox only; values shown once from worker memory, masked by default; `console.*` lint-banned in `deid/**`; errors carry codes; worker under `connect-src 'none'` | Assert no receipt string exceeds 32 chars outside the enum set; ingest a file containing `ZZLEAKZZ` and assert it appears in no console call, no log buffer, no IDB value, no DOM node, no `document.title`, no URL |
| **0e** | **Cross-patient merge** — a wrong subject auto-assignment, or a "compare anyway" hatch added later for the fixture workflow | Two real ECGs of two people overlay perfectly plausibly and produce a confident, wrong serial verdict; it is simultaneously a clinical error and a privacy breach | `SubjectId` is 128 random bits (D22); auto-merge suggestion lives in worker memory for the session only; subject linkage is always a user action; **never link by waveform similarity**; A4/D34 is an overload, so the hatch is unwritable | Ingest the same file into two profiles → different `SubjectId`; `deno check` on a negative fixture calling `compareSerial` cross-subject must fail |
| **0f** | **Partial delete-all** — IDB cleared, OPFS / Cache Storage / a service-worker registration / `localStorage` left behind; or "deleted" reported from the transaction's `oncomplete` while Chrome's Blob file cleanup is still pending | The UI says deleted and the list is empty | §5.5: **keys first**, then all six surfaces, then hard reload; report from a post-delete `estimate()` delta; never the word "erased" | Write to all six, delete-all, assert all six empty; assert every remaining ciphertext fails to decrypt |
| **0g** | **Orientation or coordinate-space mismatch on the raster path** — a mask or panel map computed in display space applied to a sensor-space buffer | The header mask lands on the footer and *every* "did the pixels change" check still passes, because the pixels **were** filled | `imageOrientation: 'none'` + our own EXIF transform + fail-closed on an unknown orientation; branded `space: 'source'` on every rect; AABB-of-mapped-quad is always a superset | `DECODE_DIMS_DISAGREE_WITH_HEADER`; the `phi-exif-orient-{2,4,5,6,7,8}` fixture set asserts coverage in **all eight** orientations |
| **0h** | **A superseded de-id ruleset with no repair path** (D36) | The entry looks like every other entry | Quarantine sweep on start by `by_deid`; three severities; only show-receipt / re-ingest / delete are offered — and the payload holds no text and no pixels, so the exposure is a stale receipt, not a live leak | `review_state = "quarantined"` excludes the entry from overlays and export until the user acts |
| **1–10** | **ES §8 measurement risks 1–10 in their existing order** — wrong gain, wrong paper speed, filter mismatch, panel↔lead mis-assignment, median filter eating the ST elevation, neighbour-lead merge, interpolated occlusion under a measurement window, uncorrected perspective, unequal beat counts, `Unmeasurable` read as zero | see ES §8 | see ES §8; unchanged by this document except that `hp_hz`, `gain_confirmed`, `n_beats` and `coverage_st` are now **stored properties** the atlas surfaces on every card and every readiness strip, so the block is visible before the user selects a pair rather than after | see ES §8; plus `precheck` running on hover, which is the same code `gate_st` runs |

**Sources.** 45 CFR §164.514 (b)(2)(i)(A)–(R) Safe Harbor, (b)(2)(ii) actual knowledge, (b)(1) expert determination, (c) re-identification codes · HHS OCR de-identification guidance · PDF 32000-1 §7.5.6 incremental updates; PDF Association ISO 32000-2 clause 7 errata · Bland, Iyer & Levchenko, *Glyph Positions Break PDF Text Redaction*, arXiv:2206.02285 (PoPETs 2023) — 11/11 tools leaked · Argelius Labs and pdf-tools.com surveys of covered-not-removed text, including the Dec 2025 Epstein-file releases · NSA *Redacting with Confidence* · aCropalypse / CVE-2023-21036; SANS ISC on cropping and redacting images safely · Android Motion Photo (MP4 after JPEG EOI) · DICOM PS3.15 Annex E · MIMIC-IV date shifting (Johnson et al., *Sci Data* 2023) · arXiv 2602.02776 (12-lead ECG identification, ~23 k identities, ELI250) · arXiv 2408.10228 (0.819 from PQRST features, n=223) · Attia et al., *Circ Arrhythm Electrophysiol* 2019;12:e007284 · arXiv 2605.01548 and *Sensors* 23(3):1507 (temporal drift, open-set degradation) · Presidio clinical-text recall 0.74 (PMC12477974) · NIST/Kuhn combinatorial t-way fault data · OWASP Password Storage (PBKDF2 600 k) · NIST SP 800-38D (GCM IVs) · MDN storage quotas and eviction; web.dev persistent storage; WebKit 7-day script-writable storage cap · DFRWS 2024, decrypting IndexedDB in Gecko private mode · Primary measurement: vendored pdf.js 6.2.108 against `/Users/svisagan/Programs/ecg-analysis/sample_ECGs/*.pdf`, all output character-masked; no PHI values appear in this document.