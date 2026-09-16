import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { User, Package, ShoppingBag, Calendar, Plus, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { PurchaseEditModal } from '@/components/PurchaseEditModal';
import { Client } from '@/hooks/useClients';

// Raw status values -> label keys under clientDetails:statuses.*; unknown values fall back to raw.
const STATUS_LABEL_KEYS: Record<string, string> = {
  'Have Membership': 'haveMembership',
  "Don't Have Membership": 'noMembership',
  'Membership Ended': 'membershipEnded',
  Completed: 'completed',
  completed: 'completed',
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  arrived: 'arrived',
  'in-progress': 'inProgress',
  cancelled: 'cancelled',
  'no-show': 'noShow',
  pending: 'pending',
  active: 'active',
};

interface Purchase {
  id: number;
  type: 'package' | 'product';
  name: string;
  price: number;
  date: string;
  status: string;
  sessions?: {
    total: number;
    used: number;
    remaining: number;
  };
}

interface Appointment {
  id: number;
  date: string;
  time: string;
  treatment: string;
  staff: string;
  status: string;
  notes?: string;
  duration: number;
  price: number;
}

interface ClientDetailsModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => Promise<void>;
  isEditing: boolean;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  client,
  isOpen,
  onClose,
  onSave,
  isEditing
}) => {
  const { t } = useTranslation('clientDetails');
  const { toast } = useToast();
  const { dropdownData } = useDropdownData();
  const statusLabel = (raw: string) => {
    const key = STATUS_LABEL_KEYS[raw];
    return key ? t(`statuses.${key}`) : raw;
  };
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    address: '',
    notes: '',
    city: '',
    referral_source: ''
  });
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  // Update form data when client changes
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        phone: client.phone || '',
        email: client.email || '',
        birthday: client.birthday || '',
        address: client.address || '',
        notes: client.notes || '',
        city: client.city || '',
        referral_source: client.referral_source || ''
      });
      setPurchases(client.purchases || []);
    }
  }, [client]);

  const handleSave = () => {
    if (!client) return;
    
    const totalRevenue = purchases.reduce((sum, purchase) => sum + purchase.price, 0);
    
    const updatedClient = {
      ...client,
      ...formData,
      purchases,
      totalRevenue
    };
    
    onSave(updatedClient);
    toast({
      title: t('legacy.toasts.clientUpdated'),
      description: t('legacy.toasts.clientUpdatedDescription')
    });
    onClose();
  };

  const handleUpdatePurchases = (newPurchases: Purchase[]) => {
    setPurchases(newPurchases);
  };

  const handleClearHistory = () => {
    if (!client) return;
    
    const updatedClient = {
      ...client,
      ...formData,
      purchases: [],
      appointments: [],
      totalRevenue: 0,
      totalVisits: 0,
      lastVisit: 'Never'
    };
    
    onSave(updatedClient);
    toast({
      title: t('legacy.toasts.historyCleared'),
      description: t('legacy.toasts.historyClearedDescription')
    });
    onClose();
  };

  if (!client) return null;

  // Mock appointment history
  const mockAppointments: Appointment[] = [
    {
      id: 1,
      date: '2025-06-01',
      time: t('legacy.mock.time1'),
      treatment: t('legacy.mock.treatment1'),
      staff: 'Sarah Johnson',
      status: 'Completed',
      notes: t('legacy.mock.notes1'),
      duration: 60,
      price: 80
    },
    {
      id: 2,
      date: '2025-05-15',
      time: t('legacy.mock.time2'),
      treatment: t('legacy.mock.treatment2'),
      staff: 'Maria Garcia',
      status: 'Completed',
      notes: t('legacy.mock.notes2'),
      duration: 75,
      price: 120
    },
    {
      id: 3,
      date: '2025-05-01',
      time: t('legacy.mock.time3'),
      treatment: t('legacy.mock.treatment3'),
      staff: 'Jennifer Kim',
      status: 'Completed',
      duration: 45,
      price: 150
    }
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 rtl:space-x-reverse">
              <User className="h-5 w-5" />
              <span>{isEditing ? t('legacy.title.edit') : t('legacy.title.view')}</span>
            </DialogTitle>
            <DialogDescription>
              {isEditing ? t('legacy.description.edit') : t('legacy.description.view')}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">{t('legacy.tabs.details')}</TabsTrigger>
              <TabsTrigger value="purchases">{t('legacy.tabs.purchases')}</TabsTrigger>
              <TabsTrigger value="appointments">{t('legacy.tabs.appointments')}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.name')}</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.phone')}</label>
                  <Input
                    dir="ltr"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.email')}</label>
                  <Input
                    dir="ltr"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.birthday')}</label>
                  <Input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({...formData, birthday: e.target.value})}
                    disabled={!isEditing}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.city')}</label>
                  {isEditing ? (
                    <select
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">{t('legacy.selectCity')}</option>
                      {dropdownData.cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={formData.city} disabled />
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">{t('legacy.fields.referralSource')}</label>
                  {isEditing ? (
                    <select
                      value={formData.referral_source}
                      onChange={(e) => setFormData({...formData, referral_source: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">{t('legacy.selectSource')}</option>
                      {dropdownData.referralSources.map((source) => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </select>
                  ) : (
                    <Input value={formData.referral_source} disabled />
                  )}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">{t('legacy.fields.address')}</label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  disabled={!isEditing}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('legacy.fields.notes')}</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  disabled={!isEditing}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>{t('legacy.stats.status')} <Badge>{statusLabel(client.status)}</Badge></div>
                <div>{t('legacy.stats.totalVisits', { count: client.totalVisits })}</div>
                <div>{t('legacy.stats.lastVisit', { date: client.lastVisit === 'Never' ? t('legacy.stats.never') : client.lastVisit })}</div>
                <div>{t('legacy.stats.totalRevenue', { amount: purchases.reduce((sum, p) => sum + p.price, 0) })}</div>
                <div>{t('legacy.stats.review')} <span className={client.reviewReceived ? 'text-green-600' : 'text-yellow-600'}>
                  {client.reviewReceived ? t('legacy.stats.reviewReceived') : t('legacy.stats.reviewPending')}
                </span></div>
              </div>
            </TabsContent>

            <TabsContent value="purchases" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{t('legacy.purchases.title')}</h3>
                <Button onClick={() => setIsPurchaseModalOpen(true)} size="sm">
                  <Plus className="h-4 w-4 me-1" />
                  {t('legacy.purchases.manage')}
                </Button>
              </div>
              
              <div className="space-y-4">
                {purchases.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t('legacy.purchases.empty')}</p>
                  </div>
                ) : (
                  purchases.map((purchase) => (
                    <div key={purchase.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          {purchase.type === 'package' ? 
                            <Package className="h-4 w-4 text-purple-600" /> : 
                            <ShoppingBag className="h-4 w-4 text-green-600" />
                          }
                          <div>
                            <h4 className="font-medium">{purchase.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {t('legacy.purchases.typePrice', {
                                type: purchase.type === 'package' ? t('legacy.purchases.package') : t('legacy.purchases.product'),
                                price: purchase.price,
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-end">
                          <Badge>{statusLabel(purchase.status)}</Badge>
                          <p className="text-sm text-muted-foreground mt-1">{purchase.date}</p>
                        </div>
                      </div>
                      {purchase.sessions && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                          {t('legacy.purchases.sessionsUsed', {
                            used: purchase.sessions.used,
                            total: purchase.sessions.total,
                            remaining: purchase.sessions.remaining,
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="appointments" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{t('legacy.appointments.title')}</h3>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 me-1" />
                      {t('legacy.appointments.clearHistory')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('legacy.appointments.clearHistory')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('legacy.appointments.clearHistoryDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearHistory} className="bg-red-600 hover:bg-red-700">
                        {t('legacy.appointments.clearHistoryConfirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="space-y-4">
                {mockAppointments.map((appointment) => (
                  <div key={appointment.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <div>
                          <h4 className="font-medium">{appointment.treatment}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('legacy.appointments.dateTime', { date: appointment.date, time: appointment.time, duration: appointment.duration })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {t('legacy.appointments.staff', { name: appointment.staff })}
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <Badge variant={appointment.status === 'Completed' ? 'default' : 'secondary'}>
                          {statusLabel(appointment.status)}
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-1">${appointment.price}</p>
                      </div>
                    </div>
                    {appointment.notes && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                        <strong>{t('legacy.appointments.notes')}</strong> {appointment.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2 rtl:space-x-reverse pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            {isEditing && (
              <Button onClick={handleSave}>
                {t('legacy.footer.saveChanges')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PurchaseEditModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        purchases={purchases}
        onUpdatePurchases={handleUpdatePurchases}
      />
    </>
  );
};
