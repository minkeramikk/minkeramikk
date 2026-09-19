/**
 * Text-identity segment codec (R5-TEXT-IDENTITY, task 1; checksum added in
 * final-review round 2 — see ADR 0011 amendment). Pure, no DB, no React —
 * wiring this into the `MK-...` code grammar is task 2 (config-code.ts is
 * not touched here).
 *
 *   <flags><checksum><noteHash?><textPayload?>
 *
 * - `flags` — ONE base-31 char (CODE_ALPHABET index, 0-30). Bit 0 (1) = an
 *   inscription follows; bit 1 (2) = a 4-char colour-wish hash follows; bits
 *   2-3 (4, 8) are reserved for card 6's text position (4 values: centre /
 *   top / bottom / back). That is the format's HARD CEILING, not an
 *   observation: 12 | 1 | 2 = 15, comfortably inside the 31 values one
 *   base-31 digit holds. A 5th flag bit would need 32 values and does not
 *   fit — widen the encoding (e.g. a second flags digit) before adding one,
 *   never widen the reserved mask past bits 2-3. `encodeTextSegment` throws
 *   if asked to set a bit outside bits 0-3; `decodeTextSegment` stays
 *   tolerant of any bit it doesn't recognise, so a bit this task's decoder
 *   doesn't interpret is still round-tripped in `flags` without blocking the
 *   inscription/hash decode (forward-compatible for card 6).
 * - `checksum` — exactly 2 base-31 chars, `fnv1a(flagsChar + rest) %
 *   31^2` (`rest` = the noteHash/textPayload that follow). ADR 0011 amendment
 *   round 2: `config-code.ts` reads `parts[cats.length]` as A CANDIDATE
 *   inscription slot, but a design that has ever LOST a category shifts an
 *   old code's real colour segment into that exact slot, and plenty of real
 *   option codes happen to decode as plausible "content" by pure
 *   flags-byte coincidence (measured ~25% of 2-char and 3-char option
 *   codes, before this fix). The checksum is what turns "plausible" into
 *   "confirmed": decode only accepts the slot as an inscription when the
 *   checksum matches (~1/961 chance for a genuine colour segment to pass by
 *   accident, not ~1/4) — otherwise it's an extra segment, ADR 0011's
 *   original rule, ignored exactly as it always said. Reuses `fnv1a`
 *   (below), not a second hash function.
 * - `noteHash` — exactly 4 base-31 chars when bit 1 is set. Identity only,
 *   never read back as text: a fingerprint so two lines with the same
 *   colours but different customer wishes don't silently merge on the
 *   snapshot (R5-GARANZIA.md §5).
 * - `textPayload` — the rest of the segment: UTF-8 bytes of the inscription,
 *   folded into one BigInt in base 31 over CODE_ALPHABET.
 *
 * Decoding NEVER throws (ADR 0011): garbage in -> null, caller degrades to
 * "no inscription" instead of an error page for a customer with a bad link.
 */

// CODE_ALPHABET lives in its own leaf module (no imports of its own),
// specifically so this file and config-code.ts (which imports this file's
// encodeTextSegment/decodeTextSegment/hashNote) don't form a cycle — see
// code-alphabet.ts's doc comment for the crash that cycle caused.
import { CODE_ALPHABET } from "./code-alphabet";
import { cleanCustomText } from "@/lib/orders/schema";
import { fnv1a } from "@/lib/palettes/palettes";

// BigInt() calls, not `1n` literals: tsconfig `target` is ES2017, and BigInt
// literal syntax needs ES2020+ regardless of the `lib` esnext entry.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const BYTE = BigInt(256);
const BASE = BigInt(CODE_ALPHABET.length); // 31

const FLAG_TEXT = 1;
const FLAG_NOTE_HASH = 2;
const KNOWN_FLAGS = FLAG_TEXT | FLAG_NOTE_HASH;
// Card 6's text position: bits 2-3, 4 values (0, 4, 8, 12). Any bit outside
// this mask is not a legal `flags` input — see the format contract above.
const RESERVED_MASK = 0b1100;
// The format's hard ceiling: 12 | 1 | 2 = 15, inside the 31 one digit holds.
const MAX_FLAGS = RESERVED_MASK | KNOWN_FLAGS;

