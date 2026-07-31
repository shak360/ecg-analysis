/**
 * Generates the synthetic fixture set.
 *
 *   deno run -A tools/make-fixtures.ts
 *
 * The centrepiece is a *serial pair*: a baseline study and a follow-up that
 * differs by one precisely known change — 0.25 mV of ST elevation across V2-V4,
 * an anterior injury pattern — plus a modest heart-rate difference so the
 * registration has to handle differing rates rather than lining up trivially.
 *
 * That pair is the end-to-end acceptance target. After digitization and
 * registration the app must report roughly 0.25 mV of ST change in V2, V3 and V4
 * and essentially none elsewhere. Anything else is a bug with a known answer.
 */
import { generateEcg, LEAD_IDS, type LeadId } from "./synth/ecg.ts";
import { renderPrintoutPdf } from "./synth/pdf.ts";

const OUT = new URL("../test/fixtures/synthetic/", import.meta.url);

await Deno.mkdir(OUT, { recursive: true });

interface Fixture {
  name: string;
  headerText: string;
  heartRateBpm: number;
  stShiftMv?: Partial<Record<LeadId, number>>;
  mmPerSec?: number;
  mmPerMv?: number;
  noiseMv?: number;
  wanderMv?: number;
  seed: number;
}

const FIXTURES: Fixture[] = [
  {
    name: "serial-a-baseline",
    headerText: "SYNTHETIC — BASELINE — 2026-01-14 09:12",
    heartRateBpm: 68,
    seed: 1001,
  },
  {
    name: "serial-b-followup",
    headerText: "SYNTHETIC — FOLLOW-UP — 2026-02-13 14:38",
    heartRateBpm: 82,
    stShiftMv: { V2: 0.25, V3: 0.25, V4: 0.25 },
    seed: 1002,
  },
  // Same signal as the baseline, printed at double speed and half gain. The
  // registered result must match `serial-a-baseline` — this is the fixture that
  // catches calibration being silently ignored.
  {
    name: "calib-50mms-5mmmv",
    headerText: "SYNTHETIC — 50 mm/s 5 mm/mV — 2026-01-14 09:12",
    heartRateBpm: 68,
    mmPerSec: 50,
    mmPerMv: 5,
    seed: 1001,
  },
  // Noisy variant, for the quality gate and beat-rejection logic.
  {
    name: "noisy-wander",
    headerText: "SYNTHETIC — NOISY — 2026-03-02 22:05",
    heartRateBpm: 74,
    noiseMv: 0.025,
    wanderMv: 0.12,
    seed: 1003,
  },
];

const summary: Record<string, unknown>[] = [];

for (const fx of FIXTURES) {
  const ecg = generateEcg({
    heartRateBpm: fx.heartRateBpm,
    durationSec: 10,
    sampleRateHz: 500,
    stShiftMv: fx.stShiftMv,
    noiseMv: fx.noiseMv,
    wanderMv: fx.wanderMv,
    seed: fx.seed,
  });

  const { pdf, manifest } = renderPrintoutPdf(ecg, {
    mmPerSec: fx.mmPerSec,
    mmPerMv: fx.mmPerMv,
    headerText: fx.headerText,
  });

  await Deno.writeFile(new URL(`${fx.name}.pdf`, OUT), pdf);

  // Ground truth alongside the PDF: the exact samples that were drawn, so a test
  // can compare recovered millivolts against intended millivolts sample by sample.
  const truth = {
    name: fx.name,
    heartRateBpm: ecg.heartRateBpm,
    sampleRateHz: ecg.sampleRateHz,
    durationSec: ecg.durationSec,
    rPeakTimesSec: ecg.rPeakTimesSec,
    stShiftMv: ecg.stShiftMv,
    manifest,
    leads: Object.fromEntries(
      LEAD_IDS.map((l) => [l, Array.from(ecg.leads[l], (v) => Math.round(v * 1e4) / 1e4)]),
    ),
  };
  await Deno.writeFile(
    new URL(`${fx.name}.truth.json`, OUT),
    new TextEncoder().encode(JSON.stringify(truth)),
  );

  summary.push({
    name: fx.name,
    pdfBytes: pdf.length,
    mmPerSec: manifest.mmPerSec,
    mmPerMv: manifest.mmPerMv,
    hr: fx.heartRateBpm,
    stShift: fx.stShiftMv ?? {},
  });
  console.log(
    `  ${fx.name.padEnd(24)} ${String(pdf.length).padStart(8)} bytes  ` +
      `${manifest.mmPerSec} mm/s  ${manifest.mmPerMv} mm/mV`,
  );
}

console.log(`\n  ${summary.length} fixtures written to test/fixtures/synthetic/\n`);
