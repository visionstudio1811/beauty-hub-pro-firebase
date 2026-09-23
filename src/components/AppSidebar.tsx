
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar, Users, LayoutDashboard, Mail, Settings,
  LogOut, ChevronRight, ChevronDown,
  Package, ShoppingBag, Tag, Clock, FileSignature,
  ClipboardList, Receipt, FileText, Zap, TrendingUp, Sparkles,
  CalendarDays, Link as LinkIcon, Palette, CreditCard,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// labelKey values are i18n keys resolved with the 'shell' namespace at render time.
const SETTINGS_SECTIONS = [
  { id: 'general',          labelKey: 'sidebar.settingsSections.general',         icon: Settings },
  { id: 'users',            labelKey: 'sidebar.settingsSections.users',           icon: Users },
  { id: 'packages',         labelKey: 'sidebar.settingsSections.packages',        icon: Package },
  { id: 'treatments',       labelKey: 'sidebar.settingsSections.treatments',      icon: Calendar },
  { id: 'addons',           labelKey: 'sidebar.settingsSections.addons',          icon: Sparkles },
  { id: 'products',         labelKey: 'sidebar.settingsSections.products',        icon: ShoppingBag },
  { id: 'categories',       labelKey: 'sidebar.settingsSections.categories',      icon: Tag },
  { id: 'brands',           labelKey: 'sidebar.settingsSections.brands',          icon: Tag },
  { id: 'scheduling',       labelKey: 'sidebar.settingsSections.scheduling',      icon: Clock },
  { id: 'staff-schedules',  labelKey: 'sidebar.settingsSections.staffSchedules',  icon: CalendarDays },
  { id: 'scheduler-links',  labelKey: 'sidebar.settingsSections.schedulerLinks',  icon: LinkIcon },
  { id: 'waivers',          labelKey: 'sidebar.settingsSections.waivers',         icon: FileSignature },
  { id: 'intake',           labelKey: 'sidebar.settingsSections.intake',          icon: ClipboardList },
  { id: 'agreements',       labelKey: 'sidebar.settingsSections.agreements',      icon: FileSignature },
  { id: 'invoice-settings', labelKey: 'sidebar.settingsSections.invoiceSettings', icon: Receipt },
  { id: 'invoice-history',  labelKey: 'sidebar.settingsSections.invoiceHistory',  icon: FileText },
  { id: 'acuity',           labelKey: 'sidebar.settingsSections.acuity',          icon: Zap },
  { id: 'payments',         labelKey: 'sidebar.settingsSections.payments',        icon: CreditCard },
  { id: 'club',             labelKey: 'sidebar.settingsSections.club',            icon: Sparkles },
  { id: 'login-screen',     labelKey: 'sidebar.settingsSections.loginScreen',     icon: Palette },
];

const MARKETING_SECTIONS = [
  { id: 'overview',      labelKey: 'sidebar.marketingSections.overview',     icon: LayoutDashboard },
  { id: 'campaigns',     labelKey: 'sidebar.marketingSections.campaigns',    icon: Mail },
  { id: 'offers',        labelKey: 'sidebar.marketingSections.offers',       icon: Tag },
  { id: 'feedback',      labelKey: 'sidebar.marketingSections.feedback',     icon: TrendingUp },
  { id: 'integrations',  labelKey: 'sidebar.marketingSections.integrations', icon: Settings },
];

const TOP_ITEMS = [
  { icon: LayoutDashboard, labelKey: 'common:labels.dashboard',    path: '/admin' },
  { icon: Users,           labelKey: 'common:labels.clients',      path: '/admin/clients' },
  { icon: Calendar,        labelKey: 'common:labels.appointments', path: '/admin/appointments' },
];

// Items only visible to admins. Kept separate from TOP_ITEMS so the array
// passed to the renderer below already reflects the user's effective scope.
const ADMIN_TOP_ITEMS = [
  { icon: TrendingUp,      labelKey: 'common:labels.sales',    path: '/admin/sales' },
  { icon: Receipt,         labelKey: 'common:labels.invoices', path: '/admin/invoices' },
];

