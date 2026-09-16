
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import { personalizeSms, smsSegments } from '@/lib/smsPersonalize';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Phone, Mail, MessageSquare, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';

interface Communication {
  id: string;
  type: 'sms' | 'email' | 'call' | 'note';
  subject?: string;
  message: string;
  sent_at: string;
  status: string;
}

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
}

interface ClientCommunicationModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ClientCommunicationModal: React.FC<ClientCommunicationModalProps> = ({
  client,
  isOpen,
  onClose
}) => {
  const { t } = useTranslation('clients');
  const { locale } = useLanguage();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sms');
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [formData, setFormData] = useState({
    subject: '',
    message: ''
  });

  useEffect(() => {
    if (client && isOpen) {
      fetchCommunications();
      fetchSmsTemplates();
    }
  }, [client, isOpen]);

  const fetchSmsTemplates = async () => {
    if (!currentOrganization?.id) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'smsTemplates'),
          orderBy('updated_at', 'desc'),
        ),
      );
      setSmsTemplates(snap.docs.map((d) => ({ id: d.id, name: d.data().name ?? '', body: d.data().body ?? '' })));
    } catch (error) {
      console.error('Error fetching SMS templates:', error);
    }
  };

  const fetchCommunications = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      // Filter by client_id server-side so we only read this client's
      // communications instead of the whole org's collection. Requires the
      // clientCommunications (client_id ASC + sent_at DESC) composite index.
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'clientCommunications'),
          where('client_id', '==', client.id),
          orderBy('sent_at', 'desc')
        )
      );
      const typedData: Communication[] = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type as 'sms' | 'email' | 'call' | 'note',
            subject: data.subject || undefined,
            message: data.message,
            sent_at: data.sent_at,
            status: data.status,
          };
        });
      setCommunications(typedData);
    } catch (error) {
      console.error('Error fetching communications:', error);
    }
  };

  const handleSendCommunication = async (type: 'sms' | 'email' | 'call' | 'note') => {
    if (!client || !formData.message.trim() || !currentOrganization?.id) return;

    setLoading(true);
    try {
      // SMS actually sends via the Cloud Function (which logs to clientCommunications).
      if (type === 'sms') {
        if (!client.phone) throw new Error('This client has no phone number on file.');
        const sendSmsFn = httpsCallable(functions, 'sendClientSms');
        await sendSmsFn({
          to: client.phone,
          message: formData.message,
          clientId: client.id,
          organizationId: currentOrganization.id,
        });
        const sentAt = new Date().toISOString();
        setCommunications((prev) => [
          { id: `local-${sentAt}`, type: 'sms', message: formData.message, sent_at: sentAt, status: 'delivered' },
          ...prev,
        ]);
        setFormData({ subject: '', message: '' });
        toast({ title: t('common:status.success'), description: t('communication.toast.success.sms') });
        setLoading(false);
        return;
      }

      const now = new Date().toISOString();
      const commRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'clientCommunications'),
        {
          client_id: client.id,
          type,
          subject: type === 'email' ? formData.subject : null,
          message: formData.message,
          status: 'pending',
          sent_at: now,
          sent_at_ts: serverTimestamp(),
        }
      );

      // If email, invoke Cloud Function to actually send
      if (type === 'email' && client.email) {
        try {
          const sendEmailFn = httpsCallable(functions, 'sendClientEmail');
          await sendEmailFn({
            to: client.email,
            // Outbound content delivered to the client, not staff UI copy: keep the
            // fixed fallback rather than following the staff member's UI language.
            subject: formData.subject || 'Message from your business',
            message: formData.message,
            clientId: client.id,
            organizationId: currentOrganization.id,
          });
        } catch (emailError) {
          console.error('Error sending email:', emailError);
          await updateDoc(doc(db, 'organizations', currentOrganization.id, 'clientCommunications', commRef.id), { status: 'failed' });
          throw new Error('Failed to send email');
        }
      }

      const newCommunication: Communication = {
        id: commRef.id,
        type,
        subject: type === 'email' ? formData.subject || undefined : undefined,
        message: formData.message,
        sent_at: now,
        status: type === 'email' ? 'delivered' : 'sent',
      };

      setCommunications(prev => [newCommunication, ...prev]);
      setFormData({ subject: '', message: '' });
      
      toast({
        title: t('common:status.success'),
        description: t(`communication.toast.success.${type}`)
      });
    } catch (error) {
      console.error('Error sending communication:', error);
      toast({
        title: t('common:status.error'),
        description: t(`communication.toast.error.${type}`),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'sms': return <Phone className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'call': return <Phone className="h-4 w-4" />;
      case 'note': return <MessageSquare className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const typeLabel = (type: string) => t(`communication.types.${type}`, { defaultValue: type });
  const statusLabel = (status: string) => t(`communication.statuses.${status}`, { defaultValue: status });

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 rtl:space-x-reverse">
            <MessageSquare className="h-5 w-5" />
            <span>{t('communication.title', { name: client.name })}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sms">{t('communication.tabs.sms')}</TabsTrigger>
            <TabsTrigger value="email">{t('communication.tabs.email')}</TabsTrigger>
            <TabsTrigger value="call">{t('communication.tabs.call')}</TabsTrigger>
            <TabsTrigger value="history">{t('communication.tabs.history')}</TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">{t('communication.sms.heading')}</h4>
              <p className="text-sm text-gray-600 mb-3">
                {client.phone
                  ? <>{t('communication.sms.to', { value: '' })}<span className="ltr-inline">{client.phone}</span></>
                  : t('communication.sms.to', { value: t('communication.sms.noPhone') })}
              </p>
              <div className="space-y-3">
                {smsTemplates.length > 0 && (
                  <div>
                    <Label>{t('communication.sms.template')}</Label>
                    <Select
                      onValueChange={(id) => {
                        const tpl = smsTemplates.find((t) => t.id === id);
                        if (tpl) setFormData({ ...formData, message: personalizeSms(tpl.body, { name: client.name }) });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('communication.sms.templatePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {smsTemplates.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>{tpl.name || t('communication.sms.untitled')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label htmlFor="sms-message">{t('communication.sms.message')}</Label>
                  <Textarea
                    id="sms-message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t('communication.sms.messagePlaceholder')}
                    rows={4}
                  />
                  {formData.message && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('communication.sms.segments', {
                        chars: smsSegments(formData.message).chars,
                        count: smsSegments(formData.message).segments,
                      })}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => handleSendCommunication('sms')}
                  disabled={loading || !formData.message.trim() || !client.phone}
                  className="w-full"
                >
                  {loading ? t('common:status.sending') : t('communication.sms.send')}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="email" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">{t('communication.email.heading')}</h4>
              <p className="text-sm text-gray-600 mb-3">
                {client.email
                  ? <>{t('communication.email.to', { value: '' })}<span className="ltr-inline">{client.email}</span></>
                  : t('communication.email.to', { value: t('communication.email.noEmail') })}
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="email-subject">{t('communication.email.subject')}</Label>
                  <Input
                    id="email-subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder={t('communication.email.subjectPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="email-message">{t('communication.email.message')}</Label>
                  <Textarea
                    id="email-message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t('communication.email.messagePlaceholder')}
                    rows={6}
                  />
                </div>
                <Button 
                  onClick={() => handleSendCommunication('email')} 
                  disabled={loading || !formData.message.trim() || !client.email}
                  className="w-full"
                >
                  {loading ? t('common:status.sending') : t('communication.email.send')}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="call" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">{t('communication.call.heading')}</h4>
              <p className="text-sm text-gray-600 mb-3">
                {t('communication.call.phone', { value: '' })}<span className="ltr-inline">{client.phone}</span>
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="call-notes">{t('communication.call.notes')}</Label>
                  <Textarea
                    id="call-notes"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t('communication.call.notesPlaceholder')}
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={() => handleSendCommunication('call')} 
                  disabled={loading || !formData.message.trim()}
                  className="w-full"
                >
                  {loading ? t('common:status.saving') : t('communication.call.save')}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="space-y-4">
              <h4 className="font-medium">{t('communication.history.heading')}</h4>
              {communications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{t('communication.history.empty')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {communications.map((comm) => (
                    <div key={comm.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-2 rtl:space-x-reverse">
                          {getIconForType(comm.type)}
                          <span className="font-medium">{typeLabel(comm.type)}</span>
                          <Badge variant="outline">{statusLabel(comm.status)}</Badge>
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-4 w-4 me-1" />
                          {new Date(comm.sent_at).toLocaleString(locale)}
                        </div>
                      </div>
                      {comm.subject && (
                        <p className="font-medium text-sm mb-1">{comm.subject}</p>
                      )}
                      <p className="text-sm text-gray-700">{comm.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
