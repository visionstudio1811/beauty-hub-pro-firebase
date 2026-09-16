
import React, { useState, useEffect } from 'react';
import { useSchedulingConfig } from '@/contexts/SchedulingConfigContext';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Clock, CalendarClock, Trash2, Plus, Settings2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SchedulingConfig } from '@/hooks/useSupabaseSchedulingConfig';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTranslation } from 'react-i18next';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

// Helper function to format time strings (remove seconds)
const formatTimeDisplay = (time: string): string => {
  if (!time) return '';
  // If time includes seconds (HH:MM:SS), return only HH:MM
  if (time.split(':').length > 2) {
    return time.split(':').slice(0, 2).join(':');
  }
  return time;
};

export const SchedulingConfiguration = () => {
  const { schedulingConfigs, loading, addSchedulingConfig, updateSchedulingConfig, deleteSchedulingConfig } = useSchedulingConfig();
  const { treatments } = useSupabaseTreatments();
  const { getStaffProfiles } = useSupabaseProfiles();
  const { isAdmin, roleFlagsLoading } = useSecurityValidation();
  const staffProfiles = getStaffProfiles();
  const { toast } = useToast();
  const { t } = useTranslation('scheduling');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    day_of_week: 0,
    start_time: "09:00",
    end_time: "17:00",
    max_concurrent_appointments: 1,
    time_interval_minutes: 60,
    treatment_categories: [] as string[],
    staff_ids: [] as string[],
    is_active: true
  });

  useEffect(() => {
    if (roleFlagsLoading) {
      setHasAdminAccess(null);
    } else {
      setHasAdminAccess(isAdmin);
    }
  }, [isAdmin, roleFlagsLoading]);

  // Get unique treatment categories
  const treatmentCategories = Array.from(new Set(treatments.map(t => t.category).filter(Boolean) as string[]));

  const dayNames = DAY_KEYS.map((key) => t(`common:days.${key}`));

  const resetFormData = () => {
    setFormData({
      day_of_week: 0,
      start_time: "09:00",
      end_time: "17:00",
      max_concurrent_appointments: 1,
      time_interval_minutes: 60,
      treatment_categories: [],
      staff_ids: [],
      is_active: true
    });
    setEditingConfigId(null);
  };

  const handleDialogOpen = (config?: SchedulingConfig) => {
    if (config) {
      setFormData({
        day_of_week: config.day_of_week,
        start_time: formatTimeDisplay(config.start_time),
        end_time: formatTimeDisplay(config.end_time),
        max_concurrent_appointments: config.max_concurrent_appointments,
        time_interval_minutes: config.time_interval_minutes,
        treatment_categories: config.treatment_categories || [],
        staff_ids: config.staff_ids || [],
        is_active: config.is_active
      });
      setEditingConfigId(config.id);
    } else {
      resetFormData();
    }
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    resetFormData();
  };

  const handleSave = async () => {
    try {
      if (!hasAdminAccess) {
        toast({
          title: t('schedulingConfiguration.permissionDenied'),
          description: t('schedulingConfiguration.permissionModify'),
          variant: "destructive"
        });
        return;
      }
      
      if (editingConfigId) {
        await updateSchedulingConfig(editingConfigId, formData);
      } else {
        await addSchedulingConfig(formData);
      }
      handleDialogClose();
    } catch (error) {
      console.error('Failed to save configuration:', error);
      toast({
        title: t('schedulingConfiguration.errorTitle'),
        description: t('schedulingConfiguration.saveError'),
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasAdminAccess) {
      toast({
        title: t('schedulingConfiguration.permissionDenied'),
        description: t('schedulingConfiguration.permissionDelete'),
        variant: "destructive"
      });
      return;
    }
    
    if (confirm(t('schedulingConfiguration.confirmDelete'))) {
      try {
        await deleteSchedulingConfig(id);
      } catch (error) {
        console.error('Failed to delete configuration:', error);
        toast({
          title: t('schedulingConfiguration.errorTitle'),
          description: t('schedulingConfiguration.deleteError'),
          variant: "destructive"
        });
      }
    }
  };

  const toggleStaffId = (id: string) => {
    setFormData(prev => {
      const currentIds = prev.staff_ids || [];
      if (currentIds.includes(id)) {
        return { ...prev, staff_ids: currentIds.filter(staffId => staffId !== id) };
      } else {
        return { ...prev, staff_ids: [...currentIds, id] };
      }
    });
  };

  const toggleCategory = (category: string) => {
    setFormData(prev => {
      const currentCategories = prev.treatment_categories || [];
      if (currentCategories.includes(category)) {
        return { ...prev, treatment_categories: currentCategories.filter(c => c !== category) };
      } else {
        return { ...prev, treatment_categories: [...currentCategories, category] };
      }
    });
  };

  return (
    <Card className="shadow-sm border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-2 rtl:space-x-reverse min-w-0">
            <CalendarClock className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-lg font-semibold truncate">{t('schedulingConfiguration.title')}</CardTitle>
            <Badge variant="outline" className="ms-1 text-xs">{t('schedulingConfiguration.legacy')}</Badge>
          </div>
          {hasAdminAccess && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full sm:w-auto"
              onClick={() => handleDialogOpen()}
            >
              <Plus className="h-4 w-4 me-1" /> {t('schedulingConfiguration.addConfig')}
            </Button>
          )}
        </div>
        <CardDescription>
          {t('schedulingConfiguration.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Alert variant="default" className="mb-4 border-blue-200 bg-blue-50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>{t('schedulingConfiguration.layeringTitle')}</strong> {t('schedulingConfiguration.layeringBody')}{' '}
            <strong>{t('schedulingConfiguration.layeringStaff')}</strong>{' '}
            {t('schedulingConfiguration.layeringTail')}
          </AlertDescription>
        </Alert>
        {hasAdminAccess === false && (
          <Alert variant="default" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('schedulingConfiguration.adminRequired')}
            </AlertDescription>
          </Alert>
        )}
        
        {loading ? (
          <div className="flex justify-center p-4">
            <p>{t('schedulingConfiguration.loading')}</p>
          </div>
        ) : schedulingConfigs.length === 0 ? (
          <div className="text-center p-4 border border-dashed rounded-md">
            <p className="text-sm text-gray-500">{t('schedulingConfiguration.empty')}</p>
            {hasAdminAccess && (
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 w-full sm:w-auto" 
                onClick={() => handleDialogOpen()}
              >
                <Plus className="h-4 w-4 me-1" /> {t('schedulingConfiguration.addFirst')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {dayNames.map((day, dayIndex) => {
              const dayConfigs = schedulingConfigs.filter(
                config => config.day_of_week === dayIndex
              );
              
              if (dayConfigs.length === 0) return null;
              
              return (
                <div key={dayIndex} className="border rounded-md p-3">
                  <h3 className="font-medium text-sm mb-2">{day}</h3>
                  <div className="space-y-2">
                    {dayConfigs.map(config => (
                      <div 
                        key={config.id} 
                        className={`flex flex-col sm:flex-row sm:justify-between sm:items-center p-2 rounded-md border gap-3 min-w-0 ${
                          config.is_active 
                            ? 'bg-gray-50 dark:bg-gray-800' 
                            : 'bg-gray-100 dark:bg-gray-900 opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 rtl:space-x-reverse mb-2 sm:mb-1">
                            <Clock className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                            <span className="text-sm font-medium" dir="ltr">
                              {formatTimeDisplay(config.start_time)} - {formatTimeDisplay(config.end_time)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-xs">
                              {t('schedulingConfiguration.concurrent', { count: config.max_concurrent_appointments })}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {t('schedulingConfiguration.intervals', { count: config.time_interval_minutes })}
                            </Badge>
                            {!config.is_active && (
                              <Badge variant="secondary" className="text-xs">
                                {t('schedulingConfiguration.inactive')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-row sm:flex-row gap-1 w-full sm:w-auto">
                          {hasAdminAccess ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-7 w-7 flex-1 sm:flex-initial"
                                onClick={() => handleDialogOpen(config)}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 flex-1 sm:flex-initial"
                                onClick={() => handleDelete(config.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-7 w-7 w-full sm:w-auto"
                              onClick={() => handleDialogOpen(config)}
                              disabled={!hasAdminAccess}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingConfigId ? t('schedulingConfiguration.dialog.editTitle') : t('schedulingConfiguration.dialog.addTitle')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="day_of_week">{t('schedulingConfiguration.dialog.dayOfWeek')}</Label>
                <Select 
                  value={formData.day_of_week.toString()} 
                  onValueChange={(value) => setFormData({...formData, day_of_week: parseInt(value)})}
                  disabled={!hasAdminAccess}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('schedulingConfiguration.dialog.selectDay')} />
                  </SelectTrigger>
                  <SelectContent>
                    {dayNames.map((day, index) => (
                      <SelectItem key={index} value={index.toString()}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="time_interval_minutes">{t('schedulingConfiguration.dialog.timeInterval')}</Label>
                <Select 
                  value={formData.time_interval_minutes.toString()} 
                  onValueChange={(value) => setFormData({...formData, time_interval_minutes: parseInt(value)})}
                  disabled={!hasAdminAccess}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('schedulingConfiguration.dialog.selectInterval')} />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90, 120].map((interval) => (
                      <SelectItem key={interval} value={interval.toString()}>
                        {t('schedulingConfiguration.dialog.intervalMinutes', { count: interval })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_time">{t('schedulingConfiguration.dialog.startTime')}</Label>
                <Input 
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                  disabled={!hasAdminAccess}
                />
              </div>
              
              <div>
                <Label htmlFor="end_time">{t('schedulingConfiguration.dialog.endTime')}</Label>
                <Input 
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                  disabled={!hasAdminAccess}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="max_concurrent_appointments">{t('schedulingConfiguration.dialog.maxConcurrent')}</Label>
              <Select 
                value={formData.max_concurrent_appointments.toString()} 
                onValueChange={(value) => setFormData({...formData, max_concurrent_appointments: parseInt(value)})}
                disabled={!hasAdminAccess}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {t('schedulingConfiguration.dialog.appointments', { count: num })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">{t('schedulingConfiguration.dialog.treatmentCategories')}</Label>
              <ScrollArea className="h-24 border rounded-md p-2">
                <div className="space-y-2">
                  {treatmentCategories.map(category => (
                    <div key={category} className="flex items-center space-x-2 rtl:space-x-reverse">
                      <Checkbox 
                        id={`category-${category}`}
                        checked={formData.treatment_categories.includes(category)}
                        onCheckedChange={() => toggleCategory(category)}
                        disabled={!hasAdminAccess}
                      />
                      <Label htmlFor={`category-${category}`} className="text-sm">
                        {category}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div>
              <Label className="mb-2 block">{t('schedulingConfiguration.dialog.assignStaff')}</Label>
              <ScrollArea className="h-24 border rounded-md p-2">
                <div className="space-y-2">
                  {staffProfiles.map(staff => (
                    <div key={staff.id} className="flex items-center space-x-2 rtl:space-x-reverse">
                      <Checkbox 
                        id={`staff-${staff.id}`}
                        checked={formData.staff_ids.includes(staff.id)}
                        onCheckedChange={() => toggleStaffId(staff.id)}
                        disabled={!hasAdminAccess}
                      />
                      <Label htmlFor={`staff-${staff.id}`} className="text-sm truncate">
                        {staff.full_name || staff.email}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse pt-2">
              <Checkbox 
                id="is_active" 
                checked={formData.is_active}
                onCheckedChange={(checked) => 
                  setFormData({...formData, is_active: checked as boolean})
                }
                disabled={!hasAdminAccess}
              />
              <Label htmlFor="is_active">{t('schedulingConfiguration.dialog.active')}</Label>
            </div>
          </div>

          <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleDialogClose} className="w-full sm:w-auto">{t('common:actions.cancel')}</Button>
            <Button 
              onClick={handleSave}
              disabled={!hasAdminAccess}
              className="w-full sm:w-auto"
            >
              {t('schedulingConfiguration.dialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
