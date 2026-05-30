import { addDays, addWeeks, format } from "date-fns";
import { useTranslation } from "react-i18next";
import { parseISO } from "date-fns";
import { getNow } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

type Props = {
  value: string | null;
  onChange: (date: string | null) => void;
  disabled?: boolean;
};

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Quick-pick shortcuts (Today / Tomorrow / In 3 days / Next week) plus a full
 * date picker. Operates on YYYY-MM-DD strings.
 */
export function DateShortcutPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation("common");
  const now = getNow();

  const dateValue = value ? parseISO(value) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(toDateStr(now))}
        >
          {t("schedule_panel.today")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(toDateStr(addDays(now, 1)))}
        >
          {t("schedule_panel.tomorrow")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(toDateStr(addDays(now, 3)))}
        >
          {t("schedule_panel.in_3_days")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(toDateStr(addWeeks(now, 1)))}
        >
          {t("schedule_panel.next_week")}
        </Button>
      </div>
      <div className="min-w-0">
        <DatePicker
          value={dateValue}
          onChange={(d) => onChange(d ? toDateStr(d) : null)}
          min={now}
          {...(disabled ? { disabled: true } : {})}
          className="w-full"
        />
      </div>
    </div>
  );
}
