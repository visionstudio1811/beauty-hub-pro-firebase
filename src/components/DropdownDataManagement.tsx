
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, X, MapPin, Users, Loader2 } from 'lucide-react';
import { useSupabaseDropdownData } from '@/hooks/useSupabaseDropdownData';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export const DropdownDataManagement: React.FC = () => {
  const { dropdownData, loading, addCity, removeCity, addReferralSource, removeReferralSource } = useSupabaseDropdownData();
  const { toast } = useToast();
  const { t } = useTranslation('scheduling');
  const [newCity, setNewCity] = useState('');
  const [newReferralSource, setNewReferralSource] = useState('');

  const handleAddCity = async () => {
    const trimmed = newCity.trim();
    if (!trimmed || dropdownData.cities.includes(trimmed)) return;
    try {
      await addCity(trimmed);
      setNewCity('');
      toast({ title: t('dropdownData.cities.addedTitle'), description: t('dropdownData.cities.addedDescription', { name: trimmed }) });
    } catch {
      toast({ title: t('dropdownData.errorTitle'), description: t('dropdownData.cities.addError'), variant: "destructive" });
    }
  };

  const handleAddReferralSource = async () => {
    const trimmed = newReferralSource.trim();
    if (!trimmed || dropdownData.referralSources.includes(trimmed)) return;
    try {
      await addReferralSource(trimmed);
      setNewReferralSource('');
      toast({ title: t('dropdownData.referralSources.addedTitle'), description: t('dropdownData.referralSources.addedDescription', { name: trimmed }) });
    } catch {
      toast({ title: t('dropdownData.errorTitle'), description: t('dropdownData.referralSources.addError'), variant: "destructive" });
    }
  };

  const handleRemoveCity = async (city: string) => {
    try {
      await removeCity(city);
      toast({ title: t('dropdownData.cities.removedTitle'), description: t('dropdownData.cities.removedDescription', { name: city }) });
    } catch {
      toast({ title: t('dropdownData.errorTitle'), description: t('dropdownData.cities.removeError'), variant: "destructive" });
    }
  };

  const handleRemoveReferralSource = async (source: string) => {
    try {
      await removeReferralSource(source);
      toast({ title: t('dropdownData.referralSources.removedTitle'), description: t('dropdownData.referralSources.removedDescription', { name: source }) });
    } catch {
      toast({ title: t('dropdownData.errorTitle'), description: t('dropdownData.referralSources.removeError'), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 w-full overflow-hidden">
      {/* Cities Management */}
      <Card className="w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <span className="truncate">{t('dropdownData.cities.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-hidden">
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 rtl:space-x-reverse">
            <Input
              placeholder={t('dropdownData.cities.placeholder')}
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCity()}
              className="min-w-0 flex-1"
            />
            <Button onClick={handleAddCity} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 me-2 sm:me-0" />
              <span className="sm:hidden">{t('dropdownData.cities.add')}</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dropdownData.cities.map((city) => (
              <Badge key={city} variant="outline" className="flex items-center gap-1 max-w-full">
                <span className="truncate">{city}</span>
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-red-500 flex-shrink-0" 
                  onClick={() => handleRemoveCity(city)}
                />
              </Badge>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            {t('dropdownData.cities.configured', { count: dropdownData.cities.length })}
          </p>
        </CardContent>
      </Card>

      {/* Referral Sources Management */}
      <Card className="w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <span className="truncate">{t('dropdownData.referralSources.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-hidden">
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 rtl:space-x-reverse">
            <Input
              placeholder={t('dropdownData.referralSources.placeholder')}
              value={newReferralSource}
              onChange={(e) => setNewReferralSource(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddReferralSource()}
              className="min-w-0 flex-1"
            />
            <Button onClick={handleAddReferralSource} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 me-2 sm:me-0" />
              <span className="sm:hidden">{t('dropdownData.referralSources.add')}</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dropdownData.referralSources.map((source) => (
              <Badge key={source} variant="outline" className="flex items-center gap-1 max-w-full">
                <span className="truncate">{source}</span>
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-red-500 flex-shrink-0" 
                  onClick={() => handleRemoveReferralSource(source)}
                />
              </Badge>
            ))}
          </div>
          <p className="text-sm text-gray-500">
            {t('dropdownData.referralSources.configured', { count: dropdownData.referralSources.length })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
