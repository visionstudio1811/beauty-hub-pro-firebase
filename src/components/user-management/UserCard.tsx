
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleLeft, ToggleRight } from 'lucide-react';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface UserCardProps {
  profile: Profile;
  onToggleActive: (profileId: string, currentStatus: boolean) => void;
}

export const UserCard: React.FC<UserCardProps> = ({
  profile,
  onToggleActive
}) => {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <h4 className="font-medium">{profile.full_name || 'No name'}</h4>
          <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>
            {profile.role}
          </Badge>
          <Badge variant={profile.is_active ? 'default' : 'secondary'} className={profile.is_active ? 'bg-green-500' : 'bg-gray-500'}>
            {profile.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        {profile.phone && (
          <p className="text-sm text-muted-foreground">{profile.phone}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Created: {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(profile.id, profile.is_active)}
        >
          {profile.is_active ? (
            <ToggleRight className="h-4 w-4 text-green-600" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-gray-400" />
          )}
        </Button>
      </div>
    </div>
  );
};
