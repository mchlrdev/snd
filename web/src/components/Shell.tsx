import { Outlet } from "react-router-dom";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarInsetTopbar } from "@/components/sidebar-app/inset-topbar";
import { OperatorSidebar } from "./OperatorSidebar";

export function Shell() {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <OperatorSidebar />
      <SidebarInset className="min-h-0 overflow-hidden !bg-[var(--page)]">
        <SidebarInsetTopbar />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-12 sm:px-10">
          <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
