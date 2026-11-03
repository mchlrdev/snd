import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Form, type Project, type Settings } from "./api";

type ProjectsContextValue = {
  projects: Project[];
  settings: Settings | null;
  loaded: boolean;
  /** Lädt Websites, alle Formulare und die Einstellungen neu (Sidebar-Zähler, Status). */
  reload: () => Promise<void>;
  formsFor: (projectId: string) => Form[];
  /** Kompatibel zum alten Aufruf: lädt die Formulare einer Website neu. */
  loadForms: (projectId: string) => Promise<void>;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [forms, setForms] = useState<Record<string, Form[]>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadForms = useCallback(async (projectId: string) => {
    const list = await api.forms(projectId);
    setForms((current) => ({ ...current, [projectId]: list }));
  }, []);

  const reload = useCallback(async () => {
    try {
      const [list, nextSettings] = await Promise.all([api.projects(), api.settings()]);
      const entries = await Promise.all(list.map(async (project) => [project.id, await api.forms(project.id)] as const));
      setProjects(list);
      setSettings(nextSettings);
      setForms(Object.fromEntries(entries));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      settings,
      loaded,
      reload,
      loadForms,
      formsFor: (projectId) => forms[projectId] ?? [],
    }),
    [projects, settings, loaded, reload, loadForms, forms],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error("useProjects braucht ProjectsProvider");
  return value;
}