const NOTE_HASH_LEN = 4;
// 31^4 buckets for the wish fingerprint — plenty to tell two different
// customer wishes apart within one order line; a same-bucket collision just
// means two DIFFERENT wishes get treated as one duplicate, never the reverse.
const NOTE_HASH_SPACE = CODE_ALPHABET.length ** NOTE_HASH_LEN;

// ADR 0011 amendment round 2: 2 base-31 chars, 31^2 = 961 buckets — enough
// to take a stray colour segment's chance of passing as "content" from
// ~1/4 (the old bare flags-bit coincidence) down to ~1/961. See the format
// doc comment above for the false-positive numbers this closes.
const CHECKSUM_LEN = 2;
const CHECKSUM_SPACE = CODE_ALPHABET.length ** CHECKSUM_LEN;

export interface DecodedTextSegment {
  text: string;
  noteHash: string | null;
  /** The raw flags value (0-30), including any bit this task doesn't know about. */
  flags: number;
}

/**
 * UTF-8 bytes -> BigInt, MSB-first, folded with a leading sentinel (the
 * accumulator starts at 1n instead of 0n). A bare `value = value*256+b` loop
 * starting at 0n can't tell "no leading zero byte" from "N of them" —
 * 0x0061 and 0x61 are the same integer, so a leading zero byte is silently
 * lost. Starting at 1n makes that leading position always non-zero, so it's
 * never the one a minimal byte-reconstruction (bigIntToBytes below) strips.
 * Exported for the round-trip test that would fail without this fold.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = ONE;
  for (const b of bytes) value = value * BYTE + BigInt(b);
  return value;
}

/** Inverse of bytesToBigInt: strips the sentinel by stopping at 1. */
export function bigIntToBytes(value: bigint): Uint8Array {
  const out: number[] = [];
  let v = value;
  while (v > ONE) {
    out.unshift(Number(v % BYTE));
    v /= BYTE;
  }
  return new Uint8Array(out);
}

export function bigIntToBase31(value: bigint): string {
  if (value <= ZERO) return "";
  let v = value;
  const digits: string[] = [];
  while (v > ZERO) {
    digits.unshift(CODE_ALPHABET[Number(v % BASE)]);
    v /= BASE;
  }
  return digits.join("");
}

/** null when `s` contains a char outside CODE_ALPHABET (corrupt input). */
export function base31ToBigInt(s: string): bigint | null {
  let value = ZERO;
  for (const ch of s) {
    const idx = CODE_ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = value * BASE + BigInt(idx);
  }
  return value;
}

/** `value`, written out as exactly `len` base-31 digits, left-padded with
 *  `CODE_ALPHABET[0]` — a fixed-width encode, so unlike `textPayload` there
 *  is no leading-zero-digit ambiguity: the width is always known in
 *  advance. Shared by `hashNote` and the segment checksum — one fixed-width
 *  digit writer, not two. */
function fixedWidthDigits(value: number, len: number): string {
  let v = value;
  const digits: string[] = [];
  for (let i = 0; i < len; i++) {
    digits.unshift(CODE_ALPHABET[v % CODE_ALPHABET.length]);
    v = Math.floor(v / CODE_ALPHABET.length);
  }
  return digits.join("");
}

/**
 * 4 base-31 chars, deterministic across builds/processes: reuses the FNV-1a
 * `palettes.ts` already has rather than a second hash function.
 */
export function hashNote(note: string): string {
  return fixedWidthDigits(fnv1a(note) % NOTE_HASH_SPACE, NOTE_HASH_LEN);
}

function isValidNoteHash(s: string): boolean {
  return s.length === NOTE_HASH_LEN && base31ToBigInt(s) !== null;
}

/**
 * ADR 0011 amendment round 2 — the 2-char checksum that turns "this slot
 * decodes as plausible content" into "this slot IS an inscription segment".
 * `flagsChar` + `rest` (the noteHash/textPayload that follow the checksum
 * in the actual segment string) is exactly what the segment would be
 * WITHOUT its checksum — computed the same way on encode (before the
 * checksum exists yet) and on decode (read back apart from the checksum),
 * so the two sides can never drift. Exported for the test that hand-builds
 * a segment byte-for-byte (the leading-zero-byte suite) — it has to use the
 * real checksum too, now that decode requires one.
 */
export function checksumFor(flagsChar: string, rest: string): string {
  return fixedWidthDigits(fnv1a(flagsChar + rest) % CHECKSUM_SPACE, CHECKSUM_LEN);
}

