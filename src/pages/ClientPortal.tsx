import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  CalendarCheck,
  Clock,
  FileText,
  Loader2,
  LogOut,
  Package,
  Phone,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { auth, db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PortalOrg = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  timezone?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type PortalAccess = {
  organization_id: string;
  client_id: string;
  matched_by: 'email' | 'phone';
};

type ClientRecord = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

type SessionSlot = {
  treatment_id: string;
  remaining: number;
  total: number;
};

type PurchaseRecord = {
  id: string;
  package_id?: string;
  sessions_remaining?: number;
  sessions_by_treatment?: SessionSlot[];
  expiry_date?: string;
  payment_status?: string;
};

type PackageRecord = {
  id: string;
  name: string;
  description?: string;
  treatments?: string[];
  total_sessions?: number;
};

type TreatmentRecord = {
  id: string;
  name: string;
  duration?: number;
  price?: number;
};

type StaffRecord = {
  id: string;
  name: string;
};

type ProductAssignment = {
  id: string;
  product_id?: string;
  quantity?: number;
  assigned_price?: number;
  status?: string;
};

type ProductRecord = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  image_url?: string;
};

type InvoiceRecord = {
  id: string;
  invoice_number?: string;
  total_cents?: number;
  currency?: string;
  issued_at?: unknown;
  pdf_url?: string | null;
  status?: string;
};

type AppointmentRecord = {
  id: string;
  appointment_date?: string;
  appointment_time?: string;
  treatment_name?: string;
  staff_name?: string;
  status?: string;
};

type BookingRequestRecord = {
  id: string;
  treatment_name?: string;
  status?: string;
  preferred_slot?: { date?: string; time?: string; staff_id?: string };
  approved_slot?: { date?: string; time?: string; staff_id?: string };
  staff_response?: string;
};

type PortalData = {
  client: ClientRecord | null;
  purchases: PurchaseRecord[];
  packages: Record<string, PackageRecord>;
  treatments: Record<string, TreatmentRecord>;
  staff: StaffRecord[];
  products: ProductAssignment[];
  productCatalog: Record<string, ProductRecord>;
  invoices: InvoiceRecord[];
  appointments: AppointmentRecord[];
  bookingRequests: BookingRequestRecord[];
};

const emptyData: PortalData = {
  client: null,
  purchases: [],
  packages: {},
  treatments: {},
  staff: [],
  products: [],
  productCatalog: {},
  invoices: [],
  appointments: [],
  bookingRequests: [],
};

function formatMoney(cents?: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format((cents ?? 0) / 100);
}

