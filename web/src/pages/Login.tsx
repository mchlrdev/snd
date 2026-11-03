import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, AuthError } from "../api";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      setError("Gib dein Passwort ein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      navigate(from && from.startsWith("/") && !from.startsWith("//") ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? "Das Passwort stimmt nicht." : err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-[var(--page)] px-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex w-full max-w-xs flex-col gap-5"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/snd.png" alt="snd" className="h-11 w-auto" />
          <p className={cn(typeClass("body", "compact"), "text-muted-foreground")}>Das Postfach für die Formulare deiner Websites.</p>
        </div>
        <InputGroup className="w-full max-w-none">
          <InputField
            index={0}
            label="Passwort"
            type="password"
            value={password}
            onChange={(next) => {
              setPassword(next);
              setError(null);
            }}
            autoComplete="current-password"
            autoFocus
            error={error ?? undefined}
          />
        </InputGroup>
        <Button type="submit" variant="primary" loading={busy} disabled={busy} className="w-full">
          Anmelden
        </Button>
      </form>
    </div>
  );
}
