import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { User, Package, ShoppingBag, Calendar, Plus, Edit, Trash2, MessageSquare, Phone, Mail, Settings, FileSignature, History, ClipboardList, Receipt, Download, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { Client } from '@/hooks/useClients';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useClientPackages } from '@/hooks/useClientPackages';
import { useClientProducts } from '@/hooks/useClientProducts';
import { PurchaseManagementModal } from '@/components/PurchaseManagementModal';
import { ManageClientProductsModal } from '@/components/ManageClientProductsModal';
import { CreateInvoiceDialog } from '@/components/invoices/CreateInvoiceDialog';
import { CustomPackageModal } from '@/components/packages/CustomPackageModal';
import { SendAgreementDialog } from '@/components/agreements/SendAgreementDialog';
import { Sparkles } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { ClientWaiversTab } from '@/components/waivers/ClientWaiversTab';
import { MembershipHistoryTab } from '@/components/clients/MembershipHistoryTab';
import { buildInvoicePdf } from '@/lib/invoicePdf';
import { useInvoices } from '@/hooks/useInvoices';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
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
  product_snapshot?: { product_id: string; product_name: string; quantity: number; price: number }[];
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
  // Incrementing counter forces a fresh fetch of appointments/purchases.
  // Used after an external save (e.g. AppointmentFormModal) so the
  // history list reflects the new record without reopening the modal.
  appointmentRefreshKey?: number;
  // Called after a save originating inside this modal (e.g. Log Past
  // Treatment) so the parent page can refresh aggregate stats too.
  onAppointmentSaved?: () => void;
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
  onAssignProduct,
  appointmentRefreshKey,
  onAppointmentSaved
}) => {
  const { toast } = useToast();
  const { dropdownData } = useDropdownData();
  const isMobile = useIsMobile();
  const isAdmin = useIsAdmin();
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState(initialTab ?? 'details');

  // Tabs that contain financial data — hidden from non-admin.
  const adminOnlyTabs = ['packages', 'membership', 'invoices'];

  // Sync tab when initialTab changes (e.g. "Send Waiver" button opens modal on documents tab).
  // Force-redirect non-admin away from admin-only tabs.
  useEffect(() => {
    if (!isOpen) return;
    const requested = initialTab ?? 'details';
    if (!isAdmin && adminOnlyTabs.includes(requested)) {
      setActiveTab('details');
    } else {
      setActiveTab(requested);
    }
  }, [isOpen, initialTab, isAdmin]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    gender: '',
    age: '',
    address: '',
    allergies: '',
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
  const [isManageProductsModalOpen, setIsManageProductsModalOpen] = useState(false);
  const [isPastTreatmentOpen, setIsPastTreatmentOpen] = useState(false);
  const [pastTreatmentForm, setPastTreatmentForm] = useState({
    treatment_name: '',
    appointment_date: '',
    staff_name: '',
    duration: '60',
    notes: '',
    price: '',
  });
  const [savingPastTreatment, setSavingPastTreatment] = useState(false);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [pastDateOpen, setPastDateOpen] = useState(false);

  // Use the client packages and products hooks for real data
  const { packages: clientPackages, refetch: refetchPackages } = useClientPackages(client?.id);
  const { products: clientProducts, refetch: refetchProducts } = useClientProducts(client?.id);
  const { invoices } = useInvoices(client?.id);
  const { treatments: treatmentsList } = useSupabaseTreatments();
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [emailingInvoice, setEmailingInvoice] = useState<string | null>(null);
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [agreementFor, setAgreementFor] = useState<{ purchaseId: string; packageName: string } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [productInvoiceFor, setProductInvoiceFor] = useState<
    | { product_id: string; quantity: number; unit_price: number }
    | null
  >(null);
  const [productInvoiceOpen, setProductInvoiceOpen] = useState(false);

  // Update form data when client changes
  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        phone: client.phone || '',
        email: client.email || '',
        birthday: client.birthday || '',
        gender: client.gender || '',
        age: client.age != null ? String(client.age) : '',
        address: client.address || '',
        allergies: client.allergies || '',
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

  // Refetch lists whenever the parent signals an external save (e.g. a
  // booking from AppointmentFormModal). Without this the appointments tab
  // shows stale data until the modal is closed and reopened. The parent's
  // counter starts at 0, so we only fire after it has been incremented at
  // least once — otherwise we'd double-fetch on every initial open.
  useEffect(() => {
    if (!isOpen || !client || !appointmentRefreshKey) return;
    fetchAppointments();
    fetchPurchases();
    refetchPackages();
    refetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentRefreshKey]);

  const fetchPurchases = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', client.id)
        )
      );

      const activeDocs = snap.docs.filter(d => !d.data().deleted_at);
      const results: DatabasePurchase[] = await Promise.all(
        activeDocs.map(async (d) => {
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
            product_snapshot: Array.isArray(data.product_snapshot) ? data.product_snapshot : undefined,
          };
        })
      );

      results.sort((a, b) => (b.purchase_date || '').localeCompare(a.purchase_date || ''));
      setPurchases(results);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      toast({ title: 'Error', description: 'Failed to load packages', variant: 'destructive' });
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

  const handleSavePastTreatment = async () => {
    if (!client || !currentOrganization?.id) return;
    if (!pastTreatmentForm.treatment_name || !pastTreatmentForm.appointment_date) {
      toast({ title: 'Missing fields', description: 'Treatment name and date are required.', variant: 'destructive' });
      return;
    }
    setSavingPastTreatment(true);
    try {
      const matchedTreatment = treatmentsList.find(t => t.name === pastTreatmentForm.treatment_name);
      await addDoc(collection(db, 'organizations', currentOrganization.id, 'appointments'), {
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone ?? '',
        client_email: client.email ?? '',
        treatment_id: matchedTreatment?.id ?? '',
        treatment_name: pastTreatmentForm.treatment_name,
        appointment_date: pastTreatmentForm.appointment_date,
        appointment_time: '00:00',
        staff_id: '',
        staff_name: pastTreatmentForm.staff_name || '',
        duration: parseInt(pastTreatmentForm.duration) || 60,
        notes: pastTreatmentForm.notes || '',
        price: parseFloat(pastTreatmentForm.price) || 0,
        status: 'completed',
        is_manual_entry: true,
        organization_id: currentOrganization.id,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      toast({ title: 'Treatment added', description: 'Past treatment has been logged.' });
      setPastTreatmentForm({ treatment_name: '', appointment_date: '', staff_name: '', duration: '60', notes: '', price: '' });
      setIsPastTreatmentOpen(false);
      await fetchAppointments();
      onAppointmentSaved?.();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to save treatment.', variant: 'destructive' });
    } finally {
      setSavingPastTreatment(false);
    }
  };

  const handleSave = () => {
    if (!client) return;
    
    const updatedClient = {
      ...client,
      ...formData,
      age: formData.age !== '' ? parseInt(formData.age as string) : undefined,
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

  const handleClearHistory = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      const orgRef = collection(db, 'organizations', currentOrganization.id);
      const [apptSnap, purchaseSnap] = await Promise.all([
        getDocs(query(collection(db, 'organizations', currentOrganization.id, 'appointments'), where('client_id', '==', client.id))),
        getDocs(query(collection(db, 'organizations', currentOrganization.id, 'purchases'), where('client_id', '==', client.id))),
      ]);

      const batch = writeBatch(db);
      apptSnap.docs.forEach(d => batch.delete(d.ref));
      purchaseSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      setPurchases([]);
      setAppointments([]);

      toast({ title: 'History Cleared', description: 'All appointment and purchase history has been deleted.' });
    } catch (error) {
      console.error('Error clearing history:', error);
      toast({ title: 'Failed to clear history', description: 'Please try again.', variant: 'destructive' });
    }
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
    setIsManageProductsModalOpen(true);
  };

  const handlePackageManagementUpdate = () => {
    refetchPackages();
    fetchPurchases();
  };

  const handleBackfillFromLatestForm = async () => {
    if (!client || !currentOrganization?.id) return;
    setBackfilling(true);
    try {
      const call = httpsCallable<
        { organizationId: string; clientId: string },
        { filled: string[]; message: string }
      >(functions, 'backfillClientFromLatestForm');
      const res = await call({ organizationId: currentOrganization.id, clientId: client.id });
      const { filled, message } = res.data;

      if (filled.length > 0) {
        const snap = await getDoc(doc(db, 'organizations', currentOrganization.id, 'clients', client.id));
        if (snap.exists()) {
          const c = snap.data();
          setFormData({
            name: c.name || '',
            phone: c.phone || '',
            email: c.email || '',
            birthday: c.date_of_birth || c.birthday || '',
            gender: c.gender || '',
            age: c.age != null ? String(c.age) : '',
            address: c.address || '',
            allergies: c.allergies || '',
            notes: c.notes || '',
            city: c.city || '',
            referral_source: c.referral_source || '',
            has_membership: c.has_membership || false
          });
        }
        toast({ title: 'Client info updated', description: message });
      } else {
        toast({ title: 'Nothing to fill', description: message });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not auto-fill from latest form.';
      toast({ title: 'Backfill failed', description: msg, variant: 'destructive' });
    } finally {
      setBackfilling(false);
    }
  };

  const handleGenerateInvoice = (purchaseId: string) => {
    setPendingPurchaseId(purchaseId);
    setSelectedPaymentMethod('');
    setPaymentMethodDialogOpen(true);
  };

  const executeGenerateInvoice = async (purchaseId: string, paymentMethod: string) => {
    if (!currentOrganization?.id) return;
    setGeneratingFor(purchaseId);
    try {
      const call = httpsCallable<
        { organizationId: string; purchaseId: string; payment_method: string },
        { invoice: Invoice & { id: string }; reused: boolean }
      >(functions, 'createInvoice');
      const res = await call({ organizationId: currentOrganization.id, purchaseId, payment_method: paymentMethod });
      const invoice = res.data.invoice;

      // If a previous invoice is already fully issued with a PDF, just open it.
      if (res.data.reused && invoice.pdf_url) {
        window.open(invoice.pdf_url, '_blank');
        toast({ title: 'Invoice', description: `Opened ${invoice.invoice_number}.` });
        return;
      }

      const blob = await buildInvoicePdf(invoice);
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const upload = httpsCallable<
        { organizationId: string; invoiceId: string; pdfBase64: string },
        { url: string; path: string; reused: boolean }
      >(functions, 'uploadInvoicePdf');
      const uploadRes = await upload({
        organizationId: currentOrganization.id,
        invoiceId: invoice.id,
        pdfBase64,
      });
      const url = uploadRes.data.url;

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

  const handleEmailInvoice = async (inv: Invoice) => {
    const recipientEmail = inv.client_snapshot?.email || client?.email;
    if (!recipientEmail) {
      toast({ title: 'No email on file', description: 'This client has no email address.', variant: 'destructive' });
      return;
    }
    if (!inv.pdf_url) {
      toast({ title: 'PDF not ready', description: 'Generate the invoice PDF first.', variant: 'destructive' });
      return;
    }
    if (!currentOrganization?.id) return;
    setEmailingInvoice(inv.id);
    try {
      const sendEmail = httpsCallable(functions, 'sendClientEmail');
      const clientName = inv.client_snapshot?.name || client?.name || 'there';
      await sendEmail({
        to: recipientEmail,
        subject: `Your Invoice ${inv.invoice_number}`,
        message: `Hi ${clientName},\n\nPlease find your invoice below.\n\nInvoice #: ${inv.invoice_number}\nTotal: ${formatCents(inv.total_cents, inv.currency)}\n\nView / Download your invoice:\n${inv.pdf_url}\n\nThank you!`,
        clientId: client?.id,
        organizationId: currentOrganization.id,
      });
      toast({ title: 'Invoice sent', description: `Emailed to ${recipientEmail}.` });
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err?.message ?? 'Could not send invoice email.', variant: 'destructive' });
    } finally {
      setEmailingInvoice(null);
    }
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

  const allTabs = [
    { value: 'details', label: 'Details', icon: User },
    { value: 'appointments', label: `Appointments (${appointments.length})`, icon: Calendar },
    { value: 'packages', label: `Packages (${purchases.length})`, icon: Package },
    { value: 'membership', label: 'Membership', icon: History },
    { value: 'actions', label: 'Actions', icon: Settings },
    { value: 'documents', label: 'Waivers', icon: FileSignature },
    { value: 'intake', label: 'Intake Forms', icon: ClipboardList },
    { value: 'agreements', label: 'Agreements of Purchase', icon: FileSignature },
    { value: 'invoices', label: `Invoices (${invoices.length})`, icon: Receipt },
  ];

  // Non-admin users don't see financial tabs.
  const tabOptions = isAdmin
    ? allTabs
    : allTabs.filter(t => !adminOnlyTabs.includes(t.value));

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

          <div className="w-full flex flex-col md:flex-row md:gap-6">
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
              <nav
                className="md:w-56 md:flex-shrink-0 md:border-r md:border-border md:pr-4 md:sticky md:top-0 md:self-start space-y-1"
                aria-label="Client sections"
              >
                {tabOptions.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}

            <div className="flex-1 min-w-0 mt-6 md:mt-0">
              {activeTab === 'details' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleBackfillFromLatestForm}
                      disabled={backfilling}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      {backfilling ? 'Filling…' : 'Fill from latest signed form'}
                    </Button>
                  </div>
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
                      {isEditing ? (
                        <Popover open={birthdayOpen} onOpenChange={setBirthdayOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('w-full justify-start text-left font-normal mt-0', !formData.birthday && 'text-muted-foreground')}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.birthday
                                ? format(new Date(formData.birthday + 'T12:00:00'), 'MMM d, yyyy')
                                : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={formData.birthday ? new Date(formData.birthday + 'T12:00:00') : undefined}
                              onSelect={(date) => {
                                setFormData({ ...formData, birthday: date ? format(date, 'yyyy-MM-dd') : '' });
                                setBirthdayOpen(false);
                              }}
                              captionLayout="dropdown-buttons"
                              fromYear={1920}
                              toYear={new Date().getFullYear()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Input
                          value={formData.birthday ? format(new Date(formData.birthday + 'T12:00:00'), 'MMM d, yyyy') : ''}
                          disabled
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">Age</label>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        value={formData.age}
                        onChange={(e) => setFormData({...formData, age: e.target.value})}
                        disabled={!isEditing}
                        placeholder="e.g. 35"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Gender</label>
                      {isEditing ? (
                        <select
                          value={formData.gender}
                          onChange={(e) => setFormData({...formData, gender: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Select Gender</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      ) : (
                        <Input value={formData.gender ? formData.gender.charAt(0).toUpperCase() + formData.gender.slice(1) : ''} disabled />
                      )}
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
                  <div className="rounded-md border border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/30 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                        Internal — not visible to clients
                      </span>
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2">
                        Allergies / Medical alerts
                      </label>
                      <textarea
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-background"
                        rows={2}
                        placeholder="e.g. Latex, nuts, fragrance sensitivity"
                        value={formData.allergies}
                        onChange={(e) => setFormData({...formData, allergies: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Notes</label>
                      <textarea
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-background"
                        rows={3}
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  {isEditing && isAdmin && (
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
                    {isAdmin && (
                      <div>Total Revenue: ${purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)}</div>
                    )}
                    {isAdmin && (
                      <>
                        <div>Active Packages: {clientPackages.length}</div>
                        <div>Active Products: {clientProducts.length}</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'appointments' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="font-medium">Appointment History</h3>
                    <div className="flex gap-2">
                      <Button onClick={() => setIsPastTreatmentOpen(true)} size="sm" variant="outline">
                        <History className="h-4 w-4 mr-1" />
                        Log Past Treatment
                      </Button>
                      <Button onClick={handleBookAppointment} size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Book Appointment
                      </Button>
                    </div>
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
                                <div className="flex flex-col gap-2 mt-2">
                                  <Button
                                    onClick={() => handleGenerateInvoice(purchase.id)}
                                    size="sm"
                                    variant="outline"
                                    disabled={generatingFor === purchase.id}
                                  >
                                    <Receipt className="h-4 w-4 mr-1" />
                                    {generatingFor === purchase.id ? 'Generating…' : 'Generate Invoice'}
                                  </Button>
                                  <Button
                                    onClick={() => setAgreementFor({
                                      purchaseId: purchase.id,
                                      packageName: purchase.packages?.name || 'Package',
                                    })}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <FileSignature className="h-4 w-4 mr-1" />
                                    Send Agreement
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {purchase.packages && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                Sessions: {(purchase.packages.total_sessions || 0) - (purchase.sessions_remaining || 0)}/{purchase.packages.total_sessions} used
                                ({purchase.sessions_remaining} remaining)
                              </div>
                            )}
                            {purchase.product_snapshot && purchase.product_snapshot.length > 0 && (
                              <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                                <p className="font-medium text-blue-700 mb-1">Included Products</p>
                                <ul className="space-y-0.5">
                                  {purchase.product_snapshot.map((p, i) => (
                                    <li key={i} className="flex justify-between text-xs text-blue-800">
                                      <span>{p.product_name} × {p.quantity}</span>
                                      <span>${p.price.toFixed(2)}/ea</span>
                                    </li>
                                  ))}
                                </ul>
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
                                <div className="flex flex-col gap-2 mt-2">
                                  <Button
                                    onClick={() => {
                                      setProductInvoiceFor({
                                        product_id: productAssignment.product_id,
                                        quantity: productAssignment.quantity || 1,
                                        unit_price: productAssignment.assigned_price || 0,
                                      });
                                      setProductInvoiceOpen(true);
                                    }}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <Receipt className="h-4 w-4 mr-1" />
                                    Generate Invoice
                                  </Button>
                                </div>
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

                      {isAdmin && (
                        <Button onClick={handleAssignPackage} className="w-full" size="lg" variant="outline">
                          <Package className="h-4 w-4 mr-2" />
                          Assign Package
                        </Button>
                      )}

                      {isAdmin && (
                        <Button onClick={handleAssignProduct} className="w-full" size="lg" variant="outline">
                          <ShoppingBag className="h-4 w-4 mr-2" />
                          Assign Product
                        </Button>
                      )}

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

              {activeTab === 'agreements' && (
                <ClientWaiversTab client={client} kind="agreement" />
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEmailInvoice(inv)}
                              disabled={!inv.pdf_url || emailingInvoice === inv.id}
                              title="Email invoice to client"
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              <span className="hidden sm:inline">{emailingInvoice === inv.id ? 'Sending…' : 'Email'}</span>
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

      <ManageClientProductsModal
        client={client}
        isOpen={isManageProductsModalOpen}
        onClose={() => setIsManageProductsModalOpen(false)}
        onUpdate={handleProductManagementUpdate}
      />

      <CreateInvoiceDialog
        isOpen={productInvoiceOpen}
        onClose={() => setProductInvoiceOpen(false)}
        initialClientId={client?.id}
        initialProduct={productInvoiceFor ?? undefined}
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

      {agreementFor && (
        <SendAgreementDialog
          client={client}
          purchaseId={agreementFor.purchaseId}
          packageName={agreementFor.packageName}
          isOpen={true}
          onClose={() => setAgreementFor(null)}
        />
      )}

      <Dialog open={paymentMethodDialogOpen} onOpenChange={setPaymentMethodDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Payment Method</DialogTitle>
            <DialogDescription>Choose how the client paid for this package.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select a payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Zelle">Zelle</SelectItem>
                <SelectItem value="Cherry">Cherry</SelectItem>
                <SelectItem value="Affirm">Affirm</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
                <SelectItem value="Check">Check</SelectItem>
                <SelectItem value="Venmo">Venmo</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPaymentMethodDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedPaymentMethod}
              onClick={() => {
                setPaymentMethodDialogOpen(false);
                if (pendingPurchaseId) executeGenerateInvoice(pendingPurchaseId, selectedPaymentMethod);
              }}
            >
              <Receipt className="h-4 w-4 mr-1" />
              Generate Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPastTreatmentOpen} onOpenChange={setIsPastTreatmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Past Treatment</DialogTitle>
            <DialogDescription>Add a treatment that was done before you started using the CRM.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Treatment *</label>
              <Select
                value={pastTreatmentForm.treatment_name}
                onValueChange={(val) => {
                  const t = treatmentsList.find(t => t.name === val);
                  setPastTreatmentForm({
                    ...pastTreatmentForm,
                    treatment_name: val,
                    duration: t ? String(t.duration) : pastTreatmentForm.duration,
                    price: t?.price != null ? String(t.price) : pastTreatmentForm.price,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a treatment" />
                </SelectTrigger>
                <SelectContent>
                  {treatmentsList.map(t => (
                    <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date *</label>
              <Popover open={pastDateOpen} onOpenChange={setPastDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-left font-normal', !pastTreatmentForm.appointment_date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {pastTreatmentForm.appointment_date
                      ? format(new Date(pastTreatmentForm.appointment_date + 'T12:00:00'), 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={pastTreatmentForm.appointment_date ? new Date(pastTreatmentForm.appointment_date + 'T12:00:00') : undefined}
                    onSelect={(date) => {
                      setPastTreatmentForm({ ...pastTreatmentForm, appointment_date: date ? format(date, 'yyyy-MM-dd') : '' });
                      setPastDateOpen(false);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={2000}
                    toYear={new Date().getFullYear()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Staff Name</label>
              <Input
                placeholder="e.g. Sarah"
                value={pastTreatmentForm.staff_name}
                onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, staff_name: e.target.value })}
              />
            </div>
            <div className={`grid gap-3 ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="text-sm font-medium">Duration (minutes)</label>
                <Input
                  type="number"
                  value={pastTreatmentForm.duration}
                  onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, duration: e.target.value })}
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-sm font-medium">Price ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={pastTreatmentForm.price}
                    onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, price: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                rows={2}
                placeholder="Optional notes about the treatment"
                value={pastTreatmentForm.notes}
                onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsPastTreatmentOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePastTreatment} disabled={savingPastTreatment}>
              {savingPastTreatment ? 'Saving…' : 'Save Treatment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
