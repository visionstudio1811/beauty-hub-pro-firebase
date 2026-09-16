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
import { useTranslation, Trans } from 'react-i18next';
import i18n from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import { getDateFnsLocale } from '@/i18n/dateLocale';
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
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatTimeDisplay } from '@/lib/timeUtils';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { ClientCommunicationModal } from './ClientCommunicationModal';
import { useClientPackages, type ClientPackage } from '@/hooks/useClientPackages';
import { useClientProducts } from '@/hooks/useClientProducts';
import { PackageSection } from '@/components/appointment-form/PackageSection';
import { syncMembershipStatus } from '@/hooks/useMembershipSync';
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
import { useSupabaseAddons } from '@/hooks/useSupabaseAddons';
import type { Invoice } from '@/types/firestore';

// Raw status values (stored in Firestore or derived in ClientsContext) -> label keys
// under clientDetails:statuses.*. Unknown values fall back to the raw string.
const STATUS_LABEL_KEYS: Record<string, string> = {
  'Have Membership': 'haveMembership',
  "Don't Have Membership": 'noMembership',
  'Membership Ended': 'membershipEnded',
  scheduled: 'scheduled',
  confirmed: 'confirmed',
  arrived: 'arrived',
  'in-progress': 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
  'no-show': 'noShow',
  pending: 'pending',
  assigned: 'assigned',
  delivered: 'delivered',
  issued: 'issued',
  void: 'void',
  active: 'active',
};

interface SessionSlot {
  treatment_id: string;
  total: number;
  remaining: number;
}

