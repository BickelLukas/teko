import { format, formatDistance as dfnsFormatDistance } from "date-fns";
import { getNow } from "./clock.js";
import { de } from "date-fns/locale/de";
import { enUS } from "date-fns/locale/en-US";
import { useTranslation } from "react-i18next";
import type { Locale } from "date-fns";

const DATE_FNS_LOCALES: Record<string, Locale> = {
  en: enUS,
  de,
};

export function getDateFnsLocale(locale: string): Locale {
  return DATE_FNS_LOCALES[locale] ?? enUS;
}

export function useLocale() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("de") ? "de" : "en";
  return {
    locale,
    dateFnsLocale: getDateFnsLocale(locale),
  };
}

export function formatDateLong(date: Date, locale: string): string {
  const l = getDateFnsLocale(locale);
  const fmt = locale === "de" ? "EEEE, d. MMMM yyyy" : "EEEE, MMMM d, yyyy";
  return format(date, fmt, { locale: l });
}

export function formatDateShort(date: Date, locale: string): string {
  const l = getDateFnsLocale(locale);
  const fmt = locale === "de" ? "d. MMM" : "MMM d";
  return format(date, fmt, { locale: l });
}

// Locale-aware toLocaleDateString replacement
export function formatDateMedium(date: Date, locale: string): string {
  const l = getDateFnsLocale(locale);
  const fmt = locale === "de" ? "d.M.yyyy" : "M/d/yyyy";
  return format(date, fmt, { locale: l });
}

export function formatDistance(date: Date, locale: string, opts?: { addSuffix?: boolean }): string {
  return dfnsFormatDistance(date, getNow(), { locale: getDateFnsLocale(locale), ...opts });
}
