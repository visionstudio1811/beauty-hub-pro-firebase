
import React, { useEffect } from 'react';
import { applyFavicon } from '@/components/LogoManagement';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from '@/components/ui/toaster';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Appointments from './pages/Appointments';
import Clients from './pages/Clients';
import DeletedClients from './pages/DeletedClients';
import Marketing from './pages/Marketing';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import Auth from './pages/Auth';
import Index from './pages/Index';
import WaiverForm from './pages/WaiverForm';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { ClientsProvider } from '@/contexts/ClientsContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { RoleProtectedRoute } from '@/components/RoleProtectedRoute';
import { OrganizationProtectedRoute } from '@/components/OrganizationProtectedRoute';
import { BusinessHoursProvider } from '@/contexts/BusinessHoursContext';
import { DropdownDataProvider } from '@/contexts/DropdownDataContext';
import { PackageProvider } from '@/contexts/PackageContext';
import { SchedulingConfigProvider } from '@/contexts/SchedulingConfigContext';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  useEffect(() => {
    const savedLogo = localStorage.getItem('lumiere-logo');
    if (savedLogo) applyFavicon(savedLogo);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <OrganizationProvider>
            <ClientsProvider>
            <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
              <DropdownDataProvider>
              <BusinessHoursProvider>
                    <PackageProvider>
                      <SchedulingConfigProvider>
                          <Routes>
                            {/* Public routes */}
                            <Route path="/" element={<Index />} />
                            <Route path="/auth" element={<Auth />} />
                            <Route path="/waiver/:token" element={<WaiverForm />} />
                            
                            {/* Admin routes */}
                            <Route path="/admin" element={
                              <ProtectedRoute>
                                <OrganizationProtectedRoute>
                                  <Layout />
                                </OrganizationProtectedRoute>
                              </ProtectedRoute>
                            }>
                              <Route index element={<Dashboard />} />
                              <Route path="appointments" element={<Appointments />} />
                              <Route path="clients" element={<Clients />} />
                              <Route path="clients/trash" element={<DeletedClients />} />
                              <Route path="marketing" element={<Marketing />} />
                              <Route path="settings" element={
                                <RoleProtectedRoute allowedRoles={['admin', 'staff']}>
                                  <Settings />
                                </RoleProtectedRoute>
                              } />
                            </Route>
                            
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                          <Toaster />
                      </SchedulingConfigProvider>
                    </PackageProvider>
              </BusinessHoursProvider>
              </DropdownDataProvider>
            </ThemeProvider>
            </ClientsProvider>
          </OrganizationProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
