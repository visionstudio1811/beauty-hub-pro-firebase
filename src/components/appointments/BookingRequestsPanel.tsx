import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
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
};

type StaffMap = Record<string, string>;

function slotLabel(slot?: RequestSlot, staff: StaffMap = {}) {
  if (!slot) return 'No slot';
  const staffName = slot.staff_id ? staff[slot.staff_id] : '';
  return `${slot.date ?? ''} ${slot.time ?? ''}${staffName ? ` with ${staffName}` : ''}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.';
}

export function BookingRequestsPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [staff, setStaff] = useState<StaffMap>({});
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});

  const canReview = profile?.role && ['admin', 'staff', 'reception'].includes(profile.role);
  const orgId = profile?.organizationId;

  const loadRequests = useCallback(async () => {
    if (!orgId || !canReview) return;
    setLoading(true);
    try {
      const orgRef = collection(db, 'organizations', orgId, 'bookingRequests');
      const staffRef = collection(db, 'organizations', orgId, 'staff');
      const [requestsSnap, staffSnap] = await Promise.all([
        getDocs(query(orgRef, where('status', '==', 'pending'))),
        getDocs(staffRef),
      ]);

      setRequests(
        requestsSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BookingRequest))
          .sort((a, b) => String(a.preferred_slot?.date ?? '').localeCompare(String(b.preferred_slot?.date ?? ''))),
      );
      setStaff(Object.fromEntries(
        staffSnap.docs.map((docSnap) => [
          docSnap.id,
          docSnap.data().name ?? docSnap.data().fullName ?? docSnap.data().email ?? 'Staff',
        ]),
      ));
    } catch (error) {
      console.error(error);
      toast({ title: 'Booking requests failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [canReview, orgId, toast]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const pendingCount = requests.length;
  const title = useMemo(() => (
    <span className="flex items-center gap-2">
      <Clock className="h-5 w-5" />
      Client booking requests
      {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
    </span>
  ), [pendingCount]);

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
        title: action === 'approve' ? 'Request approved' : 'Request rejected',
        description: action === 'approve' ? 'An appointment was created.' : 'The client can see the updated request status.',
      });
      await loadRequests();
    } catch (error) {
      console.error(error);
      toast({ title: 'Could not update request', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  if (!canReview) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading requests...
          </div>
        )}

        {!loading && requests.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending client booking requests.</p>
        )}

        {requests.map((request) => (
          <div key={request.id} className="rounded-md border p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="font-medium">{request.client_name || 'Client'}</div>
                <div className="text-sm text-muted-foreground">{request.treatment_name || 'Treatment'}</div>
                <div className="text-sm">Preferred: {slotLabel(request.preferred_slot, staff)}</div>
                {(request.alternative_slots ?? []).map((slot, index) => (
                  <div key={`${slot.date}-${slot.time}-${slot.staff_id}`} className="text-sm text-muted-foreground">
                    Backup {index + 1}: {slotLabel(slot, staff)}
                  </div>
                ))}
                {request.notes && <div className="text-sm text-muted-foreground">Notes: {request.notes}</div>}
              </div>

              <div className="flex flex-col gap-2 md:min-w-64">
                <Button
                  size="sm"
                  disabled={workingId === request.id}
                  onClick={() => reviewRequest(request, 'approve', request.preferred_slot)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve preferred
                </Button>
                {(request.alternative_slots ?? []).map((slot, index) => (
                  <Button
                    key={`${slot.date}-${slot.time}-${slot.staff_id}-approve`}
                    size="sm"
                    variant="outline"
                    disabled={workingId === request.id}
                    onClick={() => reviewRequest(request, 'approve', slot)}
                  >
                    Approve backup {index + 1}
                  </Button>
                ))}
                <Textarea
                  placeholder="Optional rejection note"
                  value={rejectNotes[request.id] ?? ''}
                  onChange={(event) => setRejectNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={workingId === request.id}
                  onClick={() => reviewRequest(request, 'reject')}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
