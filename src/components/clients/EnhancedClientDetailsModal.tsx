import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { User, Package, ShoppingBag, Calendar, Plus, Edit, Trash2, MessageSquare, Phone, Mail, Settings, FileSignature, History, ClipboardList, Receipt, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { Client } from '@/hooks/useClients';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, functions, storage } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientProducts } from '@/hooks/useClientProducts';
import { PurchaseManagementModal } from '@/components/PurchaseManagementModal';
import { ProductAssignmentModal } from '@/components/ProductAssignmentModal';
import { CustomPackageModal } from '@/components/packages/CustomPackageModal';
import { Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ClientWaiversTab } from '@/components/waivers/ClientWaiversTab';
import { MembershipHistoryTab } from '@/components/clients/MembershipHistoryTab';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import { useInvoices } from '@/hooks/useInvoices';
import type { Invoice } from '@/types/firestore';

interface DatabasePurchase {
  id: string;
  total_amount: number;
  purchase_date: string;
  payment_status: string;
  sessions_remaining: number;
  packages: {
    name: string;
    total_sessions: number;
  } | null;
}

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  treatment_name: string;
  staff_name: string;
  status: string;
  notes?: string;
  duration: number;
  client_name: string;
}

interface EnhancedClientDetailsModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: Client) => Promise<void>;
  isEditing: boolean;
  initialTab?: string;
  onBookAppointment?: (client: Client) => void;
  onAssignPackage?: (client: Client) => void;
  onAssignProduct?: (client: Client) => void;
}

