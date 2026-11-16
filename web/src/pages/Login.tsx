import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { api, AuthError } from "../api";
import { t } from "@/lib/i18n";

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
      setError(t("Enter your password."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      navigate(from && from.startsWith("/") && !from.startsWith("//") ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? t("That password is not correct.") : err instanceof Error ? err.message : t("Sign-in failed."));
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
          <p className={cn(typeClass("body", "compact"), "text-muted-foreground")}>{t("The inbox for your websites' forms.")}</p>
        </div>
        <InputGroup className="w-full max-w-none">
          <InputField
            index={0}
            label={t("Password")}
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
          {t("Sign in")}
        </Button>
      </form>
    </div>
  );
}
