import enStrings from "./en.json";
import deStrings from "./de.json";

type Strings = typeof enStrings;
type NestedKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? NestedKeyOf<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

type TranslationKey = NestedKeyOf<Strings>;

const dictionaries: Record<string, Record<string, string>> = {
  en: flattenDict(enStrings as Record<string, unknown>),
  de: flattenDict(deStrings as Record<string, unknown>),
};

function flattenDict(
  obj: Record<string, unknown>,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object") {
      flattenDict(v as Record<string, unknown>, key, out);
    }
  }
  return out;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    String(vars[key as string] ?? `{{${key}}}`),
  );
}

export function translate(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? dictionaries["en"]!;
  const fallback = dictionaries["en"]!;
  const template = dict[key] ?? fallback[key] ?? key;
  return vars ? interpolate(template, vars) : template;
}
