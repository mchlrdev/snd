import { useState, type ReactElement } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Monitor, Moon, Plus, Settings as SettingsIcon, Sun, TriangleAlert } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupActions,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  type SidebarProps,
} from "@/components/ui/sidebar";
import { Tooltip } from "@/components/ui/tooltip";
import { MenuItem } from "@/components/ui/menu-item";
import { typeClass } from "@/lib/size-context";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { api, type Form, type Project } from "../api";
import { useProjects } from "../projects-context";
import { formWarning, websiteChecks } from "../lib/readiness";
import { SidebarUserFooter } from "@/components/sidebar-app/user-footer";
import { CreateWebsiteDialog } from "./CreateDialogs";
import { SiteIcon } from "./kit";
import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// The sidebar is the map: overview, then every website with its forms,
// always expanded. No counters — the app is for setup and statistics, not
// for reading mail. Only something that needs attention gets a mark: an
// amber triangle, with the reason on hover.
// ---------------------------------------------------------------------------

function Warning({ reason }: { reason: string }) {
  return (
    <Tooltip content={reason} side="right">
      <span className="ml-auto flex shrink-0 items-center pl-2 text-[var(--warning)]" aria-label={reason} role="img">
        <TriangleAlert className="size-3.5" />
      </span>
    </Tooltip>
  );
}

function websiteWarning(project: Project, forms: Form[]): string | null {
  const open = websiteChecks(project, forms).filter((check) => !check.done);
  if (open.length) return t("Still to do: {items}", { items: open.map((check) => check.title).join(", ") });
  return null;
}

export function OperatorSidebar(props: Omit<SidebarProps, "children">) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projects, formsFor, loaded } = useProjects();
  const theme = useTheme();
  const [creating, setCreating] = useState(false);

  const path = location.pathname;
  const activeFormId = path.match(/^\/forms\/([^/]+)/)?.[1] ?? null;
  const activeProjectId = path.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("snd – Overview")}
        >
          <img src="/snd.png" alt="" className="h-8 w-auto" />
        </button>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton icon={LayoutDashboard} isActive={path === "/"} onClick={() => navigate("/")}>
              {t("Overview")}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Websites</SidebarGroupLabel>
          <SidebarGroupActions>
            <Tooltip content={t("Add website")} side="top">
              <SidebarGroupAction aria-label={t("Add website")} onClick={() => setCreating(true)}>
                <Plus />
              </SidebarGroupAction>
            </Tooltip>
          </SidebarGroupActions>

          {loaded && projects.length === 0 ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={cn(
                typeClass("body", "compact"),
                "mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
              )}
            >
              <Plus className="size-3.5" /> {t("Add website")}
            </button>
          ) : null}

          <SidebarMenu>
            {projects.map((project, index) => {
              const forms = formsFor(project.id);
              const warning = websiteWarning(project, forms);
              return (
                // Each website is its own block: air above it, its forms in a
                // smaller, quieter type underneath.
                <SidebarMenuItem key={project.id} className={cn(index > 0 && "mt-4")}>
                  <SidebarMenuButton
                    icon={websiteIcon(project)}
                    isActive={activeProjectId === project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <span className="truncate font-medium text-foreground">{project.label}</span>
                    {warning ? <Warning reason={warning} /> : null}
                  </SidebarMenuButton>
                  {forms.length > 0 ? (
                    <SidebarMenuSub className="mt-1 border-border/60">
                      {forms.map((form) => {
                        // A website-level problem already marks the parent row.
                        const formWarn = warning ? null : formWarning(form, project);
                        return (
                          <SidebarMenuSubItem key={form.id}>
                            <SidebarMenuSubButton
                              size="sm"
                              isActive={activeFormId === form.id}
                              render={<button type="button" onClick={() => navigate(`/forms/${form.id}`)} />}
                            >
                              <span className="truncate">{form.name}</span>
                              {formWarn ? <Warning reason={formWarn} /> : null}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton icon={SettingsIcon} isActive={path.startsWith("/settings")} onClick={() => navigate("/settings")}>
              {t("Settings")}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarUserFooter
          name="Admin"
          avatar={
            <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[length:var(--fs-micro-compact,10px)] leading-[var(--lh-micro-compact,12px)] text-background">
              A
            </span>
          }
          menu={
            <>
              <MenuItem index={0} icon={Monitor} label={t("Match system")} checked={theme.pref === "system"} onSelect={() => theme.set("system")} />
              <MenuItem index={1} icon={Sun} label={t("Light")} checked={theme.pref === "light"} onSelect={() => theme.set("light")} />
              <MenuItem index={2} icon={Moon} label={t("Dark")} checked={theme.pref === "dark"} onSelect={() => theme.set("dark")} />
              <MenuItem
                index={3}
                icon={LogOut}
                label={t("Sign out")}
                onSelect={() => {
                  void api.logout().finally(() => navigate("/login"));
                }}
              />
            </>
          }
        />
      </SidebarFooter>

      <CreateWebsiteDialog open={creating} onOpenChange={setCreating} />
    </Sidebar>
  );
}

/** The row's icon slot takes a component; a website shows its own favicon
 *  (initials as fallback), so rows are told apart at a glance. */
const iconCache = new Map<string, () => ReactElement>();
function websiteIcon(project: Project) {
  const key = `${project.id}|${project.label}|${project.origins[0] ?? ""}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = function Tile() {
      return <SiteIcon project={project} size="sm" />;
    };
    iconCache.set(key, icon);
  }
  return icon;
}
