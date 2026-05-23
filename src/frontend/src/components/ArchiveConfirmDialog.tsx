import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DialogRoot, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hasChildren: boolean;
  isPending: boolean;
  onConfirm: () => void;
};

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  title,
  hasChildren,
  isPending,
  onConfirm,
}: Props) {
  const { t } = useTranslation("common");

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("task.archive_confirm_title", { title })}</DialogTitle>
        </DialogHeader>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasChildren
            ? t("task.archive_confirm_body_with_children")
            : t("task.archive_confirm_body")}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button variant="destructive" size="sm" disabled={isPending} onClick={onConfirm}>
            {t("actions.confirm_archive")}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
