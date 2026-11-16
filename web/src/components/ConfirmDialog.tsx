import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Banner, BannerDescription } from "@/components/ui/banner";
import { errorText } from "../lib/format";
import { t } from "@/lib/i18n";

/** Confirms an action that can't be undone. Stays open (and shows the error)
 *  if the action fails, instead of closing as if it had worked. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Banner status="error">
            <BannerDescription>{error}</BannerDescription>
          </Banner>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (err) {
                setError(errorText(err, t("That didn't work.")));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t("Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
