
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, X, MapPin, Users, Loader2 } from 'lucide-react';
import { useSupabaseDropdownData } from '@/hooks/useSupabaseDropdownData';
import { useToast } from '@/hooks/use-toast';

export const DropdownDataManagement: React.FC = () => {
  const { dropdownData, loading, addCity, removeCity, addReferralSource, removeReferralSource } = useSupabaseDropdownData();
  const { toast } = useToast();
  const [newCity, setNewCity] = useState('');
  const [newReferralSource, setNewReferralSource] = useState('');

  const handleAddCity = async () => {
    const trimmed = newCity.trim();
    if (!trimmed || dropdownData.cities.includes(trimmed)) return;
    try {
      await addCity(trimmed);
      setNewCity('');
      toast({ title: "City Added", description: `${trimmed} has been added to the city list.` });
    } catch {
      toast({ title: "Error", description: "Failed to add city.", variant: "destructive" });
    }
  };

  const handleAddReferralSource = async () => {
    const trimmed = newReferralSource.trim();
    if (!trimmed || dropdownData.referralSources.includes(trimmed)) return;
    try {
      await addReferralSource(trimmed);
      setNewReferralSource('');
      toast({ title: "Referral Source Added", description: `${trimmed} has been added to the referral sources.` });
    } catch {
      toast({ title: "Error", description: "Failed to add referral source.", variant: "destructive" });
    }
  };

  const handleRemoveCity = async (city: string) => {
    try {
      await removeCity(city);
      toast({ title: "City Removed", description: `${city} has been removed from the city list.` });
    } catch {
      toast({ title: "Error", description: "Failed to remove city.", variant: "destructive" });
    }
  };

  const handleRemoveReferralSource = async (source: string) => {
    try {
      await removeReferralSource(source);
      toast({ title: "Referral Source Removed", description: `${source} has been removed from the referral sources.` });
    } catch {
      toast({ title: "Error", description: "Failed to remove referral source.", variant: "destructive" });
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
            <span className="truncate">City Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-hidden">
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <Input
              placeholder="Enter new city..."
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCity()}
              className="min-w-0 flex-1"
            />
            <Button onClick={handleAddCity} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2 sm:mr-0" />
              <span className="sm:hidden">Add City</span>
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
            {dropdownData.cities.length} cities configured
          </p>
        </CardContent>
      </Card>

      {/* Referral Sources Management */}
      <Card className="w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <span className="truncate">Referral Sources</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-hidden">
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <Input
              placeholder="Enter new referral source..."
              value={newReferralSource}
              onChange={(e) => setNewReferralSource(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddReferralSource()}
              className="min-w-0 flex-1"
            />
            <Button onClick={handleAddReferralSource} size="sm" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2 sm:mr-0" />
              <span className="sm:hidden">Add Source</span>
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
            {dropdownData.referralSources.length} referral sources configured
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
