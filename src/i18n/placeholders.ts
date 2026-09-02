/**
 * R4-I18N / AC2 — blocking placeholder validation.
 *
 * A lost `{name}` or a broken plural is not ugly copy: it is a render crash on
 * the public site, written from an admin panel with no deploy in between. So
 * the check does not count braces with a regex — it hands both strings to the
 * SAME ICU parser next-intl uses at runtime and compares their signatures.
 *
 * The signature carries the TYPE as well as the name: `{count, plural, …}`
 * degraded to `{count}` keeps the name and changes the rendering, and must be
 * refused. Signature entries are written the way a human reads them, so the
 * error message needs no second vocabulary.
 */
import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

function label(element: MessageFormatElement): string | null {
  switch (element.type) {
    case TYPE.argument:
      return `{${element.value}}`;
    case TYPE.number:
      return `{${element.value}, number}`;
    case TYPE.date:
      return `{${element.value}, date}`;
    case TYPE.time:
      return `{${element.value}, time}`;
    case TYPE.select:
      return `{${element.value}, select}`;
    case TYPE.plural:
      return `{${element.value}, plural}`;
    case TYPE.tag:
      return `<${element.value}>`;
    default:
      // literal text and `#` inside a plural carry no contract
      return null;
  }
}

function collect(
  elements: MessageFormatElement[],
  out: Set<string>
): Set<string> {
  for (const element of elements) {
    const name = label(element);
    if (name) out.add(name);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const [branch, option] of Object.entries(element.options)) {
        out.add(`${name} → ${branch}`);
        collect(option.value, out);
      }
    }
    if (element.type === TYPE.tag) collect(element.children, out);
  }
  return out;
}

/** Every placeholder contract in a message. Throws on invalid ICU. */
export function icuSignature(message: string): Set<string> {
  return collect(parse(message), new Set());
}

export type PlaceholderCheck = { ok: true } | { ok: false; error: string };

/**
 * Admin-facing, English-only (i18n rule 5): the editor UI is English, the texts
 * it edits are NO/EN.
 */
export function checkPlaceholders(
  original: string,
  next: string
): PlaceholderCheck {
  let expected: Set<string>;
  try {
    expected = icuSignature(original);
  } catch {
    return {
      ok: false,
      error:
        "The original text is not valid ICU, so this key cannot be edited here. Tell the developers.",
    };
  }

  let actual: Set<string>;
  try {
    actual = icuSignature(next);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Invalid placeholder syntax (${code}). Copy the original text and change only the words around the placeholders.`,
    };
  }

  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = [...actual].filter((name) => !expected.has(name));
  if (missing.length === 0 && unexpected.length === 0) return { ok: true };

  return {
    ok: false,
    error: [
      missing.length ? `missing ${missing.join(", ")}` : "",
      unexpected.length ? `unexpected ${unexpected.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
