import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from './theme-toggle';
import { useAuth } from '@/contexts/AuthContext';

const PAGE_TITLES: Record<string, string> = {
  '/admin':              'Dashboard',
  '/admin/clients':      'Clients',
  '/admin/appointments': 'Appointments',
  '/admin/marketing':    'Marketing',
  '/admin/settings':     'Settings',
};

const Layout = () => {
  const location = useLocation();
  const { user } = useAuth();

  const pageTitle = PAGE_TITLES[location.pathname] ??
    Object.entries(PAGE_TITLES).find(([p]) => location.pathname.startsWith(p + '/'))?.[1] ??
    'App';

  const userInitial = (user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex-1 min-w-0">
            <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 px-4">
              <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors" />
              <div className="w-px h-4 bg-border" />
              <h1 className="text-sm font-semibold text-foreground">{pageTitle}</h1>

              <div className="flex-1" />

              <ThemeToggle />

              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">{userInitial}</span>
              </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 bg-background">
              <div className="w-full max-w-full">
                <Outlet />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
};
export default Layout;