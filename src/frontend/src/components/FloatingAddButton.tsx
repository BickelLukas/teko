import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { AddTaskModal } from "@/components/AddTaskModal";

export function FloatingAddButton() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("actions.add_task")}
        className="fixed bottom-20 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity hover:opacity-90 active:scale-95 sm:bottom-6 sm:right-6"
      >
        <IconPlus className="size-6" />
      </button>
      <AddTaskModal open={open} onOpenChange={setOpen} />
    </>
  );
}
