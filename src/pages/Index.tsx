
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PublicHome } from './PublicHome';

const Index: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is authenticated, redirect to admin dashboard
  if (user) {
    return <Navigate to="/admin" replace />;
  }

  // Show public website for non-authenticated users
  return <PublicHome />;
};

export default Index;