/**
 * `""` when there is nothing to say — decided by CONTENT: no inscription and
 * no wish hash, regardless of `input.flags`. (A reserved bit with no text or
 * hash to attach it to has nothing for card 6 to position, so it doesn't
 * force a segment into existence either.)
 *
 * `input.flags` lets a future caller (card 6) OR in bits 2-3 of its own; this
 * task's own bits (text present / hash present) are always derived from the
 * data, never taken from the caller, so they can't be encoded out of sync
 * with it. A bit outside bits 0-3 is a programming error — this is the
 * encode path, called only by our own code — so it throws rather than
 * silently wrapping into a different, wrong flags value (round 1 finding:
 * `flags: 28` used to fold to 0, which reads as "nothing to say" and
 * silently discarded a real inscription + hash).
 */
export function encodeTextSegment(input: {
  text?: string;
  noteHash?: string;
  flags?: number;
}): string {
  const cleanedText = input.text ? cleanCustomText(input.text) : "";
  const hasText = cleanedText.length > 0;

  const hasHash = typeof input.noteHash === "string" && isValidNoteHash(input.noteHash);

  const rawFlags = input.flags ?? 0;
  const extraFlags = rawFlags & ~KNOWN_FLAGS;
  if (extraFlags !== (extraFlags & RESERVED_MASK)) {
    throw new RangeError(
      `encodeTextSegment: flags ${rawFlags} sets a bit outside the reserved ` +
        `range (bits 2-3, mask 0x${RESERVED_MASK.toString(16)}); the format's ` +
        `hard ceiling is ${MAX_FLAGS} (one base-31 digit).`
    );
  }

  if (!hasText && !hasHash) return "";

  const flags = extraFlags | (hasText ? FLAG_TEXT : 0) | (hasHash ? FLAG_NOTE_HASH : 0);

  const flagsChar = CODE_ALPHABET[flags];
  let rest = "";
  if (hasHash) rest += input.noteHash;
  if (hasText) rest += bigIntToBase31(bytesToBigInt(new TextEncoder().encode(cleanedText)));
  return flagsChar + checksumFor(flagsChar, rest) + rest;
}

/**
 * `null` = unreadable OR simply not an inscription segment (garbage/an
 * ordinary option code that landed in this slot, ADR 0011 amendment round
 * 2) — never throws, and the caller can't tell the two apart, by design:
 * both mean "nothing to read here", never a crash.
 */
export function decodeTextSegment(seg: string): DecodedTextSegment | null {
  if (seg === "") return { text: "", noteHash: null, flags: 0 };

  const flagsChar = seg[0];
  const flags = CODE_ALPHABET.indexOf(flagsChar);
  if (flags < 0) return null; // corrupt flags digit

  const checksum = seg.slice(1, 1 + CHECKSUM_LEN);
  let rest = seg.slice(1 + CHECKSUM_LEN);
  // Too short for a checksum at all, or the checksum doesn't match what
  // flagsChar+rest actually hash to: this is NOT confidently an inscription
  // segment — an ordinary colour option code that ended up in this slot
  // (a design that lost a category) reads as "content" by pure flags-byte
  // coincidence roughly 1 time in 4 without this check; the checksum takes
  // that down to roughly 1 in 961. Treated exactly like any other garbage:
  // null, no throw, decodeConfigCode degrades to "no inscription".
  if (checksum.length !== CHECKSUM_LEN || checksum !== checksumFor(flagsChar, rest)) {
    return null;
  }

  let noteHash: string | null = null;
  if (flags & FLAG_NOTE_HASH) {
    const candidate = rest.slice(0, NOTE_HASH_LEN);
    if (!isValidNoteHash(candidate)) return null; // truncated or corrupt
    noteHash = candidate;
    rest = rest.slice(NOTE_HASH_LEN);
  }

  let text = "";
  if (flags & FLAG_TEXT) {
    const value = base31ToBigInt(rest);
    if (value === null) return null; // corrupt payload digit
    text = new TextDecoder("utf-8", { fatal: false }).decode(bigIntToBytes(value));
  }
  // bit0 clear but `rest` non-empty (unknown-bit payload this task doesn't
  // parse) is tolerated silently — dropped, not fatal (ADR 0011).

  return { text, noteHash, flags };
}