export function AppSidebar() {
  const { t } = useTranslation('shell');
  const { isRtl } = useLanguage();
  const location = useLocation();
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { currentOrganization } = useOrganization();
  const isAdmin = useIsAdmin();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const isOnSettings  = location.pathname === '/admin/settings';
  const isOnMarketing = location.pathname === '/admin/marketing';
  const [settingsOpen,  setSettingsOpen]  = useState(isOnSettings);
  const [marketingOpen, setMarketingOpen] = useState(isOnMarketing);
  const currentSection          = new URLSearchParams(location.search).get('section') || 'general';
  const currentMarketingSection = new URLSearchParams(location.search).get('section') || 'overview';

  useEffect(() => { if (isOnSettings)  setSettingsOpen(true);  }, [isOnSettings]);
  useEffect(() => { if (isOnMarketing) setMarketingOpen(true); }, [isOnMarketing]);

  useEffect(() => {
    const savedLogo = localStorage.getItem('lumiere-logo');
    setLogoUrl(savedLogo);
    const handleStorageChange = () => setLogoUrl(localStorage.getItem('lumiere-logo'));
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isCollapsed = state === 'collapsed';
  const tooltipSide = isRtl ? 'left' : 'right';
  const orgName = currentOrganization?.name || t('sidebar.defaultOrgName');
  const userInitial = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();
  const userName = user?.displayName || user?.email?.split('@')[0] || t('sidebar.defaultUserName');
  const signOutLabel = t('common:actions.signOut');

  const itemClass = (isActive: boolean) =>
    `group h-9 rounded-lg transition-colors duration-150
     ${isActive
       ? 'border border-[#C4A882] text-sidebar-accent-foreground bg-[#C4A882]/10'
       : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
     }
     ${isCollapsed ? 'w-10 mx-auto justify-center px-0' : 'px-3'}`;

  return (
    <Sidebar
      collapsible="icon"
      side={isRtl ? 'right' : 'left'}
      className="border-e-0"
      style={{ '--sidebar-width-icon': '4rem' } as React.CSSProperties}
    >
      {/* Workspace header */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'justify-center' : ''}`}>
          {logoUrl ? (
            <img src={logoUrl} alt={t('sidebar.logoAlt')} className="object-contain flex-shrink-0 rounded-md h-8 w-8" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-bold text-sm">{orgName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate leading-tight">{orgName}</p>
              <p className="text-xs text-sidebar-foreground truncate">{t('sidebar.workspace')}</p>
            </div>
          )}
          {!isCollapsed && <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground flex-shrink-0 opacity-60 rtl:rotate-180" />}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">

              {/* Top-level nav items — admin-only entries (Invoices) appended for admins */}
              {[...TOP_ITEMS, ...(isAdmin ? ADMIN_TOP_ITEMS : [])].map(item => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/admin' && location.pathname.startsWith(item.path));
                const label = t(item.labelKey);
                const button = (
                  <SidebarMenuButton asChild className={itemClass(isActive)}>
                    <Link to={item.path} className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
                    </Link>
                  </SidebarMenuButton>
                );
                return (
                  <SidebarMenuItem key={item.path}>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side={tooltipSide} className="ms-1">{label}</TooltipContent>
                      </Tooltip>
                    ) : button}
                  </SidebarMenuItem>
                );
              })}

              {/* Marketing — expandable; admin-only */}
              {isAdmin && (
              <>
                <SidebarMenuItem>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild className={itemClass(isOnMarketing)}>
                          <Link to="/admin/marketing" className="flex items-center justify-center">
                            <Mail className="h-4 w-4 flex-shrink-0" />
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side={tooltipSide} className="ms-1">{t('common:labels.marketing')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <SidebarMenuButton
                      onClick={() => setMarketingOpen(prev => !prev)}
                      className={`${itemClass(isOnMarketing)} cursor-pointer w-full`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 text-start">{t('common:labels.marketing')}</span>
                        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${marketingOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>

                {!isCollapsed && marketingOpen && (
                  <div className="ms-3 ps-3 border-s border-sidebar-border/50 space-y-0.5 mt-0.5 mb-1">
                    {MARKETING_SECTIONS.map(section => {
                      const isActive = isOnMarketing && currentMarketingSection === section.id;
                      return (
                        <SidebarMenuItem key={section.id}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            className={`h-8 rounded-md transition-colors duration-150 px-2
                              ${isActive
                                ? 'bg-primary/15 text-primary font-semibold'
                                : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                              }`}
                          >
                            <Link to={`/admin/marketing?section=${section.id}`} className="flex items-center gap-2">
                              <section.icon className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="text-xs">{t(section.labelKey)}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </div>
                )}
              </>
              )}

              {/* Settings — expandable; admin-only */}
              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild className={itemClass(isOnSettings)}>
                            <Link to="/admin/settings" className="flex items-center justify-center">
                              <Settings className="h-4 w-4 flex-shrink-0" />
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side={tooltipSide} className="ms-1">{t('common:labels.settings')}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <SidebarMenuButton
                        onClick={() => setSettingsOpen(prev => !prev)}
                        className={`${itemClass(isOnSettings)} cursor-pointer w-full`}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <Settings className="h-4 w-4 flex-shrink-0" />
                          <span className="text-sm font-medium flex-1 text-start">{t('common:labels.settings')}</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>

                  {/* Sub-items */}
                  {!isCollapsed && settingsOpen && (
                    <div className="ms-3 ps-3 border-s border-sidebar-border/50 space-y-0.5 mt-0.5 mb-1">
                      {SETTINGS_SECTIONS.map(section => {
                        const isActive = isOnSettings && currentSection === section.id;
                        return (
                          <SidebarMenuItem key={section.id}>
                            <SidebarMenuButton
                              asChild
                              isActive={isActive}
                              className={`h-8 rounded-lg transition-colors duration-150 px-3
                                ${isActive
                                  ? 'bg-[#C4A882]/50 text-white font-semibold'
                                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                }`}
                            >
                              <Link
                                to={`/admin/settings?section=${section.id}`}
                                className="flex items-center gap-2"
                              >
                                <section.icon className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="text-xs">{t(section.labelKey)}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* User footer */}
      <SidebarFooter className="border-t border-sidebar-border px-2 py-3">
        <div className={`flex items-center gap-2.5 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 ring-1 ring-primary/30">
            <span className="text-xs font-semibold text-primary">{userInitial}</span>
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-sidebar-accent-foreground truncate leading-tight">{userName}</p>
              <p className="text-xs text-sidebar-foreground truncate opacity-70 ltr-inline">{user?.email}</p>
            </div>
          )}
          {!isCollapsed ? (
            <div className="ms-auto flex items-center gap-0.5">
              <LanguageSwitcher
                variant="compact"
                className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              />
              <button
                onClick={() => setLogoutConfirmOpen(true)}
                className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                title={signOutLabel}
                aria-label={signOutLabel}
              >
                <LogOut className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  aria-label={signOutLabel}
                >
                  <LogOut className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide} className="ms-1">{signOutLabel}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {isCollapsed && (
          <div className="flex justify-center mt-1">
            <LanguageSwitcher
              variant="compact"
              className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            />
          </div>
        )}
      </SidebarFooter>

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.logoutDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sidebar.logoutDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void signOut(); }}>{t('sidebar.logoutDialog.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
