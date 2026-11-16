import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "../api";
import { errorText, splitList } from "../lib/format";
import { originsFor } from "./SettingsWidgets";
import { useProjects } from "../projects-context";
import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Creating is a short, focused interruption: two fields, one decision. That
// is what a modal is for. Everything longer (settings, reading messages)
// lives on the page instead.
// ---------------------------------------------------------------------------

export function CreateWebsiteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { reload } = useProjects();
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setAddress("");
      setError(null);
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const origins = originsFor(address);
    if (typeof origins === "string") {
      setError(address.trim() ? origins : t("Enter the website address."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const host = new URL(origins[0]!).host;
      const project = await api.createProject({ label: label.trim() || host, origins });
      await reload();
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(errorText(err, t("The website could not be created.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("Add website")}</DialogTitle>

        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <InputGroup className="w-full max-w-none">
            <InputField
              index={0}
              label={t("Website address")}
              value={address}
              onChange={(next) => {
                setAddress(next);
                setError(null);
              }}
              placeholder={t("millers-bakery.com")}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              error={error ?? undefined}
            />
            <InputField
              index={1}
              label={t("Name")}
              value={label}
              onChange={setLabel}
              placeholder={(() => {
                const parsed = originsFor(address);
                return typeof parsed === "string" ? t("Miller's Bakery") : new URL(parsed[0]!).host;
              })()}
            />
          </InputGroup>
          <DialogFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              {t("Add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateFormDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { reload } = useProjects();
  const [name, setName] = useState("");
  const [recipients, setRecipients] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setRecipients("");
      setError(null);
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = await api.createForm(projectId, { name: name.trim() || t("Contact"), recipients: splitList(recipients) });
      await reload();
      onOpenChange(false);
      navigate(`/forms/${form.id}?tab=embed`);
    } catch (err) {
      setError(errorText(err, t("The form could not be created.")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("Create form")}</DialogTitle>

        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <InputGroup className="w-full max-w-none">
            <InputField index={0} label={t("Name")} value={name} onChange={setName} placeholder={t("Contact")} autoFocus />
            <InputField
              index={1}
              label={t("Send messages to")}
              value={recipients}
              onChange={setRecipients}
              placeholder={t("info@example.com")}
              type="text"
              inputMode="email"
              error={error ?? undefined}
            />
          </InputGroup>
          <DialogFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              {t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
