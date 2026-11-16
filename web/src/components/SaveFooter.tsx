import { useCallback, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { typeClass } from "@/lib/size-context";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";
import { errorText } from "../lib/format";
import { t } from "@/lib/i18n";

type SaveState = { kind: "idle" } | { kind: "busy" } | { kind: "saved" } | { kind: "error"; message: string };

/** One save per section: each card commits only its own fields, so changing
 *  the mailbox never re-submits the name, and an error lands where it belongs. */
export function useSave() {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const timer = useRef<number | undefined>(undefined);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    window.clearTimeout(timer.current);
    setState({ kind: "busy" });
    try {
      await fn();
      setState({ kind: "saved" });
      timer.current = window.setTimeout(() => setState({ kind: "idle" }), 2400);
      return true;
    } catch (err) {
      setState({ kind: "error", message: errorText(err, t("Saving failed.")) });
      return false;
    }
  }, []);
  const fail = useCallback((message: string) => setState({ kind: "error", message }), []);
  return { state, run, fail, reset: () => setState({ kind: "idle" }) };
}

export function SaveFooter({
  state,
  dirty,
  label,
  onSave,
  extra,
}: {
  state: SaveState;
  dirty: boolean;
  label?: string;
  onSave: () => void;
  extra?: ReactNode;
}) {
  return (
    <>
      <div className="mr-auto min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {state.kind === "error" ? (
            <motion.p
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={spring.fast}
              className={cn(typeClass("caption", "compact"), "break-words text-destructive")}
              role="alert"
            >
              {state.message}
            </motion.p>
          ) : state.kind === "saved" ? (
            <motion.p
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={spring.fast}
              className={cn(typeClass("caption", "compact"), "flex items-center gap-1 text-muted-foreground")}
              role="status"
            >
              <Check className="size-3.5" /> {t("Saved")}
            </motion.p>
          ) : dirty ? (
            <motion.p
              key="dirty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: spring.fast.exit }}
              transition={spring.fast}
              className={cn(typeClass("caption", "compact"), "text-muted-foreground")}
            >
              {t("Unsaved changes")}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      {extra}
      <Button
        type="button"
        variant={dirty ? "primary" : "secondary"}
        size="compact"
        loading={state.kind === "busy"}
        disabled={!dirty || state.kind === "busy"}
        onClick={onSave}
      >
        {label ?? t("Save")}
      </Button>
    </>
  );
}
