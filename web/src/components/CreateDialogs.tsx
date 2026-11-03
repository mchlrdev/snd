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
      setError(address.trim() ? origins : "Gib die Adresse der Website an.");
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
      setError(errorText(err, "Website konnte nicht angelegt werden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Website hinzufügen</DialogTitle>

        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <InputGroup className="w-full max-w-none">
            <InputField
              index={0}
              label="Adresse der Website"
              value={address}
              onChange={(next) => {
                setAddress(next);
                setError(null);
              }}
              placeholder="baeckerei-mueller.de"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              error={error ?? undefined}
            />
            <InputField
              index={1}
              label="Name"
              value={label}
              onChange={setLabel}
              placeholder={(() => {
                const parsed = originsFor(address);
                return typeof parsed === "string" ? "Bäckerei Müller" : new URL(parsed[0]!).host;
              })()}
            />
          </InputGroup>
          <DialogFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              Hinzufügen
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
      const form = await api.createForm(projectId, { name: name.trim() || "Kontakt", recipients: splitList(recipients) });
      await reload();
      onOpenChange(false);
      navigate(`/forms/${form.id}?tab=einbinden`);
    } catch (err) {
      setError(errorText(err, "Formular konnte nicht angelegt werden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Formular anlegen</DialogTitle>

        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <InputGroup className="w-full max-w-none">
            <InputField index={0} label="Name" value={name} onChange={setName} placeholder="Kontakt" autoFocus />
            <InputField
              index={1}
              label="Nachrichten schicken an"
              value={recipients}
              onChange={setRecipients}
              placeholder="info@beispiel.de"
              type="text"
              inputMode="email"
              error={error ?? undefined}
            />
          </InputGroup>
          <DialogFooter className="mt-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={busy}>
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
