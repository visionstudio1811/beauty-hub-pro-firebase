
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';
import { useSupabaseBusinessHours, DayHours } from '@/hooks/useSupabaseBusinessHours';

export const BusinessHours: React.FC = () => {
  const { businessHours, loading, updateBusinessHours } = useSupabaseBusinessHours();

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return [`${hour}:00`, `${hour}:30`];
  }).flat();

  const updateDay = (dayIndex: number, field: keyof DayHours, value: boolean | string) => {
    const newHours = [...businessHours];
    newHours[dayIndex] = { ...newHours[dayIndex], [field]: value };
    updateBusinessHours(newHours);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">Loading business hours...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 text-purple-600" />
          <CardTitle>Business Hours</CardTitle>
        </div>
        <CardDescription>
          Set your operating hours - these will control available time slots across all booking systems
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-hidden">
        <div className="space-y-3 sm:space-y-4">
          {businessHours.map((dayHour, index) => (
            <div key={dayHour.day} className="flex flex-col space-y-3 p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Switch
                    checked={dayHour.enabled}
                    onCheckedChange={(checked) => updateDay(index, 'enabled', checked)}
                  />
                  <Label className="font-medium text-sm sm:text-base">{dayHour.day}</Label>
                </div>
                
                {!dayHour.enabled && (
                  <span className="text-muted-foreground text-sm">Closed</span>
                )}
              </div>
              
              {dayHour.enabled && (
                <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2 sm:justify-end">
                  <Select
                    value={dayHour.openTime}
                    onValueChange={(value) => updateDay(index, 'openTime', value)}
                  >
                    <SelectTrigger className="w-full sm:w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <span className="text-muted-foreground text-center text-sm">to</span>
                  
                  <Select
                    value={dayHour.closeTime}
                    onValueChange={(value) => updateDay(index, 'closeTime', value)}
                  >
                    <SelectTrigger className="w-full sm:w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
