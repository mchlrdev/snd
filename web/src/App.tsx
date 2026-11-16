import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { SizeProvider } from "@/lib/size-context";
import { api, AuthError } from "./api";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { ProjectDetailPage } from "./pages/ProjectDetail";
import { FormDetailPage } from "./pages/FormDetail";
import { SettingsPage } from "./pages/Settings";
import { ProjectsProvider } from "./projects-context";
import { t, useLocale } from "./lib/i18n";
import { TemplateEditorPage } from "./pages/TemplateEditor";

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<"loading" | "in" | "out" | "offline">("loading");

  useEffect(() => {
    api
      .me()
      .then(() => setState("in"))
      .catch((error) => setState(error instanceof AuthError ? "out" : "offline"));
    const onUnauthorized = () => setState("out");
    window.addEventListener("snd:unauthorized", onUnauthorized);
    return () => window.removeEventListener("snd:unauthorized", onUnauthorized);
  }, []);

  if (state === "loading") return null;
  if (state === "offline") {
    return (
      <div className="flex min-h-svh items-center justify-center px-6 text-center text-muted-foreground">
        {t("snd can't be reached right now. Reload the page in a moment.")}
      </div>
    );
  }
  if (state === "out") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function LegacyNewForm() {
  const { id = "" } = useParams();
  return <Navigate to={`/projects/${id}`} replace />;
}

export default function App() {
  // Re-renders every page when the language changes; module-level labels
  // are translated at render time.
  const locale = useLocale();
  return (
    <MotionConfig reducedMotion="user">
      <SizeProvider size="compact" key={locale}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <ProjectsProvider>
                <Shell />
              </ProjectsProvider>
            </RequireAuth>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/forms/new" element={<LegacyNewForm />} />
          <Route path="/forms/:id" element={<FormDetailPage />} />
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </SizeProvider>
    </MotionConfig>
  );
}
