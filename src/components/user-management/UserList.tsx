
import React from 'react';
import { UserCard } from './UserCard';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface UserListProps {
  profiles: Profile[];
  onToggleActive: (profileId: string, currentStatus: boolean) => void;
}

export const UserList: React.FC<UserListProps> = ({
  profiles,
  onToggleActive
}) => {
  if (profiles.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No users found. Create your first user to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {profiles.map((profile) => (
        <UserCard
          key={profile.id}
          profile={profile}
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  );
};
