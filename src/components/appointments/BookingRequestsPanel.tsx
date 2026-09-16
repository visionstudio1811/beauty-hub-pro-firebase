import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type RequestSlot = {
  date?: string;
  time?: string;
  staff_id?: string;
};

type BookingRequest = {
  id: string;
  client_name?: string;
  client_phone?: string;
  treatment_name?: string;
  status?: string;
  preferred_slot?: RequestSlot;
  alternative_slots?: RequestSlot[];
  notes?: string;
  staff_name?: string;
  addons?: Array<{ addon_id?: string; name?: string; price?: number; duration_minutes?: number }>;
  addons_total_price?: number;
  addons_total_duration?: number;
  acuity_sync_status?: string;
};

type StaffMap = Record<string, string>;

// Acuity sync status enum -> translation key under appointments:syncStatus.*
const SYNC_STATUS_KEYS: Record<string, string> = {
  pending: 'pending',
  synced: 'synced',
  failed: 'failed',
  skipped: 'skipped',
};

function syncStatusLabel(status: string) {
  return SYNC_STATUS_KEYS[status] ? i18n.t(`appointments:syncStatus.${SYNC_STATUS_KEYS[status]}`) : status;
}

function slotLabel(slot?: RequestSlot, staff: StaffMap = {}) {
  if (!slot) return i18n.t('appointments:bookingRequests.noSlot');
  const staffName = slot.staff_id ? staff[slot.staff_id] : '';
  return `${slot.date ?? ''} ${slot.time ?? ''}${staffName ? ` ${i18n.t('appointments:bookingRequests.withStaff', { name: staffName })}` : ''}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : i18n.t('appointments:bookingRequests.tryAgain');
}

export function BookingRequestsPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation('appointments');
  // Latest `t` for use inside the staff fetch + Firestore listener callbacks
  // without making them re-run (and re-subscribe) on every language change.
  const tRef = useRef(t);
  tRef.current = t;
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [staff, setStaff] = useState<StaffMap>({});
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  // Pending approve/reject awaiting confirmation in the AlertDialog. Null when
  // no dialog is open. `slot` is the chosen slot for approvals (undefined for
  // rejects).
  const [pendingReview, setPendingReview] = useState<{
    request: BookingRequest;
    action: 'approve' | 'reject';
    slot?: RequestSlot;
  } | null>(null);

  const canReview = profile?.role && ['admin', 'staff', 'reception'].includes(profile.role);
  const orgId = profile?.organizationId;

  // Staff names are effectively static for the panel's lifetime, so a one-time
  // fetch is fine. Booking requests, by contrast, must be live (below).
  const loadStaff = useCallback(async () => {
    if (!orgId || !canReview) return;
    try {
      const staffSnap = await getDocs(collection(db, 'organizations', orgId, 'staff'));
      setStaff(Object.fromEntries(
        staffSnap.docs.map((docSnap) => [
          docSnap.id,
          docSnap.data().name ?? docSnap.data().fullName ?? docSnap.data().email ?? tRef.current('bookingRequests.staffFallback'),
        ]),
      ));
    } catch (error) {
      console.error(error);
    }
  }, [canReview, orgId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Live subscription to pending booking requests so the panel updates the
  // moment any staffer approves/rejects one (no manual refresh, no stale
  // duplicate approvals). The listener is torn down on unmount and whenever the
  // org changes (or the user loses review permission).
  useEffect(() => {
    if (!orgId || !canReview) {
      setRequests([]);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'organizations', orgId, 'bookingRequests'),
      where('status', '==', 'pending'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setRequests(
          snap.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
            .sort((a, b) => String(a.preferred_slot?.date ?? '').localeCompare(String(b.preferred_slot?.date ?? ''))),
        );
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast({ title: tRef.current('bookingRequests.loadFailed'), variant: 'destructive' });
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [canReview, orgId, toast]);

  const pendingCount = requests.length;
  const title = useMemo(() => (
    <span className="flex items-center gap-2">
      <Clock className="h-5 w-5" />
      {t('bookingRequests.title')}
      {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
    </span>
  ), [pendingCount, t]);

  const reviewRequest = async (
    request: BookingRequest,
    action: 'approve' | 'reject',
    selectedSlot?: RequestSlot,
  ) => {
    if (!orgId) return;
    setWorkingId(request.id);
    try {
      const updateRequest = httpsCallable(functions, 'updateClientBookingRequest');
      await updateRequest({
        organizationId: orgId,
        bookingRequestId: request.id,
        action,
        selectedSlot,
        selectedStaffName: selectedSlot?.staff_id ? staff[selectedSlot.staff_id] : request.staff_name,
        staffResponse: rejectNotes[request.id] ?? '',
      });
      toast({
        title: action === 'approve' ? t('bookingRequests.approvedTitle') : t('bookingRequests.rejectedTitle'),
        description: action === 'approve' ? t('bookingRequests.approvedDescription') : t('bookingRequests.rejectedDescription'),
      });
      // No manual refresh — the onSnapshot subscription drops the request from
      // the list as soon as its status leaves 'pending'.
    } catch (error) {
      console.error(error);
      toast({ title: t('bookingRequests.updateFailed'), description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  if (!canReview) return null;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('bookingRequests.loading')}
          </div>
        )}

        {!loading && requests.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('bookingRequests.empty')}</p>
        )}

        {requests.map((request) => (
          <div key={request.id} className="rounded-md border p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="font-medium">{request.client_name || t('bookingRequests.clientFallback')}</div>
                <div className="text-sm text-muted-foreground">{request.treatment_name || t('bookingRequests.treatmentFallback')}</div>
                {Array.isArray(request.addons) && request.addons.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {t('bookingRequests.addons', { names: request.addons.map((a) => a.name).filter(Boolean).join(', ') })}
                    {typeof request.addons_total_price === 'number' && request.addons_total_price > 0
                      ? ` ${t('bookingRequests.addonsPrice', { price: request.addons_total_price.toFixed(2) })}`
                      : ''}
                  </div>
                )}
                {request.status === 'approved' && request.acuity_sync_status && (
                  <div className="text-xs">
                    {request.acuity_sync_status === 'synced' ? (
                      <span className="inline-flex items-center gap-1 text-indigo-700">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        {t('bookingRequests.syncedToAcuity')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {t('bookingRequests.acuitySync', { status: syncStatusLabel(request.acuity_sync_status) })}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-sm">{t('bookingRequests.preferred', { slot: slotLabel(request.preferred_slot, staff) })}</div>
                {(request.alternative_slots ?? []).map((slot, index) => (
                  <div key={`${slot.date}-${slot.time}-${slot.staff_id}`} className="text-sm text-muted-foreground">
                    {t('bookingRequests.backup', { index: index + 1, slot: slotLabel(slot, staff) })}
                  </div>
                ))}
                {request.notes && <div className="text-sm text-muted-foreground">{t('bookingRequests.notes', { notes: request.notes })}</div>}
              </div>

              <div className="flex flex-col gap-2 md:min-w-64">
                <Button
                  size="sm"
                  disabled={workingId === request.id}
                  onClick={() => setPendingReview({ request, action: 'approve', slot: request.preferred_slot })}
                >
                  <CheckCircle className="me-2 h-4 w-4" />
                  {t('bookingRequests.approvePreferred')}
                </Button>
                {(request.alternative_slots ?? []).map((slot, index) => (
                  <Button
                    key={`${slot.date}-${slot.time}-${slot.staff_id}-approve`}
                    size="sm"
                    variant="outline"
                    disabled={workingId === request.id}
                    onClick={() => setPendingReview({ request, action: 'approve', slot })}
                  >
                    {t('bookingRequests.approveBackup', { index: index + 1 })}
                  </Button>
                ))}
                <Textarea
                  placeholder={t('bookingRequests.rejectNotePlaceholder')}
                  value={rejectNotes[request.id] ?? ''}
                  onChange={(event) => setRejectNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={workingId === request.id}
                  onClick={() => setPendingReview({ request, action: 'reject' })}
                >
                  <XCircle className="me-2 h-4 w-4" />
                  {t('bookingRequests.reject')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>

    <AlertDialog
      open={!!pendingReview}
      onOpenChange={(open) => { if (!open) setPendingReview(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingReview?.action === 'approve' ? t('bookingRequests.confirmApproveTitle') : t('bookingRequests.confirmRejectTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingReview?.action === 'approve'
              ? t('bookingRequests.confirmApproveDescription', {
                  client: pendingReview?.request.client_name || t('bookingRequests.thisClient'),
                  treatment: pendingReview?.request.treatment_name || t('bookingRequests.theTreatment'),
                  slot: slotLabel(pendingReview?.slot, staff),
                })
              : t('bookingRequests.confirmRejectDescription', {
                  client: pendingReview?.request.client_name || t('bookingRequests.thisClient'),
                  treatment: pendingReview?.request.treatment_name || t('bookingRequests.theTreatment'),
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={pendingReview?.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : undefined}
            onClick={() => {
              if (!pendingReview) return;
              const { request, action, slot } = pendingReview;
              setPendingReview(null);
              reviewRequest(request, action, slot);
            }}
          >
            {pendingReview?.action === 'approve' ? t('bookingRequests.bookAppointment') : t('bookingRequests.rejectRequest')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
