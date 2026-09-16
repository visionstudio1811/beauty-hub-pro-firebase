import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './AppSidebar';
import { ThemeToggle } from './theme-toggle';
import { useAuth } from '@/contexts/AuthContext';

// Values are i18n keys resolved at render time.
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/admin':              'common:labels.dashboard',
  '/admin/clients':      'common:labels.clients',
  '/admin/appointments': 'common:labels.appointments',
  '/admin/marketing':    'common:labels.marketing',
  '/admin/invoices':     'common:labels.invoices',
  '/admin/settings':     'common:labels.settings',
};

const Layout = () => {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const { user } = useAuth();

  const pageTitleKey = PAGE_TITLE_KEYS[location.pathname] ??
    Object.entries(PAGE_TITLE_KEYS).find(([p]) => location.pathname.startsWith(p + '/'))?.[1] ??
    'layout.appTitle';
  const pageTitle = t(pageTitleKey);

  const userInitial = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex-1 min-w-0">
            <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 px-4">
              <SidebarTrigger
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors rtl:rotate-180"
                aria-label={t('layout.toggleSidebar')}
                title={t('layout.toggleSidebar')}
              />
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
