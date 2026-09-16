
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Edit, Trash, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAddons, Addon } from '@/hooks/useSupabaseAddons';

const PRESET_COLORS = [
  '#FFD700',
  '#10B981',
  '#F472B6',
  '#60A5FA',
  '#C084FC',
  '#FB923C',
  '#14B8A6',
  '#F43F5E',
];

export const AddonManagement: React.FC = () => {
  const { t } = useTranslation('products');
  const { addons, loading, addAddon, updateAddon } = useSupabaseAddons();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    duration_minutes: '',
    description: '',
    category: '',
    color: '',
    sort_order: '',
  });
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({ name: '', price: '', duration_minutes: '', description: '', category: '', color: '', sort_order: '' });
    setEditingAddon(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (addon: Addon) => {
    setEditingAddon(addon);
    setFormData({
      name: addon.name,
      price: addon.price?.toString() ?? '',
      duration_minutes:
        addon.duration_minutes === null || addon.duration_minutes === undefined
          ? ''
          : String(addon.duration_minutes),
      description: addon.description || '',
      category: addon.category || '',
      color: addon.color || '',
      sort_order: typeof addon.sort_order === 'number' ? String(addon.sort_order) : '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      toast({
        title: t('common:status.error'),
        description: t('addonManagement.toasts.nameAndPriceRequired'),
        variant: 'destructive',
      });
      return;
    }

    const priceNum = parseFloat(formData.price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast({ title: t('common:status.error'), description: t('addonManagement.toasts.pricePositive'), variant: 'destructive' });
      return;
    }

    const durationRaw = formData.duration_minutes.trim();
    const durationNum =
      durationRaw === '' ? null : Number.isNaN(parseInt(durationRaw, 10)) ? null : parseInt(durationRaw, 10);
    if (durationNum !== null && durationNum < 0) {
      toast({ title: t('common:status.error'), description: t('addonManagement.toasts.durationNegative'), variant: 'destructive' });
      return;
    }

    try {
      const addonData = {
        name: formData.name,
        price: priceNum,
        duration_minutes: durationNum,
        description: formData.description || undefined,
        category: formData.category || undefined,
        color: formData.color || undefined,
        sort_order: formData.sort_order ? parseInt(formData.sort_order, 10) || 0 : 0,
        is_active: true,
      };

      if (editingAddon) {
        await updateAddon(editingAddon.id, addonData);
      } else {
        await addAddon(addonData);
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving addon:', error);
    }
  };

  const handleDelete = async (addonId: string) => {
    try {
      await updateAddon(addonId, { is_active: false });
    } catch (error) {
      console.error('Error deleting addon:', error);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">{t('addonManagement.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 rtl:space-x-reverse min-w-0 flex-1">
            <Sparkles className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-lg truncate">{t('addonManagement.title')}</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog} className="w-full sm:w-auto shrink-0">
                <Plus className="h-4 w-4 me-2" />
                {t('addonManagement.addAddon')}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingAddon ? t('addonManagement.editAddon') : t('addonManagement.addNewAddon')}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingAddon
                    ? t('addonManagement.updateDescription')
                    : t('addonManagement.createDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="addon-name" className="text-sm">{t('addonManagement.fields.name')}</Label>
                  <Input
                    id="addon-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('addonManagement.fields.namePlaceholder')}
                    className="w-full text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="addon-price" className="text-sm">{t('addonManagement.fields.price')}</Label>
                    <Input
                      id="addon-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder={t('addonManagement.fields.pricePlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="addon-duration" className="text-sm">{t('addonManagement.fields.duration')}</Label>
                    <Input
                      id="addon-duration"
                      type="number"
                      min="0"
                      value={formData.duration_minutes}
                      onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                      placeholder={t('addonManagement.fields.durationPlaceholder')}
                      className="w-full text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('addonManagement.fields.durationHelp')}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="addon-category" className="text-sm">{t('addonManagement.fields.category')}</Label>
                    <Input
                      id="addon-category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder={t('addonManagement.fields.categoryPlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="addon-sort-order" className="text-sm">{t('addonManagement.fields.sortOrder')}</Label>
                    <Input
                      id="addon-sort-order"
                      type="number"
                      min="0"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                      placeholder={t('addonManagement.fields.sortOrderPlaceholder')}
                      className="w-full text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addon-color" className="text-sm">{t('addonManagement.fields.color')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        id="addon-color"
                        className="flex items-center gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-start"
                      >
                        <span
                          className="h-6 w-6 rounded border border-border shrink-0"
                          style={{
                            backgroundColor: formData.color || '#e5e7eb',
                            backgroundImage: formData.color
                              ? undefined
                              : 'linear-gradient(45deg, transparent 47%, #9ca3af 47%, #9ca3af 53%, transparent 53%)',
                          }}
                        />
                        <span className="text-muted-foreground">
                          {formData.color ? <span className="ltr-inline">{formData.color.toUpperCase()}</span> : t('addonManagement.fields.noColor')}
                        </span>
                        {formData.color && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData({ ...formData, color: '' });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setFormData({ ...formData, color: '' });
                              }
                            }}
                            className="ms-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            {t('addonManagement.fields.clearColor')}
                          </span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={t('addonManagement.fields.pickColorAria', { color: c })}
                            onClick={() => setFormData({ ...formData, color: c })}
                            className={`h-9 w-full rounded-md border-2 transition-transform hover:scale-105 ${
                              formData.color?.toLowerCase() === c.toLowerCase()
                                ? 'border-foreground ring-2 ring-ring ring-offset-1'
                                : 'border-border'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="custom-addon-color" className="text-xs whitespace-nowrap">{t('addonManagement.fields.custom')}</Label>
                        <Input
                          id="custom-addon-color"
                          type="color"
                          value={formData.color || '#10B981'}
                          onChange={(e) => setFormData({ ...formData, color: e.target.value.toUpperCase() })}
                          className="h-8 w-12 cursor-pointer p-1"
                        />
                        <Input
                          type="text"
                          dir="ltr"
                          value={formData.color}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                              setFormData({ ...formData, color: v.toUpperCase() });
                            }
                          }}
                          placeholder={t('addonManagement.fields.colorPlaceholder')}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="addon-description" className="text-sm">{t('addonManagement.fields.description')}</Label>
                  <Textarea
                    id="addon-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('addonManagement.fields.descriptionPlaceholder')}
                    rows={3}
                    className="w-full resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto text-sm">
                  {t('common:actions.cancel')}
                </Button>
                <Button onClick={handleSave} className="w-full sm:w-auto text-sm">
                  {editingAddon ? t('addonManagement.updateAddon') : t('addonManagement.addAddon')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription className="text-sm">
          {t('addonManagement.cardDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {addons.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('addonManagement.empty')}
            </p>
          )}
          {addons.map((addon) => (
            <div key={addon.id} className="p-3 border rounded-lg space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {addon.color && (
                    <span
                      className="h-3 w-3 rounded-full border border-border shrink-0"
                      style={{ backgroundColor: addon.color }}
                      aria-label={t('addonManagement.badges.colorAria', { color: addon.color })}
                      title={addon.color}
                    />
                  )}
                  <h4 className="font-medium text-sm break-words">{addon.name}</h4>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-xs"><span dir="ltr">${addon.price}</span></Badge>
                  {addon.duration_minutes && addon.duration_minutes > 0 ? (
                    <Badge variant="outline" className="text-xs">{t('addonManagement.badges.extraMinutes', { count: addon.duration_minutes })}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">{t('addonManagement.badges.noExtraTime')}</Badge>
                  )}
                  {addon.category && <Badge variant="outline" className="text-xs">{addon.category}</Badge>}
                </div>
                {addon.description && (
                  <p className="text-xs text-muted-foreground break-words">{addon.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(addon)}
                    className="flex-1 text-xs h-8"
                  >
                    <Edit className="h-3 w-3 me-1" />
                    {t('common:actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(addon.id)}
                    className="flex-1 text-red-600 hover:text-red-700 text-xs h-8"
                  >
                    <Trash className="h-3 w-3 me-1" />
                    {t('common:actions.delete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
