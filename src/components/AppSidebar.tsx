
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Calendar, Users, LayoutDashboard, Mail, Settings,
  LogOut, ChevronRight, ChevronDown,
  Package, ShoppingBag, Tag, Clock, FileSignature,
  ClipboardList, Receipt, FileText, Zap,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SETTINGS_SECTIONS = [
  { id: 'general',          label: 'General',          icon: Settings },
  { id: 'users',            label: 'Users',            icon: Users },
  { id: 'packages',         label: 'Packages',         icon: Package },
  { id: 'treatments',       label: 'Treatments',       icon: Calendar },
  { id: 'products',         label: 'Products',         icon: ShoppingBag },
  { id: 'categories',       label: 'Categories',       icon: Tag },
  { id: 'scheduling',       label: 'Scheduling',       icon: Clock },
  { id: 'waivers',          label: 'Waivers',          icon: FileSignature },
  { id: 'intake',           label: 'Intake Forms',     icon: ClipboardList },
  { id: 'invoice-settings', label: 'Invoice Settings', icon: Receipt },
  { id: 'invoice-history',  label: 'Invoice History',  icon: FileText },
  { id: 'acuity',           label: 'Acuity',           icon: Zap },
];

const MARKETING_SECTIONS = [
  { id: 'overview',      label: 'Overview',      icon: LayoutDashboard },
  { id: 'campaigns',     label: 'Campaigns',     icon: Mail },
  { id: 'integrations',  label: 'Integrations',  icon: Settings },
];

const TOP_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',    path: '/admin' },
  { icon: Users,           label: 'Clients',      path: '/admin/clients' },
  { icon: Calendar,        label: 'Appointments', path: '/admin/appointments' },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { validateUserRole } = useSecurityValidation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);

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

  useEffect(() => {
    const checkAccess = async () => {
      if (user) {
        const canAccess = await validateUserRole(['admin', 'staff']);
        setShowSettings(canAccess);
      }
    };
    checkAccess();
  }, [user, validateUserRole]);

  const isCollapsed = state === 'collapsed';
  const orgName = currentOrganization?.name || 'Beauty Hub';
  const userInitial = (user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const itemClass = (isActive: boolean) =>
    `group h-9 rounded-md transition-colors duration-150
     ${isActive
       ? 'bg-primary text-primary-foreground hover:bg-primary/90'
       : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
     }
     ${isCollapsed ? 'w-10 mx-auto justify-center px-0' : 'px-3'}`;

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0"
      style={{ '--sidebar-width-icon': '4rem' } as React.CSSProperties}
    >
      {/* Workspace header */}
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'justify-center' : ''}`}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="object-contain flex-shrink-0 rounded-md h-8 w-8" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-bold text-sm">{orgName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate leading-tight">{orgName}</p>
              <p className="text-xs text-sidebar-foreground truncate">Workspace</p>
            </div>
          )}
          {!isCollapsed && <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground flex-shrink-0 opacity-60" />}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">

              {/* Top-level nav items */}
              {TOP_ITEMS.map(item => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/admin' && location.pathname.startsWith(item.path));
                const button = (
                  <SidebarMenuButton asChild isActive={isActive} className={itemClass(isActive)}>
                    <Link to={item.path} className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
                    </Link>
                  </SidebarMenuButton>
                );
                return (
                  <SidebarMenuItem key={item.path}>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="right" className="ml-1">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : button}
                  </SidebarMenuItem>
                );
              })}

              {/* Marketing — expandable */}
              <>
                <SidebarMenuItem>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild isActive={isOnMarketing} className={itemClass(isOnMarketing)}>
                          <Link to="/admin/marketing" className="flex items-center justify-center">
                            <Mail className="h-4 w-4 flex-shrink-0" />
                          </Link>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="ml-1">Marketing</TooltipContent>
                    </Tooltip>
                  ) : (
                    <SidebarMenuButton
                      isActive={isOnMarketing}
                      onClick={() => setMarketingOpen(prev => !prev)}
                      className={`${itemClass(isOnMarketing)} cursor-pointer w-full`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 text-left">Marketing</span>
                        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${marketingOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>

                {!isCollapsed && marketingOpen && (
                  <div className="ml-3 pl-3 border-l border-sidebar-border/50 space-y-0.5 mt-0.5 mb-1">
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
                              <span className="text-xs">{section.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </div>
                )}
              </>

              {/* Settings — expandable */}
              {showSettings && (
                <>
                  <SidebarMenuItem>
                    {isCollapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild isActive={isOnSettings} className={itemClass(isOnSettings)}>
                            <Link to="/admin/settings" className="flex items-center justify-center">
                              <Settings className="h-4 w-4 flex-shrink-0" />
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="ml-1">Settings</TooltipContent>
                      </Tooltip>
                    ) : (
                      <SidebarMenuButton
                        isActive={isOnSettings}
                        onClick={() => setSettingsOpen(prev => !prev)}
                        className={`${itemClass(isOnSettings)} cursor-pointer w-full`}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <Settings className="h-4 w-4 flex-shrink-0" />
                          <span className="text-sm font-medium flex-1 text-left">Settings</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>

                  {/* Sub-items */}
                  {!isCollapsed && settingsOpen && (
                    <div className="ml-3 pl-3 border-l border-sidebar-border/50 space-y-0.5 mt-0.5 mb-1">
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
                                <span className="text-xs">{section.label}</span>
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
              <p className="text-xs text-sidebar-foreground truncate opacity-70">{user?.email}</p>
            </div>
          )}
          {!isCollapsed ? (
            <button
              onClick={signOut}
              className="ml-auto p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={signOut} className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="ml-1">Sign out</TooltipContent>
            </Tooltip>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