export const EnhancedClientDetailsModal: React.FC<EnhancedClientDetailsModalProps> = ({
  client,
  isOpen,
  onClose,
  onSave,
  isEditing,
  initialTab,
  onBookAppointment,
  onAssignPackage,
  onAssignProduct
}) => {
  const { toast } = useToast();
  const { dropdownData } = useDropdownData();
  const isMobile = useIsMobile();
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState(initialTab ?? 'details');

  // Sync tab when initialTab changes (e.g. "Send Waiver" button opens modal on documents tab)
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab ?? 'details');
  }, [isOpen, initialTab]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    address: '',
    notes: '',
    city: '',
    referral_source: '',
    has_membership: false
  });
  const [purchases, setPurchases] = useState<DatabasePurchase[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isCommunicationModalOpen, setIsCommunicationModalOpen] = useState(false);
  const [isManagePackagesModalOpen, setIsManagePackagesModalOpen] = useState(false);
  const [isCustomPackageModalOpen, setIsCustomPackageModalOpen] = useState(false);
  const [isProductAssignModalOpen, setIsProductAssignModalOpen] = useState(false);
  
  // Use the client packages and products hooks for real data
  const { packages: clientPackages, refetch: refetchPackages } = useClientPackages(client?.id);
  const { products: clientProducts, refetch: refetchProducts } = useClientProducts(client?.id);
  const { invoices } = useInvoices(client?.id);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

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
        referral_source: client.referral_source || '',
        has_membership: client.has_membership || false
      });
      fetchPurchases();
      fetchAppointments();
    }
  }, [client]);

  // Refetch packages and products when modal opens to get latest data
  useEffect(() => {
    if (isOpen && client) {
      refetchPackages();
      refetchProducts();
    }
  }, [isOpen, client, refetchPackages, refetchProducts]);

  const fetchPurchases = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', client.id),
          orderBy('purchase_date', 'desc')
        )
      );

      const results: DatabasePurchase[] = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          let pkg: DatabasePurchase['packages'] = null;
          if (data.package_id) {
            const pkgSnap = await getDoc(doc(db, 'organizations', currentOrganization.id, 'packages', data.package_id));
            if (pkgSnap.exists()) {
              const p = pkgSnap.data();
              pkg = { name: p.name || '', total_sessions: p.total_sessions || 0 };
            }
          }
          return {
            id: d.id,
            total_amount: data.total_amount ?? 0,
            purchase_date: data.purchase_date ?? '',
            payment_status: data.payment_status ?? '',
            sessions_remaining: data.sessions_remaining ?? 0,
            packages: pkg,
          };
        })
      );

      setPurchases(results);
    } catch (error) {
      console.error('Error fetching purchases:', error);
    }
  };

  const fetchAppointments = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'appointments'),
          where('client_id', '==', client.id),
          orderBy('appointment_date', 'desc')
        )
      );

      setAppointments(
        snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            appointment_date: data.appointment_date ?? '',
            appointment_time: data.appointment_time ?? '',
            treatment_name: data.treatment_name ?? '',
            staff_name: data.staff_name ?? '',
            status: data.status ?? '',
            notes: data.notes ?? undefined,
            duration: data.duration ?? 0,
            client_name: data.client_name ?? '',
          };
        })
      );
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const handleSave = () => {
    if (!client) return;
    
    const updatedClient = {
      ...client,
      ...formData,
      purchases: [],
      totalRevenue: purchases.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0)
    };
    
    onSave(updatedClient);
    toast({
      title: "Client Updated",
      description: "Client information has been updated successfully."
    });
    onClose();
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
      title: "History Cleared",
      description: "All appointment and purchase history has been cleared."
    });
    onClose();
  };

  const handleAssignPackage = () => {
    if (client && onAssignPackage) {
      onAssignPackage(client);
      // Refresh packages after assignment
      setTimeout(() => {
        refetchPackages();
        fetchPurchases();
      }, 1000);
    }
  };

  const handleAssignProduct = () => {
    if (client && onAssignProduct) {
      onAssignProduct(client);
      // Refresh products after assignment
      setTimeout(() => {
        refetchProducts();
      }, 1000);
    }
  };

  const handleBookAppointment = () => {
    if (client && onBookAppointment) {
      onBookAppointment(client);
    }
  };

  const handleManagePackages = () => {
    setIsManagePackagesModalOpen(true);
  };

  const handleManageProducts = () => {
    setIsProductAssignModalOpen(true);
  };

  const handlePackageManagementUpdate = () => {
    refetchPackages();
    fetchPurchases();
  };

  const handleGenerateInvoice = async (purchaseId: string) => {
    if (!currentOrganization?.id) return;
    setGeneratingFor(purchaseId);
    try {
      const call = httpsCallable<
        { organizationId: string; purchaseId: string },
        { invoice: Invoice & { id: string }; reused: boolean }
      >(functions, 'createInvoice');
      const res = await call({ organizationId: currentOrganization.id, purchaseId });
      const invoice = res.data.invoice;

      // If a previous invoice is already fully issued with a PDF, just open it.
      if (res.data.reused && invoice.pdf_url) {
        window.open(invoice.pdf_url, '_blank');
        toast({ title: 'Invoice', description: `Opened ${invoice.invoice_number}.` });
        return;
      }

      const blob = await buildInvoicePdf(invoice);
      const path = `invoices/${currentOrganization.id}/${invoice.id}.pdf`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob, {
        contentType: 'application/pdf',
        contentDisposition: `attachment; filename="${invoice.invoice_number}.pdf"`,
      });
      const url = await getDownloadURL(ref);

      await updateDoc(
        doc(db, 'organizations', currentOrganization.id, 'invoices', invoice.id),
        { pdf_url: url, pdf_storage_path: path },
      );

      window.open(url, '_blank');
      toast({
        title: 'Invoice generated',
        description: `${invoice.invoice_number} is ready.`,
      });
    } catch (err: any) {
      const message =
        err?.message?.includes('Daily generateInvoice limit')
          ? 'Daily invoice limit reached for this organization.'
          : err?.message ?? 'Failed to generate invoice';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleOpenInvoice = (inv: Invoice) => {
    if (inv.pdf_url) window.open(inv.pdf_url, '_blank');
    else
      toast({
        title: 'PDF not ready',
        description: 'This invoice does not yet have a PDF. Re-generate from the package row.',
        variant: 'destructive',
      });
  };

  const formatCents = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD',
      }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };

  const formatInvoiceDate = (ts: any) => {
    const d = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    try {
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const handleProductManagementUpdate = () => {
    refetchProducts();
  };

  if (!client) return null;

  const tabOptions = [
    { value: 'details', label: 'Details', icon: User },
    { value: 'appointments', label: `Appointments (${appointments.length})`, icon: Calendar },
    { value: 'packages', label: `Packages (${purchases.length})`, icon: Package },
    { value: 'membership', label: 'Membership', icon: History },
    { value: 'actions', label: 'Actions', icon: Settings },
    { value: 'documents', label: 'Waivers', icon: FileSignature },
    { value: 'intake', label: 'Intake Forms', icon: ClipboardList },
    { value: 'invoices', label: `Invoices (${invoices.length})`, icon: Receipt },
  ];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>{isEditing ? 'Edit Client' : 'Client Details'}</span>
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Update client information' : 'View client details, appointments, and package history'}
            </DialogDescription>
          </DialogHeader>

          <div className="w-full">
            {isMobile ? (
              <div className="space-y-4">
                <Select value={activeTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {tabOptions.find(tab => tab.value === activeTab)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {tabOptions.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <SelectItem key={tab.value} value={tab.value}>
                          <div className="flex items-center space-x-2">
                            <Icon className="h-4 w-4" />
                            <span>{tab.label}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="border-b border-border">
                <nav className="flex space-x-8" aria-label="Tabs">
                  {tabOptions.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.value}
                        onClick={() => setActiveTab(tab.value)}
                        className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === tab.value
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}

            <div className="mt-6">
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Name</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Phone</label>
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Birthday</label>
                      <Input
                        type="date"
                        value={formData.birthday}
                        onChange={(e) => setFormData({...formData, birthday: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">City</label>
                      {isEditing ? (
                        <select
                          value={formData.city}
                          onChange={(e) => setFormData({...formData, city: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Select City</option>
                          {dropdownData.cities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      ) : (
                        <Input value={formData.city} disabled />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">How did you hear about us?</label>
                      {isEditing ? (
                        <select
                          value={formData.referral_source}
                          onChange={(e) => setFormData({...formData, referral_source: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Select Source</option>
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
                    <label className="text-sm font-medium">Address</label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      disabled={!isEditing}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Notes</label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      disabled={!isEditing}
                    />
                  </div>
                  {isEditing && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="membership"
                        checked={formData.has_membership}
                        onChange={(e) => setFormData({...formData, has_membership: e.target.checked})}
                        className="rounded"
                      />
                      <label htmlFor="membership" className="text-sm font-medium">Has Membership</label>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>Status: <Badge>{client.status}</Badge></div>
                    <div>Total Visits: {appointments.length}</div>
                    <div>Last Visit: {appointments.length > 0 ? appointments[0].appointment_date : 'Never'}</div>
                    <div>Total Revenue: ${purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)}</div>
                    <div>Active Packages: {clientPackages.length}</div>
                    <div>Active Products: {clientProducts.length}</div>
                  </div>
                </div>
              )}

              {activeTab === 'appointments' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Appointment History</h3>
                    <Button onClick={handleBookAppointment} size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Book Appointment
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    {appointments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No appointments yet</p>
                        <Button onClick={handleBookAppointment} className="mt-4">
                          Book First Appointment
                        </Button>
                      </div>
                    ) : (
                      appointments.map((appointment) => (
                        <div key={appointment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-2">
                              <Calendar className="h-4 w-4 text-blue-600" />
                              <div>
                                <h4 className="font-medium">{appointment.treatment_name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {appointment.appointment_date} at {formatTimeDisplay(appointment.appointment_time)} • {appointment.duration} min
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Staff: {appointment.staff_name}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant={appointment.status === 'completed' ? 'default' : 'secondary'}>
                                {appointment.status}
                              </Badge>
                            </div>
                          </div>
                          {appointment.notes && (
                            <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                              <strong>Notes:</strong> {appointment.notes}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'packages' && (
                <div className="space-y-6">
                  {/* Packages Section */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium">Assigned Packages</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleManagePackages} size="sm" variant="outline">
                          <Settings className="h-4 w-4 mr-1" />
                          Manage Packages
                        </Button>
                        <Button
                          onClick={() => setIsCustomPackageModalOpen(true)}
                          size="sm"
                          variant="outline"
                        >
                          <Sparkles className="h-4 w-4 mr-1" />
                          Custom Package
                        </Button>
                        <Button onClick={handleAssignPackage} size="sm">
                          <Package className="h-4 w-4 mr-1" />
                          Assign Package
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {purchases.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No packages assigned yet</p>
                          <Button onClick={handleAssignPackage} className="mt-2" size="sm">
                            Assign First Package
                          </Button>
                        </div>
                      ) : (
                        purchases.map((purchase) => (
                          <div key={purchase.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2">
                                <Package className="h-4 w-4 text-purple-600" />
                                <div>
                                  <h4 className="font-medium">{purchase.packages?.name || 'Unknown Package'}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Package • ${Number(purchase.total_amount || 0)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="default">Active</Badge>
                                <p className="text-sm text-muted-foreground mt-1">{safeFormatters.shortDate(purchase.purchase_date) || '—'}</p>
                                <Button
                                  onClick={() => handleGenerateInvoice(purchase.id)}
                                  size="sm"
                                  variant="outline"
                                  className="mt-2"
                                  disabled={generatingFor === purchase.id}
                                >
                                  <Receipt className="h-4 w-4 mr-1" />
                                  {generatingFor === purchase.id ? 'Generating…' : 'Generate Invoice'}
                                </Button>
                              </div>
                            </div>
                            {purchase.packages && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                Sessions: {(purchase.packages.total_sessions || 0) - (purchase.sessions_remaining || 0)}/{purchase.packages.total_sessions} used 
                                ({purchase.sessions_remaining} remaining)
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Products Section */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium">Assigned Products</h3>
                      <div className="flex gap-2">
                        <Button onClick={handleManageProducts} size="sm" variant="outline">
                          <Settings className="h-4 w-4 mr-1" />
                          Manage Products
                        </Button>
                        <Button onClick={handleAssignProduct} size="sm">
                          <ShoppingBag className="h-4 w-4 mr-1" />
                          Assign Product
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {clientProducts.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No products assigned yet</p>
                          <Button onClick={handleAssignProduct} className="mt-2" size="sm">
                            Assign First Product
                          </Button>
                        </div>
                      ) : (
                        clientProducts.map((productAssignment) => (
                          <div key={productAssignment.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2">
                                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center overflow-hidden">
                                  {productAssignment.products?.image_url ? (
                                    <img 
                                      src={productAssignment.products.image_url} 
                                      alt={productAssignment.products.name} 
                                      className="w-full h-full object-cover" 
                                    />
                                  ) : (
                                    <ShoppingBag className="h-4 w-4 text-green-600" />
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-medium">{productAssignment.products?.name || 'Unknown Product'}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Product • ${Number(productAssignment.assigned_price || 0)} • Qty: {productAssignment.quantity}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant={productAssignment.status === 'delivered' ? 'default' : 'secondary'}>
                                  {productAssignment.status}
                                </Badge>
                                <p className="text-sm text-muted-foreground mt-1">{safeFormatters.shortDate(productAssignment.assigned_at) || '—'}</p>
                              </div>
                            </div>
                            {productAssignment.notes && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                <strong>Notes:</strong> {productAssignment.notes}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'membership' && (
                <MembershipHistoryTab client={client} />
              )}

              {activeTab === 'actions' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="font-medium">Quick Actions</h3>
                      
                      <Button onClick={handleBookAppointment} className="w-full" size="lg">
                        <Calendar className="h-4 w-4 mr-2" />
                        Book New Appointment
                      </Button>
                      
                      <Button onClick={handleAssignPackage} className="w-full" size="lg" variant="outline">
                        <Package className="h-4 w-4 mr-2" />
                        Assign Package
                      </Button>
                      
                      <Button onClick={handleAssignProduct} className="w-full" size="lg" variant="outline">
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Assign Product
                      </Button>
                      
                      <Button onClick={() => setIsCommunicationModalOpen(true)} className="w-full" size="lg" variant="outline">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Send Message
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium">Contact Options</h3>
                      
                      <Button 
                        onClick={() => window.open(`tel:${client.phone}`)} 
                        className="w-full" 
                        size="lg" 
                        variant="outline"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        <span className="truncate">Call {client.phone}</span>
                      </Button>
                      
                      {client.email && (
                        <Button 
                          onClick={() => window.open(`mailto:${client.email}`)} 
                          className="w-full" 
                          size="lg" 
                          variant="outline"
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          <span className="truncate">Email {client.email}</span>
                        </Button>
                      )}
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="lg" className="w-full">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear All History
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[95vw] max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Clear All History</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete all appointment and purchase history for this client. 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearHistory} className="w-full sm:w-auto bg-red-600 hover:bg-red-700">
                              Clear History
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <ClientWaiversTab client={client} kind="waiver" />
              )}

              {activeTab === 'intake' && (
                <ClientWaiversTab client={client} kind="intake" />
              )}

              {activeTab === 'invoices' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Invoices</h3>
                    <p className="text-sm text-muted-foreground">
                      Generate invoices from the <strong>Packages</strong> tab.
                    </p>
                  </div>

                  {invoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No invoices issued yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="border rounded-lg p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <Receipt className="h-5 w-5 text-purple-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-mono font-medium truncate">
                                {inv.invoice_number}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatInvoiceDate(inv.issued_at)} ·{' '}
                                {inv.line_items[0]?.name ?? 'Package'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 flex-shrink-0">
                            <div className="text-right">
                              <div className="font-medium">
                                {formatCents(inv.total_cents, inv.currency)}
                              </div>
                              <Badge
                                variant={inv.status === 'void' ? 'destructive' : 'default'}
                                className="mt-0.5"
                              >
                                {inv.status}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenInvoice(inv)}
                              disabled={!inv.pdf_url}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              <span className="hidden sm:inline">Download</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            {isEditing && (
              <Button onClick={handleSave} className="w-full sm:w-auto">
                Save Changes
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ClientCommunicationModal
        client={client}
        isOpen={isCommunicationModalOpen}
        onClose={() => setIsCommunicationModalOpen(false)}
      />

      <PurchaseManagementModal
        client={client}
        isOpen={isManagePackagesModalOpen}
        onClose={() => setIsManagePackagesModalOpen(false)}
        onUpdate={handlePackageManagementUpdate}
      />

      <ProductAssignmentModal
        product={null}
        clients={client ? [client] : []}
        isOpen={isProductAssignModalOpen}
        onClose={() => setIsProductAssignModalOpen(false)}
        onAssign={handleProductManagementUpdate}
      />

      <CustomPackageModal
        client={client}
        isOpen={isCustomPackageModalOpen}
        onClose={() => setIsCustomPackageModalOpen(false)}
        onCreated={() => {
          setIsCustomPackageModalOpen(false);
          refetchPackages();
          fetchPurchases();
        }}
      />
    </>
  );
};
