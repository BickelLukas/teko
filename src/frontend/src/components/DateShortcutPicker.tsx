import { addDays, addWeeks } from "date-fns";
import { useTranslation } from "react-i18next";
import { getNow } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

type Props = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  disabled?: boolean;
};

/**
 * Quick-pick shortcuts (Tomorrow / In 3 days / Next week) plus a full date
 * picker. Used in both the add-task modal and the schedule panel on existing
 * tasks.
 */
export function DateShortcutPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation("common");
  const now = getNow();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(now)}
        >
          {t("schedule_panel.today")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(addDays(now, 1))}
        >
          {t("schedule_panel.tomorrow")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(addDays(now, 3))}
        >
          {t("schedule_panel.in_3_days")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange(addWeeks(now, 1))}
        >
          {t("schedule_panel.next_week")}
        </Button>
      </div>
      <div className="min-w-0">
        <DatePicker
          value={value}
          onChange={onChange}
          min={now}
          {...(disabled ? { disabled: true } : {})}
          className="w-full"
        />
      </div>
    </div>
  );
}
