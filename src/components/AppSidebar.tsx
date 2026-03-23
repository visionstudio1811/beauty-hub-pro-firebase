
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Calendar, Users, LayoutDashboard, Mail, Settings, LogOut, ChevronRight } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const { validateUserRole } = useSecurityValidation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(true);

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

  const getMenuItems = () => {
    const items = [
      { icon: LayoutDashboard, label: 'Dashboard',    path: '/admin' },
      { icon: Users,           label: 'Clients',       path: '/admin/clients' },
      { icon: Calendar,        label: 'Appointments',  path: '/admin/appointments' },
      { icon: Mail,            label: 'Marketing',     path: '/admin/marketing' },
    ];
    if (showSettings) {
      items.push({ icon: Settings, label: 'Settings', path: '/admin/settings' });
    }
    return items;
  };

  const menuItems = getMenuItems();
  const isCollapsed = state === 'collapsed';
  const orgName = currentOrganization?.name || 'Beauty Hub';
  const userInitial = (user?.user_metadata?.full_name || user?.email || 'U').charAt(0).toUpperCase();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

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
            <img
              src={logoUrl}
              alt="Logo"
              className={`object-contain flex-shrink-0 rounded-md ${isCollapsed ? 'h-8 w-8' : 'h-8 w-8'}`}
            />
          ) : (
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-bold text-sm">
                {orgName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate leading-tight">
                {orgName}
              </p>
              <p className="text-xs text-sidebar-foreground truncate">Workspace</p>
            </div>
          )}
          {!isCollapsed && (
            <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground flex-shrink-0 opacity-60" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {menuItems.map(item => {
                const isActive = location.pathname === item.path ||
                  (item.path !== '/admin' && location.pathname.startsWith(item.path));
                const button = (
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className={`
                      group h-9 rounded-md transition-colors duration-150
                      ${isActive
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }
                      ${isCollapsed ? 'w-10 mx-auto justify-center px-0' : 'px-3'}
                    `}
                  >
                    <Link to={item.path} className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!isCollapsed && (
                        <span className="text-sm font-medium">{item.label}</span>
                      )}
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
              <p className="text-xs font-semibold text-sidebar-accent-foreground truncate leading-tight">
                {userName}
              </p>
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
                <button
                  onClick={signOut}
                  className="sr-only"
                >
                  Sign out
                </button>
              </TooltipTrigger>
            </Tooltip>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
