/**
 * The corpus, packed small enough to deploy.
 *
 * The atlas reads 1,207 records straight off disk in development, which is
 * 429 MB. That is fine for a dev server pointed at a PhysioNet download and
 * impossible for a static site: it is more than most hosts will serve and more
 * than any reader will wait for.
 *
 * Plain gzip barely dents it — 428 MB to 296 MB, 1.4x — because a signal file
 * is **channel-interleaved**: consecutive int16s come from different leads, so
 * the redundancy that is obviously there is not adjacent, and a general-purpose
 * compressor cannot see it. Two lossless rearrangements make it visible:
 *
 *  1. **De-interleave into per-lead planes**, so one lead's samples sit next to
 *     each other.
 *  2. **Store first differences** within each plane. Successive samples in a
 *     lead differ by a few units, so the deltas are small integers with a
 *     sharply peaked distribution — what an entropy coder is actually good at.
 *
 * Measured over all 1,207 atlas records, against gzip on the same trimmed
 * files, that takes 80.7 MB to 43.9 MB: **46% off**, and 9.7x against raw.
 *
 * How much it pays varies by source, from 1.7x on INCART to 4.7x on Ningbo, and
 * *not* in the way one would guess: PTB at 1000 Hz compresses worse (2.1-2.4x)
 * than PTB-XL at 500 Hz (2.9-4.7x), so this is about how much of the low bits
 * are noise, not about the sampling rate. The floor is what the test asserts,
 * because the floor is what has to hold for the format to be worth having.
 *
 * Neither step discards anything: `unpack(pack(bytes))` returns the original
 * file byte for byte, preamble included, which is what the round-trip test
 * asserts on real records rather than on synthetic ones.
 *
 * The container reproduces the *whole file* and not just the samples, so the
 * unpacked bytes go into `decodeWfdb` unchanged. The decoder, its header
 * parsing and its init-value check are therefore exercised identically whether
 * a record arrived packed or raw — no second decode path to keep honest.
 */

/**
 * The suffix a staged signal file carries.
 *
 * Deliberately not `.gz`, even though the contents are gzip. A great many
 * servers infer `Content-Encoding: gzip` from that extension, at which point the
 * browser decompresses the body transparently and hands this module bytes that
 * are already plain — so its own `gunzip` fails on every record, on some hosts
 * and not others, for a reason nothing in the code points at. A neutral suffix
 * means exactly one layer decompresses and it is this one.
 */
export const PACKED_EXT = ".pak";

/** "ECGP", so a truncated or mis-served file fails loudly instead of decoding. */
const MAGIC = 0x50474345;
const VERSION = 1;
const HEADER_BYTES = 14;

/**
 * Pack one signal file.
 *
 * `offset` is the format field's byte offset — 0 for a `.dat`, 24 for the
 * MATLAB v4 preamble on a `.mat`. Those bytes are copied verbatim rather than
 * regenerated, because reproducing the original file exactly is the property
 * that makes the packed path untestable-in-only-one-place.
 */
export function pack(
  file: Uint8Array,
  nSig: number,
  nSamples: number,
  offset: number,
): Uint8Array {
  const need = offset + nSamples * nSig * 2;
  if (file.byteLength < need) {
    throw new Error(`file is ${file.byteLength} bytes, need ${need}`);
  }
  const samples = new Int16Array(nSamples * nSig);
  // A copy rather than a view: `file` may be at an odd byte offset inside a
  // larger buffer, which an Int16Array view cannot address.
  new Uint8Array(samples.buffer).set(file.subarray(offset, need));

  const out = new Uint8Array(HEADER_BYTES + offset + nSamples * nSig * 2);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  out[4] = VERSION;
  out[5] = 0;
  view.setUint16(6, nSig, true);
  view.setUint32(8, nSamples, true);
  view.setUint16(12, offset, true);
  out.set(file.subarray(0, offset), HEADER_BYTES);

  const deltas = new Int16Array(out.buffer, HEADER_BYTES + offset, nSamples * nSig);
  for (let c = 0; c < nSig; c++) {
    let prev = 0;
    const plane = c * nSamples;
    for (let i = 0; i < nSamples; i++) {
      const v = samples[i * nSig + c]!;
      // Wraps mod 2^16 on the extremes, and the reconstruction below wraps the
      // same way, so the round trip is exact rather than merely usually exact.
      deltas[plane + i] = v - prev;
      prev = v;
    }
  }
  return out;
}

/** Rebuild the original signal file. Throws rather than returning nonsense. */
export function unpack(packed: Uint8Array): Uint8Array {
  if (packed.byteLength < HEADER_BYTES) {
    throw new Error(`packed record is ${packed.byteLength} bytes, too short to hold a header`);
  }
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  if (view.getUint32(0, true) !== MAGIC) {
    throw new Error("not a packed record (bad magic)");
  }
  if (packed[4] !== VERSION) {
    throw new Error(`packed record is version ${packed[4]}, this build reads ${VERSION}`);
  }
  const nSig = view.getUint16(6, true);
  const nSamples = view.getUint32(8, true);
  const offset = view.getUint16(12, true);

  const need = HEADER_BYTES + offset + nSamples * nSig * 2;
  if (packed.byteLength < need) {
    throw new Error(`packed record is ${packed.byteLength} bytes, header declares ${need}`);
  }

  const deltas = new Int16Array(nSamples * nSig);
  new Uint8Array(deltas.buffer).set(packed.subarray(HEADER_BYTES + offset, need));

  const out = new Uint8Array(offset + nSamples * nSig * 2);
  out.set(packed.subarray(HEADER_BYTES, HEADER_BYTES + offset));
  const samples = new Int16Array(nSamples * nSig);
  for (let c = 0; c < nSig; c++) {
    let prev = 0;
    const plane = c * nSamples;
    for (let i = 0; i < nSamples; i++) {
      // Int16Array truncates to 16 bits, which is the wrap that makes this the
      // exact inverse of the subtraction above.
      samples[i * nSig + c] = prev = (prev + deltas[plane + i]!) << 16 >> 16;
    }
  }
  out.set(new Uint8Array(samples.buffer), offset);
  return out;
}

/** Gzip, wherever `CompressionStream` is (browsers, and Node since 18). */
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return await collect(bytes, new CompressionStream("gzip"));
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return await collect(bytes, new DecompressionStream("gzip"));
}

async function collect(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