interface DatabasePurchase {
  id: string;
  package_id: string | null;
  total_amount: number;
  purchase_date: string;
  payment_status: string;
  sessions_remaining: number;
  description_override?: string | null;
  packages: {
    name: string;
    total_sessions: number;
    description?: string | null;
  } | null;
  product_snapshot?: { product_id: string; product_name: string; quantity: number; price: number }[];
  sessions_by_treatment?: SessionSlot[];
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
  purchase_id?: string | null;
  package_name?: string | null;
  session_used?: boolean;
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
  const { t } = useTranslation('clientDetails');
  const { locale } = useLanguage();
  const { toast } = useToast();
  const { dropdownData } = useDropdownData();
  const isMobile = useIsMobile();
  const statusLabel = (raw: string) => {
    const key = STATUS_LABEL_KEYS[raw];
    return key ? t(`statuses.${key}`) : raw;
  };
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
    has_membership: false,
    sms_opt_out: false,
    email_opt_out: false,
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
    selectedAddonIds: [] as string[],
  });
  const [savingPastTreatment, setSavingPastTreatment] = useState(false);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [pastDateOpen, setPastDateOpen] = useState(false);
  const [selectedPastPackage, setSelectedPastPackage] = useState<ClientPackage | null>(null);
  const [confirmOverConsume, setConfirmOverConsume] = useState<{ treatmentName: string } | null>(null);

  // Use the client packages and products hooks for real data
  const { packages: clientPackages, refetch: refetchPackages } = useClientPackages(client?.id);
  const { products: clientProducts, refetch: refetchProducts } = useClientProducts(client?.id);
  const { invoices } = useInvoices(client?.id);
  const { treatments: treatmentsList } = useSupabaseTreatments();
  const { addons: addonsList } = useSupabaseAddons();
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
        has_membership: client.has_membership || false,
        sms_opt_out: (client as { sms_opt_out?: boolean }).sms_opt_out === true,
        email_opt_out: (client as { email_opt_out?: boolean }).email_opt_out === true,
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
  }, [isOpen, client?.id, refetchPackages, refetchProducts]);

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

      // Batch-fetch unique packages instead of N+1 (one getDoc per purchase).
      // Same package reused across purchases costs only one read.
      const uniquePackageIds = Array.from(
        new Set(
          activeDocs
            .map((d) => d.data().package_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      );
      const packageSnaps = await Promise.all(
        uniquePackageIds.map((id) =>
          getDoc(doc(db, 'organizations', currentOrganization.id, 'packages', id)),
        ),
      );
      const packageMap = new Map<string, DatabasePurchase['packages']>();
      packageSnaps.forEach((snap) => {
        if (!snap.exists()) return;
        const p = snap.data();
        packageMap.set(snap.id, {
          name: p.name || '',
          total_sessions: p.total_sessions || 0,
          description: p.description ?? null,
        });
      });

      const results: DatabasePurchase[] = activeDocs.map((d) => {
        const data = d.data();
        const pkg = data.package_id ? packageMap.get(data.package_id) ?? null : null;
        return {
          id: d.id,
          package_id: data.package_id ?? null,
          total_amount: data.total_amount ?? 0,
          purchase_date: data.purchase_date ?? '',
          payment_status: data.payment_status ?? '',
          sessions_remaining: data.sessions_remaining ?? 0,
          description_override: data.description_override ?? null,
          packages: pkg,
          product_snapshot: Array.isArray(data.product_snapshot) ? data.product_snapshot : undefined,
          sessions_by_treatment: Array.isArray(data.sessions_by_treatment) ? data.sessions_by_treatment : undefined,
        };
      });

      results.sort((a, b) => (b.purchase_date || '').localeCompare(a.purchase_date || ''));
      setPurchases(results);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      toast({ title: t('common:status.error'), description: t('enhanced.toasts.loadPackagesFailed'), variant: 'destructive' });
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
            purchase_id: data.purchase_id ?? null,
            package_name: data.package_name ?? null,
            session_used: Boolean(data.session_used),
          };
        })
      );
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const handleSavePastTreatment = async (opts: { confirmedOverConsume?: boolean } = {}) => {
    if (!client || !currentOrganization?.id) return;
    if (!pastTreatmentForm.treatment_name || !pastTreatmentForm.appointment_date) {
      toast({ title: t('enhanced.toasts.missingFields'), description: t('enhanced.toasts.missingFieldsDescription'), variant: 'destructive' });
      return;
    }

    const orgId = currentOrganization.id;
    const matchedTreatment = treatmentsList.find(tr => tr.name === pastTreatmentForm.treatment_name);

    if (selectedPastPackage && pastTreatmentForm.selectedAddonIds.length > 1) {
      toast({
        title: t('enhanced.toasts.tooManyAddons'),
        description: t('enhanced.toasts.tooManyAddonsDescription'),
        variant: 'destructive',
      });
      return;
    }

    const selectedAddons = addonsList.filter(a => pastTreatmentForm.selectedAddonIds.includes(a.id));
    const addonSnapshots = selectedAddons.map(a => ({
      addon_id: a.id,
      name: a.name,
      price: a.price,
      duration_minutes: a.duration_minutes ?? 0,
    }));
    const addonsTotalPrice = addonSnapshots.reduce((sum, a) => sum + a.price, 0);
    const addonsTotalDuration = addonSnapshots.reduce((sum, a) => sum + a.duration_minutes, 0);
    const treatmentDurationNum = parseInt(pastTreatmentForm.duration) || 60;
    const totalDuration = treatmentDurationNum + addonsTotalDuration;

    // Over-consume check when a package is selected
    if (selectedPastPackage && !opts.confirmedOverConsume) {
      const slots = selectedPastPackage.sessions_by_treatment;
      let outOfSessions = false;
      if (slots && slots.length > 0 && matchedTreatment?.id) {
        const slot = slots.find(s => s.treatment_id === matchedTreatment.id);
        outOfSessions = !slot || slot.remaining <= 0;
      } else {
        outOfSessions = (selectedPastPackage.sessions_remaining ?? 0) <= 0;
      }
      if (outOfSessions) {
        setConfirmOverConsume({ treatmentName: pastTreatmentForm.treatment_name });
        return;
      }
    }

    setSavingPastTreatment(true);
    try {
      let sessionsAfter = -1;

      if (selectedPastPackage) {
        const apptColl = collection(db, 'organizations', orgId, 'appointments');
        const newApptRef = doc(apptColl);
        const purchaseRef = doc(db, 'organizations', orgId, 'purchases', selectedPastPackage.id);

        sessionsAfter = await runTransaction(db, async (tx) => {
          const purchaseSnap = await tx.get(purchaseRef);
          if (!purchaseSnap.exists()) throw new Error(t('enhanced.toasts.packageGone'));
          const purchase = purchaseSnap.data();

          const slots = purchase.sessions_by_treatment as SessionSlot[] | undefined;
          const updates: Record<string, unknown> = { updated_at: serverTimestamp() };
          let newTotal: number;

          if (slots && slots.length > 0 && matchedTreatment?.id) {
            const updatedSlots = slots.map(s => ({ ...s }));
            const slot = updatedSlots.find(s => s.treatment_id === matchedTreatment.id);
            // Guard: only consume a slot session when one remains. Re-reading
            // inside the transaction means we never drive a slot negative even
            // under concurrent completions. If nothing remains and staff have
            // not explicitly confirmed over-consuming, fail the precondition.
            if (!slot || slot.remaining <= 0) {
              if (!opts.confirmedOverConsume) {
                throw new Error(t('enhanced.toasts.noRemainingForTreatment'));
              }
            } else {
              slot.remaining = Math.max(0, slot.remaining - 1);
            }
            newTotal = Math.max(0, updatedSlots.reduce((sum, s) => sum + s.remaining, 0));
            updates.sessions_by_treatment = updatedSlots;
            updates.sessions_remaining = newTotal;
          } else {
            const current = purchase.sessions_remaining ?? 0;
            // Guard the aggregate branch the same way — never go below zero.
            if (current <= 0 && !opts.confirmedOverConsume) {
              throw new Error(t('enhanced.toasts.noRemainingOnPackage'));
            }
            newTotal = Math.max(0, current - 1);
            updates.sessions_remaining = newTotal;
          }

          if (newTotal <= 0) {
            updates.payment_status = 'completed';
          }

          tx.set(newApptRef, {
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
            duration: totalDuration,
            notes: pastTreatmentForm.notes || '',
            price: addonsTotalPrice,
            status: 'completed',
            is_manual_entry: true,
            purchase_id: selectedPastPackage.id,
            package_id: selectedPastPackage.package_id || null,
            package_name: selectedPastPackage.package_name || null,
            session_used: true,
            addons: addonSnapshots,
            addons_total_price: addonsTotalPrice,
            addons_total_duration: addonsTotalDuration,
            organization_id: orgId,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });

          tx.update(purchaseRef, updates);
          return newTotal;
        });

        if (sessionsAfter <= 0) {
          try {
            await syncMembershipStatus(orgId, client.id);
          } catch (e) {
            console.warn('Membership sync after past-log failed', e);
          }
        }
      } else {
        await addDoc(collection(db, 'organizations', orgId, 'appointments'), {
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
          duration: totalDuration,
          notes: pastTreatmentForm.notes || '',
          price: (parseFloat(pastTreatmentForm.price) || 0) + addonsTotalPrice,
          status: 'completed',
          is_manual_entry: true,
          purchase_id: null,
          package_id: null,
          package_name: null,
          session_used: false,
          addons: addonSnapshots,
          addons_total_price: addonsTotalPrice,
          addons_total_duration: addonsTotalDuration,
          organization_id: orgId,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }

      toast({ title: t('enhanced.toasts.treatmentAdded'), description: t('enhanced.toasts.treatmentAddedDescription') });
      setPastTreatmentForm({ treatment_name: '', appointment_date: '', staff_name: '', duration: '60', notes: '', price: '', selectedAddonIds: [] });
      setSelectedPastPackage(null);
      setConfirmOverConsume(null);
      setIsPastTreatmentOpen(false);
      await fetchAppointments();
      await fetchPurchases();
      refetchPackages();
      onAppointmentSaved?.();
    } catch (err) {
      console.error(err);
      toast({
        title: t('common:status.error'),
        description: err instanceof Error ? err.message : t('enhanced.toasts.saveTreatmentFailed'),
        variant: 'destructive',
      });
    } finally {
      setSavingPastTreatment(false);
    }
  };

  const handleSave = () => {
    if (!client) return;
    
    const updatedClient = {
      ...client,
      ...formData,
      // gender is constrained to the union on Client; the select only ever
      // yields '', 'female', or 'male'.
      gender: formData.gender as '' | 'female' | 'male',
      age: formData.age !== '' ? parseInt(formData.age as string) : undefined,
      purchases: [],
      totalRevenue: purchases.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0)
    };
    
    onSave(updatedClient);
    toast({
      title: t('enhanced.toasts.clientUpdated'),
      description: t('enhanced.toasts.clientUpdatedDescription')
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

      toast({ title: t('enhanced.toasts.historyCleared'), description: t('enhanced.toasts.historyClearedDescription') });
    } catch (error) {
      console.error('Error clearing history:', error);
      toast({ title: t('enhanced.toasts.clearHistoryFailed'), description: t('enhanced.toasts.tryAgain'), variant: 'destructive' });
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
          setFormData(prev => ({
            ...prev,
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
          }));
        }
        toast({ title: t('enhanced.toasts.clientInfoUpdated'), description: message });
      } else {
        toast({ title: t('enhanced.toasts.nothingToFill'), description: message });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('enhanced.toasts.backfillFailedDescription');
      toast({ title: t('enhanced.toasts.backfillFailed'), description: msg, variant: 'destructive' });
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
        toast({ title: t('enhanced.toasts.invoice'), description: t('enhanced.toasts.invoiceOpened', { number: invoice.invoice_number }) });
        return;
      }

      const blob = await buildInvoicePdf(invoice, undefined, {
        lang: currentOrganization?.language ?? 'en',
      });
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
        title: t('enhanced.toasts.invoiceGenerated'),
        description: t('enhanced.toasts.invoiceReady', { number: invoice.invoice_number }),
      });
    } catch (err: any) {
      const message =
        err?.message?.includes('Daily generateInvoice limit')
          ? t('enhanced.toasts.dailyInvoiceLimit')
          : err?.message ?? t('enhanced.toasts.invoiceGenerateFailed');
      toast({ title: t('common:status.error'), description: message, variant: 'destructive' });
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleOpenInvoice = (inv: Invoice) => {
    if (inv.pdf_url) window.open(inv.pdf_url, '_blank');
    else
      toast({
        title: t('enhanced.toasts.pdfNotReady'),
        description: t('enhanced.toasts.pdfNotReadyDescription'),
        variant: 'destructive',
      });
  };

  const handleEmailInvoice = async (inv: Invoice) => {
    const recipientEmail = inv.client_snapshot?.email || client?.email;
    if (!recipientEmail) {
      toast({ title: t('enhanced.toasts.noEmail'), description: t('enhanced.toasts.noEmailDescription'), variant: 'destructive' });
      return;
    }
    if (!inv.pdf_url) {
      toast({ title: t('enhanced.toasts.pdfNotReady'), description: t('enhanced.toasts.generatePdfFirst'), variant: 'destructive' });
      return;
    }
    if (!currentOrganization?.id) return;
    setEmailingInvoice(inv.id);
    try {
      const sendEmail = httpsCallable(functions, 'sendClientEmail');
      // Client-facing content: rendered in the org's default language (falls back to English),
      // never in the signed-in staff member's UI language.
      const emailT = i18n.getFixedT(currentOrganization.language ?? 'en', 'clientDetails');
      const clientName = inv.client_snapshot?.name || client?.name || emailT('enhanced.invoiceEmail.greetingFallback');
      await sendEmail({
        to: recipientEmail,
        subject: emailT('enhanced.invoiceEmail.subject', { number: inv.invoice_number }),
        message: emailT('enhanced.invoiceEmail.body', {
          name: clientName,
          number: inv.invoice_number,
          total: formatCents(inv.total_cents, inv.currency),
          url: inv.pdf_url,
        }),
        clientId: client?.id,
        organizationId: currentOrganization.id,
      });
      toast({ title: t('enhanced.toasts.invoiceSent'), description: t('enhanced.toasts.invoiceSentDescription', { email: recipientEmail }) });
    } catch (err: any) {
      toast({ title: t('enhanced.toasts.sendFailed'), description: err?.message ?? t('enhanced.toasts.sendFailedDescription'), variant: 'destructive' });
    } finally {
      setEmailingInvoice(null);
    }
  };

  const formatCents = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, {
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
      return d.toLocaleDateString(locale);
    } catch {
      return '';
    }
  };

  const handleProductManagementUpdate = () => {
    refetchProducts();
  };

  if (!client) return null;

  const allTabs = [
    { value: 'details', label: t('enhanced.tabs.details'), icon: User },
    { value: 'appointments', label: t('enhanced.tabs.appointments', { count: appointments.length }), icon: Calendar },
    { value: 'packages', label: t('enhanced.tabs.packages', { count: purchases.length }), icon: Package },
    { value: 'membership', label: t('enhanced.tabs.membership'), icon: History },
    { value: 'actions', label: t('enhanced.tabs.actions'), icon: Settings },
    { value: 'documents', label: t('enhanced.tabs.waivers'), icon: FileSignature },
    { value: 'intake', label: t('enhanced.tabs.intake'), icon: ClipboardList },
    { value: 'agreements', label: t('enhanced.tabs.agreements'), icon: FileSignature },
    { value: 'invoices', label: t('enhanced.tabs.invoices', { count: invoices.length }), icon: Receipt },
  ];

  // Non-admin users don't see financial tabs.
  const tabOptions = isAdmin
    ? allTabs
    : allTabs.filter(tab => !adminOnlyTabs.includes(tab.value));

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 rtl:space-x-reverse">
              <User className="h-5 w-5" />
              <span>{isEditing ? t('enhanced.title.edit') : t('enhanced.title.view')}</span>
            </DialogTitle>
            <DialogDescription>
              {isEditing ? t('enhanced.description.edit') : t('enhanced.description.view')}
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
                          <div className="flex items-center space-x-2 rtl:space-x-reverse">
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
                className="md:w-56 md:flex-shrink-0 md:border-e md:border-border md:pe-4 md:sticky md:top-0 md:self-start space-y-1"
                aria-label={t('enhanced.sectionsNav')}
              >
                {tabOptions.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-start transition-colors ${
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
                      <Sparkles className="h-4 w-4 me-1" />
                      {backfilling ? t('enhanced.details.filling') : t('enhanced.details.fillFromForm')}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.name')}</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.phone')}</label>
                      <Input
                        dir="ltr"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.email')}</label>
                      <Input
                        dir="ltr"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.birthday')}</label>
                      {isEditing ? (
                        <Popover open={birthdayOpen} onOpenChange={setBirthdayOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('w-full justify-start text-start font-normal mt-0', !formData.birthday && 'text-muted-foreground')}
                            >
                              <CalendarIcon className="me-2 h-4 w-4" />
                              {formData.birthday
                                ? format(new Date(formData.birthday + 'T12:00:00'), 'MMM d, yyyy', { locale: getDateFnsLocale() })
                                : t('enhanced.details.pickDate')}
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
                          value={formData.birthday ? format(new Date(formData.birthday + 'T12:00:00'), 'MMM d, yyyy', { locale: getDateFnsLocale() }) : ''}
                          disabled
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.age')}</label>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        value={formData.age}
                        onChange={(e) => setFormData({...formData, age: e.target.value})}
                        disabled={!isEditing}
                        placeholder={t('enhanced.details.agePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.gender')}</label>
                      {isEditing ? (
                        <select
                          value={formData.gender}
                          onChange={(e) => setFormData({...formData, gender: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{t('enhanced.details.selectGender')}</option>
                          <option value="female">{t('enhanced.details.female')}</option>
                          <option value="male">{t('enhanced.details.male')}</option>
                        </select>
                      ) : (
                        <Input
                          value={
                            formData.gender === 'female'
                              ? t('enhanced.details.female')
                              : formData.gender === 'male'
                                ? t('enhanced.details.male')
                                : ''
                          }
                          disabled
                        />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.city')}</label>
                      {isEditing ? (
                        <select
                          value={formData.city}
                          onChange={(e) => setFormData({...formData, city: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{t('enhanced.details.selectCity')}</option>
                          {dropdownData.cities.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      ) : (
                        <Input value={formData.city} disabled />
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.referralSource')}</label>
                      {isEditing ? (
                        <select
                          value={formData.referral_source}
                          onChange={(e) => setFormData({...formData, referral_source: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{t('enhanced.details.selectSource')}</option>
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
                    <label className="text-sm font-medium">{t('enhanced.details.fields.address')}</label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="rounded-md border border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/30 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                        {t('enhanced.details.internalOnly')}
                      </span>
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2">
                        {t('enhanced.details.fields.allergies')}
                      </label>
                      <textarea
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-background"
                        rows={2}
                        placeholder={t('enhanced.details.allergiesPlaceholder')}
                        value={formData.allergies}
                        onChange={(e) => setFormData({...formData, allergies: e.target.value})}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('enhanced.details.fields.notes')}</label>
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
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="checkbox"
                          id="membership"
                          checked={formData.has_membership}
                          onChange={(e) => setFormData({...formData, has_membership: e.target.checked})}
                          className="rounded"
                        />
                        <label htmlFor="membership" className="text-sm font-medium">{t('enhanced.details.hasMembership')}</label>
                      </div>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="checkbox"
                          id="sms_opt_out"
                          checked={formData.sms_opt_out}
                          onChange={(e) => setFormData({...formData, sms_opt_out: e.target.checked})}
                          className="rounded"
                        />
                        <label htmlFor="sms_opt_out" className="text-sm font-medium">
                          {t('enhanced.details.smsOptOut')}
                        </label>
                      </div>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <input
                          type="checkbox"
                          id="email_opt_out"
                          checked={formData.email_opt_out}
                          onChange={(e) => setFormData({...formData, email_opt_out: e.target.checked})}
                          className="rounded"
                        />
                        <label htmlFor="email_opt_out" className="text-sm font-medium">
                          {t('enhanced.details.emailOptOut')}
                        </label>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>{t('enhanced.details.stats.status')} <Badge>{statusLabel(client.status)}</Badge></div>
                    <div>{t('enhanced.details.stats.totalVisits', { count: appointments.length })}</div>
                    <div>{t('enhanced.details.stats.lastVisit', { date: appointments.length > 0 ? appointments[0].appointment_date : t('enhanced.details.stats.never') })}</div>
                    {isAdmin && (
                      <div>{t('enhanced.details.stats.totalRevenue', { amount: purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0) })}</div>
                    )}
                    {isAdmin && (
                      <>
                        <div>{t('enhanced.details.stats.activePackages', { count: clientPackages.length })}</div>
                        <div>{t('enhanced.details.stats.activeProducts', { count: clientProducts.length })}</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'appointments' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h3 className="font-medium">{t('enhanced.appointments.title')}</h3>
                    <div className="flex gap-2">
                      <Button onClick={() => setIsPastTreatmentOpen(true)} size="sm" variant="outline">
                        <History className="h-4 w-4 me-1" />
                        {t('enhanced.appointments.logPast')}
                      </Button>
                      <Button onClick={handleBookAppointment} size="sm">
                        <Plus className="h-4 w-4 me-1" />
                        {t('enhanced.appointments.book')}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {appointments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('enhanced.appointments.empty')}</p>
                        <Button onClick={handleBookAppointment} className="mt-4">
                          {t('enhanced.appointments.bookFirst')}
                        </Button>
                      </div>
                    ) : (
                      appointments.map((appointment) => (
                        <div key={appointment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-start space-x-2 rtl:space-x-reverse min-w-0">
                              <Calendar className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                              <div className="min-w-0">
                                <h4 className="font-medium">{appointment.treatment_name}</h4>
                                <div className="mt-0.5">
                                  {appointment.purchase_id ? (
                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs gap-1">
                                      <Package className="h-3 w-3" />
                                      {t('enhanced.appointments.fromPackage', { name: appointment.package_name || t('enhanced.appointments.packageFallback') })}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-gray-600 border-gray-200 text-xs">
                                      {t('enhanced.appointments.alaCarte')}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {t('enhanced.appointments.dateTime', {
                                    date: appointment.appointment_date,
                                    time: formatTimeDisplay(appointment.appointment_time),
                                    duration: appointment.duration,
                                  })}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {t('enhanced.appointments.staff', { name: appointment.staff_name })}
                                </p>
                              </div>
                            </div>
                            <div className="text-end flex-shrink-0">
                              <Badge variant={appointment.status === 'completed' ? 'default' : 'secondary'}>
                                {statusLabel(appointment.status)}
                              </Badge>
                            </div>
                          </div>
                          {appointment.notes && (
                            <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                              <strong>{t('enhanced.appointments.notes')}</strong> {appointment.notes}
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
                      <h3 className="font-medium">{t('enhanced.packages.title')}</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleManagePackages} size="sm" variant="outline">
                          <Settings className="h-4 w-4 me-1" />
                          {t('enhanced.packages.manage')}
                        </Button>
                        <Button
                          onClick={() => setIsCustomPackageModalOpen(true)}
                          size="sm"
                          variant="outline"
                        >
                          <Sparkles className="h-4 w-4 me-1" />
                          {t('enhanced.packages.custom')}
                        </Button>
                        <Button onClick={handleAssignPackage} size="sm">
                          <Package className="h-4 w-4 me-1" />
                          {t('enhanced.packages.assign')}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {purchases.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{t('enhanced.packages.empty')}</p>
                          <Button onClick={handleAssignPackage} className="mt-2" size="sm">
                            {t('enhanced.packages.assignFirst')}
                          </Button>
                        </div>
                      ) : (
                        purchases.map((purchase) => {
                          // Compute delivered/owed for this purchase's product_snapshot
                          const deliveredByProductId: Record<string, number> = {};
                          for (const cp of clientProducts) {
                            if (cp.purchase_id === purchase.id && cp.status === 'delivered') {
                              deliveredByProductId[cp.product_id] = (deliveredByProductId[cp.product_id] || 0) + cp.quantity;
                            }
                          }
                          const totalOwedForPurchase = (purchase.product_snapshot || []).reduce(
                            (sum, p) => sum + Math.max(0, p.quantity - (deliveredByProductId[p.product_id] || 0)),
                            0
                          );
                          return (
                          <div key={purchase.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                <Package className="h-4 w-4 text-purple-600" />
                                <div>
                                  <h4 className="font-medium">{purchase.packages?.name || t('enhanced.packages.unknownPackage')}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {t('enhanced.packages.packagePrice', { amount: Number(purchase.total_amount || 0) })}
                                  </p>
                                  {(purchase.description_override ?? purchase.packages?.description) && (
                                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {purchase.description_override ?? purchase.packages?.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  <Badge variant="default">{t('enhanced.packages.active')}</Badge>
                                  {totalOwedForPurchase > 0 && (
                                    <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                                      {t('enhanced.packages.itemsOwed', { count: totalOwedForPurchase })}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{safeFormatters.shortDate(purchase.purchase_date) || '—'}</p>
                                <div className="flex flex-col gap-2 mt-2">
                                  <Button
                                    onClick={() => handleGenerateInvoice(purchase.id)}
                                    size="sm"
                                    variant="outline"
                                    disabled={generatingFor === purchase.id}
                                  >
                                    <Receipt className="h-4 w-4 me-1" />
                                    {generatingFor === purchase.id ? t('enhanced.packages.generating') : t('enhanced.packages.generateInvoice')}
                                  </Button>
                                  <Button
                                    onClick={() => setAgreementFor({
                                      purchaseId: purchase.id,
                                      packageName: purchase.packages?.name || t('enhanced.packages.packageFallback'),
                                    })}
                                    size="sm"
                                    variant="outline"
                                  >
                                    <FileSignature className="h-4 w-4 me-1" />
                                    {t('enhanced.packages.sendAgreement')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {purchase.packages && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                {t('enhanced.packages.sessionsUsed', {
                                  used: (purchase.packages.total_sessions || 0) - (purchase.sessions_remaining || 0),
                                  total: purchase.packages.total_sessions,
                                  remaining: purchase.sessions_remaining,
                                })}
                              </div>
                            )}
                            {purchase.sessions_by_treatment && purchase.sessions_by_treatment.length > 0 && (
                              <div className="mt-2 p-2 bg-purple-50 rounded text-sm space-y-1.5">
                                <p className="font-medium text-purple-700 mb-1 text-xs">{t('enhanced.packages.sessionsByTreatment')}</p>
                                {purchase.sessions_by_treatment.map((slot, i) => {
                                  const tr = treatmentsList.find(x => x.id === slot.treatment_id);
                                  const used = slot.total - slot.remaining;
                                  const pct = slot.total > 0 ? Math.min(100, Math.max(0, (used / slot.total) * 100)) : 0;
                                  return (
                                    <div key={slot.treatment_id || i} className="text-xs">
                                      <div className="flex justify-between text-purple-900">
                                        <span>{tr?.name || t('enhanced.packages.treatmentFallback')}</span>
                                        <span>
                                          {t('enhanced.packages.slotUsage', { used, remaining: slot.remaining < 0 ? 0 : slot.remaining })}
                                          {slot.remaining < 0 && (
                                            <span className="text-amber-700 ms-1">{t('enhanced.packages.over', { count: Math.abs(slot.remaining) })}</span>
                                          )}
                                        </span>
                                      </div>
                                      <div className="w-full bg-purple-100 rounded-full h-1.5 mt-0.5 overflow-hidden">
                                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {purchase.product_snapshot && purchase.product_snapshot.length > 0 && (
                              <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                                <p className="font-medium text-blue-700 mb-1 text-xs">{t('enhanced.packages.includedProducts')}</p>
                                <ul className="space-y-1">
                                  {purchase.product_snapshot.map((p, i) => {
                                    const delivered = deliveredByProductId[p.product_id] || 0;
                                    const owed = Math.max(0, p.quantity - delivered);
                                    return (
                                      <li key={i} className="flex justify-between items-center text-xs gap-2">
                                        <span className="text-blue-900 flex-1 min-w-0 truncate">
                                          {t('enhanced.packages.productQty', { name: p.product_name, quantity: p.quantity })}
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-blue-700">{t('enhanced.packages.given', { delivered, quantity: p.quantity })}</span>
                                          {owed === 0 ? (
                                            <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50 text-xs">
                                              {t('enhanced.packages.allDelivered')}
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 text-xs">
                                              {t('enhanced.packages.owed', { count: owed })}
                                            </Badge>
                                          )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Products Section */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium">{t('enhanced.products.title')}</h3>
                      <div className="flex gap-2">
                        <Button onClick={handleManageProducts} size="sm" variant="outline">
                          <Settings className="h-4 w-4 me-1" />
                          {t('enhanced.products.manage')}
                        </Button>
                        <Button onClick={handleAssignProduct} size="sm">
                          <ShoppingBag className="h-4 w-4 me-1" />
                          {t('enhanced.products.assign')}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {clientProducts.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{t('enhanced.products.empty')}</p>
                          <Button onClick={handleAssignProduct} className="mt-2" size="sm">
                            {t('enhanced.products.assignFirst')}
                          </Button>
                        </div>
                      ) : (
                        clientProducts.map((productAssignment) => (
                          <div key={productAssignment.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2 rtl:space-x-reverse">
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
                                  <h4 className="font-medium">{productAssignment.products?.name || t('enhanced.products.unknownProduct')}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {t('enhanced.products.productLine', { amount: Number(productAssignment.assigned_price || 0), quantity: productAssignment.quantity })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-end">
                                <Badge variant={productAssignment.status === 'delivered' ? 'default' : 'secondary'}>
                                  {statusLabel(productAssignment.status)}
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
                                    <Receipt className="h-4 w-4 me-1" />
                                    {t('enhanced.products.generateInvoice')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {productAssignment.notes && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                <strong>{t('enhanced.products.notes')}</strong> {productAssignment.notes}
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
                      <h3 className="font-medium">{t('enhanced.actions.quickActions')}</h3>

                      <Button onClick={handleBookAppointment} className="w-full" size="lg">
                        <Calendar className="h-4 w-4 me-2" />
                        {t('enhanced.actions.bookNew')}
                      </Button>

                      {isAdmin && (
                        <Button onClick={handleAssignPackage} className="w-full" size="lg" variant="outline">
                          <Package className="h-4 w-4 me-2" />
                          {t('enhanced.actions.assignPackage')}
                        </Button>
                      )}

                      {isAdmin && (
                        <Button onClick={handleAssignProduct} className="w-full" size="lg" variant="outline">
                          <ShoppingBag className="h-4 w-4 me-2" />
                          {t('enhanced.actions.assignProduct')}
                        </Button>
                      )}

                      <Button onClick={() => setIsCommunicationModalOpen(true)} className="w-full" size="lg" variant="outline">
                        <MessageSquare className="h-4 w-4 me-2" />
                        {t('enhanced.actions.sendMessage')}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium">{t('enhanced.actions.contactOptions')}</h3>
                      
                      <Button 
                        onClick={() => window.open(`tel:${client.phone}`)} 
                        className="w-full" 
                        size="lg" 
                        variant="outline"
                      >
                        <Phone className="h-4 w-4 me-2" />
                        <span className="truncate">{t('enhanced.actions.call')} <span dir="ltr">{client.phone}</span></span>
                      </Button>
                      
                      {client.email && (
                        <Button 
                          onClick={() => window.open(`mailto:${client.email}`)} 
                          className="w-full" 
                          size="lg" 
                          variant="outline"
                        >
                          <Mail className="h-4 w-4 me-2" />
                          <span className="truncate">{t('enhanced.actions.email')} <span dir="ltr">{client.email}</span></span>
                        </Button>
                      )}
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="lg" className="w-full">
                            <Trash2 className="h-4 w-4 me-2" />
                            {t('enhanced.actions.clearHistory')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[95vw] max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('enhanced.actions.clearHistory')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('enhanced.actions.clearHistoryDescription')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel className="w-full sm:w-auto">{t('common:actions.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={handleClearHistory} className="w-full sm:w-auto bg-red-600 hover:bg-red-700">
                              {t('enhanced.actions.clearHistoryConfirm')}
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
                    <h3 className="font-medium">{t('enhanced.invoices.title')}</h3>
                    <p className="text-sm text-muted-foreground">
                      <Trans t={t} i18nKey="enhanced.invoices.hint" components={{ strong: <strong /> }} />
                    </p>
                  </div>

                  {invoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">{t('enhanced.invoices.empty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {invoices.map((inv) => (
                        <div
                          key={inv.id}
                          className="border rounded-lg p-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                            <Receipt className="h-5 w-5 text-purple-600 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-mono font-medium truncate" dir="ltr">
                                {inv.invoice_number}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatInvoiceDate(inv.issued_at)} ·{' '}
                                {inv.line_items[0]?.name ?? t('enhanced.invoices.packageFallback')}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3 rtl:space-x-reverse flex-shrink-0">
                            <div className="text-end">
                              <div className="font-medium">
                                {formatCents(inv.total_cents, inv.currency)}
                              </div>
                              <Badge
                                variant={inv.status === 'void' ? 'destructive' : 'default'}
                                className="mt-0.5"
                              >
                                {statusLabel(inv.status)}
                              </Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenInvoice(inv)}
                              disabled={!inv.pdf_url}
                            >
                              <Download className="h-4 w-4 me-1" />
                              <span className="hidden sm:inline">{t('enhanced.invoices.download')}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEmailInvoice(inv)}
                              disabled={!inv.pdf_url || emailingInvoice === inv.id}
                              title={t('enhanced.invoices.emailTitle')}
                            >
                              <Mail className="h-4 w-4 me-1" />
                              <span className="hidden sm:inline">{emailingInvoice === inv.id ? t('enhanced.invoices.sending') : t('enhanced.invoices.email')}</span>
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

          <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 rtl:space-x-reverse pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
              {t('common:actions.cancel')}
            </Button>
            {isEditing && (
              <Button onClick={handleSave} className="w-full sm:w-auto">
                {t('enhanced.footer.saveChanges')}
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
            <DialogTitle>{t('enhanced.paymentMethod.title')}</DialogTitle>
            <DialogDescription>{t('enhanced.paymentMethod.description')}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder={t('enhanced.paymentMethod.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Zelle">Zelle</SelectItem>
                <SelectItem value="Cherry">Cherry</SelectItem>
                <SelectItem value="Affirm">Affirm</SelectItem>
                <SelectItem value="Cash">{t('enhanced.paymentMethod.options.cash')}</SelectItem>
                <SelectItem value="Credit Card">{t('enhanced.paymentMethod.options.creditCard')}</SelectItem>
                <SelectItem value="Check">{t('enhanced.paymentMethod.options.check')}</SelectItem>
                <SelectItem value="Venmo">Venmo</SelectItem>
                <SelectItem value="Other">{t('enhanced.paymentMethod.options.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPaymentMethodDialogOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button
              disabled={!selectedPaymentMethod}
              onClick={() => {
                setPaymentMethodDialogOpen(false);
                if (pendingPurchaseId) executeGenerateInvoice(pendingPurchaseId, selectedPaymentMethod);
              }}
            >
              <Receipt className="h-4 w-4 me-1" />
              {t('enhanced.paymentMethod.generate')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPastTreatmentOpen}
        onOpenChange={(open) => {
          setIsPastTreatmentOpen(open);
          if (!open) {
            setSelectedPastPackage(null);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('enhanced.pastLog.title')}</DialogTitle>
            <DialogDescription>{t('enhanced.pastLog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {clientPackages.length > 0 && (
              <PackageSection
                selectedClient={client}
                clientPackages={clientPackages}
                selectedPackage={selectedPastPackage}
                onSelectPackage={(pkg) => {
                  setSelectedPastPackage(pkg);
                  setPastTreatmentForm(prev => ({ ...prev, treatment_name: '', price: '', selectedAddonIds: [] }));
                }}
                loading={false}
              />
            )}
            <div>
              <label className="text-sm font-medium">{t('enhanced.pastLog.treatment')}</label>
              {(() => {
                const allowedIds = selectedPastPackage
                  ? (selectedPastPackage.sessions_by_treatment && selectedPastPackage.sessions_by_treatment.length > 0
                      ? selectedPastPackage.sessions_by_treatment.map(s => s.treatment_id)
                      : selectedPastPackage.treatments)
                  : null;
                const displayTreatments = allowedIds
                  ? treatmentsList.filter(tr => allowedIds.includes(tr.id))
                  : treatmentsList;
                return (
                  <>
                    <Select
                      value={pastTreatmentForm.treatment_name}
                      onValueChange={(val) => {
                        const tr = treatmentsList.find(x => x.name === val);
                        setPastTreatmentForm({
                          ...pastTreatmentForm,
                          treatment_name: val,
                          duration: tr ? String(tr.duration) : pastTreatmentForm.duration,
                          price: selectedPastPackage ? '' : (tr?.price != null ? String(tr.price) : pastTreatmentForm.price),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={selectedPastPackage && displayTreatments.length === 0 ? t('enhanced.pastLog.noTreatmentsInPackage') : t('enhanced.pastLog.selectTreatment')} />
                      </SelectTrigger>
                      <SelectContent>
                        {displayTreatments.map(tr => (
                          <SelectItem key={tr.id} value={tr.name}>{tr.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPastPackage && displayTreatments.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">{t('enhanced.pastLog.noTreatmentsAvailable')}</p>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <label className="text-sm font-medium">{t('enhanced.pastLog.date')}</label>
              <Popover open={pastDateOpen} onOpenChange={setPastDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('w-full justify-start text-start font-normal', !pastTreatmentForm.appointment_date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="me-2 h-4 w-4" />
                    {pastTreatmentForm.appointment_date
                      ? format(new Date(pastTreatmentForm.appointment_date + 'T12:00:00'), 'MMM d, yyyy', { locale: getDateFnsLocale() })
                      : t('enhanced.pastLog.pickDate')}
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
              <label className="text-sm font-medium">{t('enhanced.pastLog.staffName')}</label>
              <Input
                placeholder={t('enhanced.pastLog.staffPlaceholder')}
                value={pastTreatmentForm.staff_name}
                onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, staff_name: e.target.value })}
              />
            </div>
            <div className={`grid gap-3 ${isAdmin && !selectedPastPackage ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="text-sm font-medium">{t('enhanced.pastLog.duration')}</label>
                <Input
                  type="number"
                  value={pastTreatmentForm.duration}
                  onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, duration: e.target.value })}
                />
              </div>
              {isAdmin && !selectedPastPackage && (
                <div>
                  <label className="text-sm font-medium">{t('enhanced.pastLog.price')}</label>
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
            {addonsList.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">{t('enhanced.pastLog.addons')}</label>
                  {selectedPastPackage && (
                    <span className="text-xs text-muted-foreground">{t('enhanced.pastLog.oneMaxWithPackage')}</span>
                  )}
                </div>
                <div className="space-y-1 border rounded-md p-2 max-h-36 overflow-y-auto">
                  {addonsList.map((addon) => {
                    const isSelected = pastTreatmentForm.selectedAddonIds.includes(addon.id);
                    const capReached =
                      !!selectedPastPackage && pastTreatmentForm.selectedAddonIds.length >= 1;
                    const disabled = capReached && !isSelected;
                    return (
                      <label
                        key={addon.id}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded p-1.5 text-sm cursor-pointer hover:bg-accent',
                          disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => {
                              const next = isSelected
                                ? pastTreatmentForm.selectedAddonIds.filter(id => id !== addon.id)
                                : [...pastTreatmentForm.selectedAddonIds, addon.id];
                              setPastTreatmentForm({ ...pastTreatmentForm, selectedAddonIds: next });
                            }}
                            className="h-4 w-4 rounded border-input"
                          />
                          <span className="truncate">{addon.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                          <span>{t('enhanced.pastLog.addonPrice', { price: addon.price })}</span>
                          {addon.duration_minutes && addon.duration_minutes > 0 && (
                            <span>{t('enhanced.pastLog.addonDuration', { minutes: addon.duration_minutes })}</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedPastPackage && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">
                {pastTreatmentForm.selectedAddonIds.length > 0
                  ? t('enhanced.pastLog.packageSessionWithAddons')
                  : t('enhanced.pastLog.packageSessionFree')}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">{t('enhanced.pastLog.notes')}</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                rows={2}
                placeholder={t('enhanced.pastLog.notesPlaceholder')}
                value={pastTreatmentForm.notes}
                onChange={(e) => setPastTreatmentForm({ ...pastTreatmentForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsPastTreatmentOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button onClick={() => handleSavePastTreatment()} disabled={savingPastTreatment}>
              {savingPastTreatment ? t('enhanced.pastLog.saving') : t('enhanced.pastLog.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmOverConsume}
        onOpenChange={(open) => { if (!open) setConfirmOverConsume(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('enhanced.overConsume.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('enhanced.overConsume.description', { treatment: confirmOverConsume?.treatmentName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSavePastTreatment({ confirmedOverConsume: true })}>
              {t('enhanced.overConsume.saveAnyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
