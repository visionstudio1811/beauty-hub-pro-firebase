import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type AutomationMessageType = 'email' | 'sms' | 'both';

export interface MarketingAutomation {
  id: string;
  name: string;
  trigger: string;
  delay: string;
  message_type: AutomationMessageType;
  subject: string;
  content: string;
  is_active: boolean;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_triggered_at: string | null;
}

interface AutomationDraft {
  name: string;
  trigger: string;
  delay: string;
  message_type: AutomationMessageType;
  subject: string;
  content: string;
  is_active: boolean;
}

const toIsoString = (raw: unknown): string => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof (raw as { seconds?: number }).seconds === 'number') {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString();
  }
  return '';
};

export function useAutomations() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const [automations, setAutomations] = useState<MarketingAutomation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrganization?.id) {
      setAutomations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, 'organizations', currentOrganization.id, 'marketingAutomations'),
      orderBy('created_at', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: MarketingAutomation[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: String(data.name ?? ''),
            trigger: String(data.trigger ?? ''),
            delay: String(data.delay ?? ''),
            message_type: (data.message_type as AutomationMessageType) ?? 'email',
            subject: String(data.subject ?? ''),
            content: String(data.content ?? ''),
            is_active: Boolean(data.is_active),
            organization_id: String(data.organization_id ?? currentOrganization.id),
            created_by: (data.created_by as string | null) ?? null,
            created_at: toIsoString(data.created_at),
            updated_at: toIsoString(data.updated_at),
            last_triggered_at: toIsoString(data.last_triggered_at) || null,
          };
        });
        setAutomations(rows);
        setLoading(false);
      },
      (err) => {
        console.error('useAutomations: subscription failed', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [currentOrganization?.id]);

  const createAutomation = async (draft: AutomationDraft): Promise<string | null> => {
    if (!currentOrganization?.id) {
      toast({ title: 'No organization', description: 'Cannot create automation.', variant: 'destructive' });
      return null;
    }
    try {
      const ref = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'marketingAutomations'),
        {
          ...draft,
          organization_id: currentOrganization.id,
          created_by: user?.uid ?? null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          last_triggered_at: null,
        },
      );
      return ref.id;
    } catch (err) {
      console.error('createAutomation failed', err);
      toast({
        title: 'Failed to save automation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateAutomation = async (id: string, draft: AutomationDraft): Promise<boolean> => {
    if (!currentOrganization?.id) return false;
    try {
      await updateDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingAutomations', id),
        { ...draft, updated_at: serverTimestamp() },
      );
      return true;
    } catch (err) {
      console.error('updateAutomation failed', err);
      toast({
        title: 'Failed to update automation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      return false;
    }
  };

  const toggleAutomation = async (id: string, isActive: boolean): Promise<void> => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingAutomations', id),
        { is_active: isActive, updated_at: serverTimestamp() },
      );
    } catch (err) {
      console.error('toggleAutomation failed', err);
      toast({
        title: 'Failed to update automation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const deleteAutomation = async (id: string): Promise<void> => {
    if (!currentOrganization?.id) return;
    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'marketingAutomations', id));
    } catch (err) {
      console.error('deleteAutomation failed', err);
      toast({
        title: 'Failed to delete automation',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  return { automations, loading, createAutomation, updateAutomation, toggleAutomation, deleteAutomation };
}
