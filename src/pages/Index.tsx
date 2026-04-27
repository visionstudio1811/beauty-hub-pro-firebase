
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PublicHome } from './PublicHome';

// App-only hosts skip the Beauty Hub Pro marketing page and go straight to /auth.
// Every white-label client gets a `crm.<their-brand>` domain — that prefix identifies them.
const isAppOnlyHost = (hostname: string): boolean =>
  hostname === 'app.beautyhubpro.com' || hostname.startsWith('crm.');

const Index: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/admin" replace />;
  }

  if (typeof window !== 'undefined' && isAppOnlyHost(window.location.hostname)) {
    return <Navigate to="/auth" replace />;
  }

  return <PublicHome />;
};

export default Index;
