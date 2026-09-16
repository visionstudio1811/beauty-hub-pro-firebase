
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';
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
  const { t } = useTranslation('settings');
  const { locale } = useLanguage();
  const roleLabel = ['admin', 'staff', 'reception', 'beautician'].includes(profile.role)
    ? t(`common:roles.${profile.role}`)
    : profile.role;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-1">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <h4 className="font-medium">{profile.full_name || t('userCard.noName')}</h4>
          <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>
            {roleLabel}
          </Badge>
          <Badge variant={profile.is_active ? 'default' : 'secondary'} className={profile.is_active ? 'bg-green-500' : 'bg-gray-500'}>
            {profile.is_active ? t('common:labels.active') : t('common:labels.inactive')}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground"><span className="ltr-inline" dir="ltr">{profile.email}</span></p>
        {profile.phone && (
          <p className="text-sm text-muted-foreground"><span className="ltr-inline" dir="ltr">{profile.phone}</span></p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('userCard.created', { date: new Date(profile.created_at).toLocaleDateString(locale) })}
        </p>
      </div>
      <div className="flex items-center space-x-2 rtl:space-x-reverse">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(profile.id, profile.is_active)}
          aria-label={profile.is_active ? t('userCard.deactivate') : t('userCard.activate')}
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
