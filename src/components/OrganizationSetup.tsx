import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { LogOut } from 'lucide-react';

interface OrganizationSetupProps {
  onComplete: () => void;
}

export const OrganizationSetup: React.FC<OrganizationSetupProps> = ({ onComplete }) => {
  const { t } = useTranslation('shell');
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    email: '',
    phone: '',
    address: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const { createOrganization } = useOrganization();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Auto-generate slug from name
      ...(name === 'name' && {
        slug: value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      })
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await createOrganization({
        ...formData,
        // Default the new org to the browser's IANA timezone; falls back to a
        // sensible default. Admins can change it later in business settings.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        is_active: true
      });

      toast({
        title: t('orgSetup.welcomeToast.title'),
        description: t('orgSetup.welcomeToast.description')
      });

      onComplete();
    } catch (error) {
      console.error('Failed to create organization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="absolute top-4 end-4">
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4 me-2 rtl:rotate-180" />
          {t('common:actions.signOut')}
        </Button>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('orgSetup.title')}</CardTitle>
          <CardDescription>
            {t('orgSetup.description')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('orgSetup.fields.name')}</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder={t('orgSetup.fields.namePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">{t('orgSetup.fields.slug')}</Label>
              <Input
                id="slug"
                name="slug"
                value={formData.slug}
                onChange={handleInputChange}
                placeholder={t('orgSetup.fields.slugPlaceholder')}
                dir="ltr"
                required
              />
              <p className="text-sm text-muted-foreground">
                {t('orgSetup.fields.slugHelp')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('common:labels.email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder={t('orgSetup.fields.emailPlaceholder')}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('common:labels.phone')}</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder={t('orgSetup.fields.phonePlaceholder')}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{t('common:labels.address')}</Label>
              <Textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder={t('orgSetup.fields.addressPlaceholder')}
                rows={3}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !formData.name || !formData.slug}
            >
              {isLoading ? t('orgSetup.creating') : t('orgSetup.create')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
