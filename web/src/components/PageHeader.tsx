import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Tabs, TabsItem } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { typeClass } from "@/lib/size-context";
import { fontWeights } from "@/lib/font-weight";
import type { IconComponent } from "@/lib/icon-context";
import { t } from "@/lib/i18n";

export function PageHeader({
  parent,
  leading,
  title,
  status,
  description,
  actions,
  tabs,
}: {
  parent?: { label: string; to: string };
  leading?: ReactNode;
  title: string;
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            {parent ? (
              <Link
                to={parent.to}
                className={cn(
                  typeClass("caption", "compact"),
                  "mb-0.5 inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground",
                )}
              >
                {parent.label}
                <ChevronRight className="size-3" aria-hidden />
              </Link>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className={cn(typeClass("display", "compact"), "title-tight truncate text-foreground")}
                style={{ fontVariationSettings: fontWeights.bold }}
              >
                {title}
              </h1>
              {status}
            </div>
            {description ? (
              <div className={cn(typeClass("body", "compact"), "mt-0.5 text-muted-foreground")}>{description}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </div>
  );
}

export type PageTab = { key: string; label: string; icon?: IconComponent };

/** Tabs whose selection lives in `?tab=`, so a reload or a shared link lands
 *  on the same view, and the browser back button walks through them. */
export function usePageTab(tabs: PageTab[]) {
  const [params, setParams] = useSearchParams();
  const current = params.get("tab");
  const index = Math.max(0, tabs.findIndex((tab) => tab.key === current));
  const select = (next: number) => {
    const key = tabs[next]?.key;
    if (!key) return;
    const copy = new URLSearchParams(params);
    if (next === 0) copy.delete("tab");
    else copy.set("tab", key);
    copy.delete("m");
    setParams(copy);
  };
  return { index, key: tabs[index]!.key, select };
}

export function PageTabs({ tabs, index, onSelect }: { tabs: PageTab[]; index: number; onSelect: (index: number) => void }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <Tabs selectedIndex={index} onSelect={onSelect} size="compact" className="w-max">
        {tabs.map((tab, i) => (
          <TabsItem key={tab.key} index={i} label={t(tab.label)} icon={tab.icon} />
        ))}
      </Tabs>
    </div>
  );
}