function formatDate(value?: string) {
  if (!value) return 'Not scheduled';
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function statusVariant(status?: string) {
  if (status === 'approved' || status === 'confirmed' || status === 'completed') return 'default';
  if (status === 'pending' || status === 'scheduled') return 'secondary';
  return 'outline';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ClientPortal() {
  const { orgSlug = '' } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useState<PortalOrg | null>(null);
  const [access, setAccess] = useState<PortalAccess | null>(null);
  const [data, setData] = useState<PortalData>(emptyData);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [linking, setLinking] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [requestForm, setRequestForm] = useState({
    purchaseId: '',
    treatmentId: '',
    staffId: '',
    date: '',
    time: '',
    altDate: '',
    altTime: '',
    notes: '',
  });

  useEffect(() => {
    const loadOrg = async () => {
      setLoadingOrg(true);
      try {
        const getOrg = httpsCallable(functions, 'getClientPortalOrg');
        const result = await getOrg({
          slug: orgSlug || undefined,
          host: window.location.hostname,
        });
        setOrg((result.data as { organization: PortalOrg }).organization);
      } catch (error) {
        console.error(error);
        toast({ title: 'Portal not found', description: 'Check the spa link and try again.', variant: 'destructive' });
      } finally {
        setLoadingOrg(false);
      }
    };

    loadOrg();
  }, [orgSlug, toast]);

  useEffect(() => {
    const link = async () => {
      if (!user || !org?.id) return;
      setLinking(true);
      try {
        const linkAccount = httpsCallable(functions, 'linkClientPortalAccount');
        const result = await linkAccount({ organizationId: org.id });
        setAccess((result.data as { access: PortalAccess }).access);
      } catch (error) {
        console.error(error);
        setAccess(null);
        toast({
          title: 'No matching client card',
          description: getErrorMessage(error, 'Use the phone or email saved by the spa.'),
          variant: 'destructive',
        });
      } finally {
        setLinking(false);
      }
    };

    link();
  }, [user, org?.id, toast]);

  useEffect(() => {
    const loadData = async () => {
      if (!access?.organization_id || !access.client_id) return;
      setLoadingData(true);
      try {
        const orgRef = doc(db, 'organizations', access.organization_id);
        const clientSnap = await getDoc(doc(orgRef, 'clients', access.client_id));
        const [purchasesSnap, productsSnap, invoicesSnap, appointmentsSnap, requestsSnap, staffSnap] = await Promise.all([
          getDocs(query(collection(orgRef, 'purchases'), where('client_id', '==', access.client_id), where('payment_status', '==', 'active'))),
          getDocs(query(collection(orgRef, 'productAssignments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'invoices'), where('client_id', '==', access.client_id), where('status', '==', 'issued'))),
          getDocs(query(collection(orgRef, 'appointments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'bookingRequests'), where('client_id', '==', access.client_id))),
          getDocs(collection(orgRef, 'staff')),
        ]);

        const purchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseRecord));
        const packageIds = Array.from(new Set(purchases.map((p) => p.package_id).filter(Boolean) as string[]));
        const productAssignments = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductAssignment));
        const productIds = Array.from(new Set(productAssignments.map((p) => p.product_id).filter(Boolean) as string[]));

        const packageEntries = await Promise.all(
          packageIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'packages', id));
            return snap.exists() ? [id, { id, ...snap.data() } as PackageRecord] as const : null;
          }),
        );
        const packages = Object.fromEntries(packageEntries.filter(Boolean) as Array<readonly [string, PackageRecord]>);

        const treatmentIds = Array.from(new Set(Object.values(packages).flatMap((pkg) => pkg.treatments ?? [])));
        const treatmentEntries = await Promise.all(
          treatmentIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'treatments', id));
            return snap.exists() ? [id, { id, ...snap.data() } as TreatmentRecord] as const : null;
          }),
        );
        const treatments = Object.fromEntries(treatmentEntries.filter(Boolean) as Array<readonly [string, TreatmentRecord]>);

        const productEntries = await Promise.all(
          productIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'products', id));
            return snap.exists() ? [id, { id, ...snap.data() } as ProductRecord] as const : null;
          }),
        );
        const productCatalog = Object.fromEntries(productEntries.filter(Boolean) as Array<readonly [string, ProductRecord]>);

        setData({
          client: clientSnap.exists() ? { id: clientSnap.id, ...clientSnap.data() } as ClientRecord : null,
          purchases,
          packages,
          treatments,
          staff: staffSnap.docs
            .map((d) => ({ id: d.id, name: d.data().name ?? d.data().fullName ?? d.data().email ?? 'Staff' }))
            .filter((staff) => staff.name),
          products: productAssignments,
          productCatalog,
          invoices: invoicesSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as InvoiceRecord))
            .sort((a, b) => String(b.invoice_number ?? '').localeCompare(String(a.invoice_number ?? ''))),
          appointments: appointmentsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as AppointmentRecord))
            .sort((a, b) => `${a.appointment_date ?? ''}${a.appointment_time ?? ''}`.localeCompare(`${b.appointment_date ?? ''}${b.appointment_time ?? ''}`)),
          bookingRequests: requestsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as BookingRequestRecord))
            .reverse(),
        });
      } catch (error) {
        console.error(error);
        toast({ title: 'Could not load portal', description: 'Please refresh and try again.', variant: 'destructive' });
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [access?.organization_id, access?.client_id, refreshKey, toast]);

  const selectedPurchase = useMemo(
    () => data.purchases.find((purchase) => purchase.id === requestForm.purchaseId),
    [data.purchases, requestForm.purchaseId],
  );

  const availableTreatments = useMemo(() => {
    if (!selectedPurchase?.package_id) return [];
    const pkg = data.packages[selectedPurchase.package_id];
    if (!pkg) return [];
    const remainingSlots = selectedPurchase.sessions_by_treatment;
    if (remainingSlots?.length) {
      const allowed = new Set(remainingSlots.filter((slot) => slot.remaining > 0).map((slot) => slot.treatment_id));
      return (pkg.treatments ?? []).filter((id) => allowed.has(id)).map((id) => data.treatments[id]).filter(Boolean);
    }
    return (pkg.treatments ?? []).map((id) => data.treatments[id]).filter(Boolean);
  }, [data.packages, data.treatments, selectedPurchase]);

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setSendingOtp(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'client-portal-recaptcha', { size: 'invisible' });
      }
      const result = await signInWithPhoneNumber(auth, phone.trim(), recaptchaRef.current);
      setConfirmation(result);
      toast({ title: 'Code sent', description: 'Enter the SMS code to continue.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Could not send code', description: 'Check the phone number format and try again.', variant: 'destructive' });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation || !otp.trim()) return;
    await confirmation.confirm(otp.trim());
  };

  const handleCreateRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org?.id || !requestForm.purchaseId || !requestForm.treatmentId || !requestForm.staffId || !requestForm.date || !requestForm.time) {
      toast({ title: 'Missing request details', description: 'Choose a package, treatment, staff member, date, and time.', variant: 'destructive' });
      return;
    }

    setSubmittingRequest(true);
    try {
      const createRequest = httpsCallable(functions, 'createClientBookingRequest');
      const alternativeSlots = requestForm.altDate && requestForm.altTime
        ? [{ date: requestForm.altDate, time: requestForm.altTime, staff_id: requestForm.staffId }]
        : [];

      await createRequest({
        organizationId: org.id,
        purchaseId: requestForm.purchaseId,
        treatmentId: requestForm.treatmentId,
        preferredSlot: { date: requestForm.date, time: requestForm.time, staff_id: requestForm.staffId },
        alternativeSlots,
        notes: requestForm.notes,
      });

      toast({ title: 'Request sent', description: 'The spa will confirm before it becomes an appointment.' });
      setRequestForm({ purchaseId: '', treatmentId: '', staffId: '', date: '', time: '', altDate: '', altTime: '', notes: '' });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast({ title: 'Request failed', description: getErrorMessage(error, 'Please try another slot.'), variant: 'destructive' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loadingOrg) {
    return <PortalShell org={org}><LoadingState label="Loading portal..." /></PortalShell>;
  }

  if (!org) {
    return <PortalShell org={null}><EmptyState title="Portal not found" text="Use the link provided by your spa." /></PortalShell>;
  }

  if (!user) {
    return (
      <PortalShell org={org}>
        <div className="mx-auto w-full max-w-md space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Client sign in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" onClick={handleGoogleSignIn}>Continue with Google</Button>
              <div className="space-y-2">
                <Label htmlFor="client-phone">Phone number</Label>
                <div className="flex gap-2">
                  <Input id="client-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+15551234567" />
                  <Button type="button" variant="outline" onClick={handleSendOtp} disabled={sendingOtp}>
                    {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {confirmation && (
                <div className="space-y-2">
                  <Label htmlFor="client-otp">Verification code</Label>
                  <div className="flex gap-2">
                    <Input id="client-otp" value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" />
                    <Button type="button" onClick={handleVerifyOtp}>Verify</Button>
                  </div>
                </div>
              )}
              <div id="client-portal-recaptcha" />
            </CardContent>
          </Card>
        </div>
      </PortalShell>
    );
  }

  if (linking || loadingData) {
    return <PortalShell org={org}><LoadingState label="Opening your client portal..." /></PortalShell>;
  }

  if (!access) {
    return (
      <PortalShell org={org}>
        <EmptyState
          title="No matching client card"
          text="Sign in with the phone number or Google email saved on your client card."
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => signOut(auth)}>Try another sign in</Button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell org={org}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome</p>
          <h2 className="text-2xl font-semibold">{data.client?.name || 'Client'}</h2>
        </div>
        <Button variant="outline" onClick={() => signOut(auth)}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Plan</TabsTrigger>
          <TabsTrigger value="book">Book</TabsTrigger>
          <TabsTrigger value="history">Visits</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data.purchases.map((purchase) => {
              const pkg = purchase.package_id ? data.packages[purchase.package_id] : null;
              return (
                <Card key={purchase.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      {pkg?.name || 'Package'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{pkg?.description || 'Active package'}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span>Sessions remaining</span>
                      <Badge>{purchase.sessions_remaining ?? 0}</Badge>
                    </div>
                    {purchase.expiry_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Expires</span>
                        <span>{formatDate(purchase.expiry_date)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {data.purchases.length === 0 && <EmptyState title="No active packages" text="Active spa packages will appear here." />}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Products
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.products.map((assignment) => {
                const product = assignment.product_id ? data.productCatalog[assignment.product_id] : null;
                return (
                  <div key={assignment.id} className="rounded-md border p-3">
                    <div className="font-medium">{product?.name || 'Product'}</div>
                    <div className="text-sm text-muted-foreground">Quantity {assignment.quantity ?? 1}</div>
                  </div>
                );
              })}
              {data.products.length === 0 && <p className="text-sm text-muted-foreground">No assigned products yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="book">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Request a treatment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRequest} className="grid gap-4 md:grid-cols-2">
                <Field label="Package">
                  <Select
                    value={requestForm.purchaseId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, purchaseId: value, treatmentId: '' }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose package" /></SelectTrigger>
                    <SelectContent>
                      {data.purchases.map((purchase) => (
                        <SelectItem key={purchase.id} value={purchase.id}>
                          {purchase.package_id ? data.packages[purchase.package_id]?.name : 'Package'} ({purchase.sessions_remaining ?? 0} left)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Treatment">
                  <Select
                    value={requestForm.treatmentId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, treatmentId: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose treatment" /></SelectTrigger>
                    <SelectContent>
                      {availableTreatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Staff">
                  <Select
                    value={requestForm.staffId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, staffId: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
                    <SelectContent>
                      {data.staff.map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>{staff.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Preferred date">
                  <Input type="date" value={requestForm.date} onChange={(event) => setRequestForm((prev) => ({ ...prev, date: event.target.value }))} />
                </Field>
                <Field label="Preferred time">
                  <Input type="time" value={requestForm.time} onChange={(event) => setRequestForm((prev) => ({ ...prev, time: event.target.value }))} />
                </Field>
                <Field label="Backup date">
                  <Input type="date" value={requestForm.altDate} onChange={(event) => setRequestForm((prev) => ({ ...prev, altDate: event.target.value }))} />
                </Field>
                <Field label="Backup time">
                  <Input type="time" value={requestForm.altTime} onChange={(event) => setRequestForm((prev) => ({ ...prev, altTime: event.target.value }))} />
                </Field>
                <div className="md:col-span-2">
                  <Label htmlFor="request-notes">Notes</Label>
                  <Textarea id="request-notes" value={requestForm.notes} onChange={(event) => setRequestForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                <Button className="md:col-span-2" disabled={submittingRequest}>
                  {submittingRequest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send request
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3">
            {data.bookingRequests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{request.treatment_name || 'Treatment request'}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(request.preferred_slot?.date)} at {request.preferred_slot?.time}
                    </div>
                    {request.staff_response && <div className="text-sm text-muted-foreground">{request.staff_response}</div>}
                  </div>
                  <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="grid gap-3">
            {data.appointments.map((appointment) => (
              <Card key={appointment.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{appointment.treatment_name || 'Treatment'}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(appointment.appointment_date)} at {appointment.appointment_time} with {appointment.staff_name || 'staff'}
                    </div>
                  </div>
                  <Badge variant={statusVariant(appointment.status)}>{appointment.status}</Badge>
                </CardContent>
              </Card>
            ))}
            {data.appointments.length === 0 && <EmptyState title="No visits yet" text="Approved appointments will appear here." />}
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="grid gap-3">
            {data.invoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{invoice.invoice_number || 'Invoice'}</div>
                    <div className="text-sm text-muted-foreground">{formatMoney(invoice.total_cents, invoice.currency)}</div>
                  </div>
                  {invoice.pdf_url ? (
                    <Button asChild variant="outline">
                      <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                        <FileText className="mr-2 h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="secondary">Issued</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
            {data.invoices.length === 0 && <EmptyState title="No invoices" text="Issued invoices for active purchases will appear here." />}
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

function PortalShell({ org, children }: { org: PortalOrg | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {org?.logo_url ? <img src={org.logo_url} alt="" className="h-10 w-10 rounded-md object-cover" /> : <CalendarCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{org?.name || 'Client Portal'}</h1>
            <p className="truncate text-sm text-muted-foreground">{org?.address || 'Packages, visits, and requests'}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <div className="font-medium">{title}</div>
        <div className="max-w-md text-sm text-muted-foreground">{text}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
