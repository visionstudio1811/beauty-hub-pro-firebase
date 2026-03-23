
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Phone, Mail, MessageSquare, Clock } from 'lucide-react';

interface Communication {
  id: string;
  type: 'sms' | 'email' | 'call' | 'note';
  subject?: string;
  message: string;
  sent_at: string;
  status: string;
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
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sms');
  const [formData, setFormData] = useState({
    subject: '',
    message: ''
  });

  useEffect(() => {
    if (client && isOpen) {
      fetchCommunications();
    }
  }, [client, isOpen]);

  const fetchCommunications = async () => {
    if (!client || !currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'clientCommunications'),
          orderBy('sent_at', 'desc')
        )
      );
      const typedData: Communication[] = snap.docs
        .filter(d => d.data().client_id === client.id)
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
        title: "Success",
        description: `${type.toUpperCase()} ${type === 'note' ? 'added' : 'sent'} successfully`
      });
    } catch (error) {
      console.error('Error sending communication:', error);
      toast({
        title: "Error",
        description: `Failed to send ${type}`,
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

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Communication - {client.name}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sms">SMS</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="call">Call Log</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="sms" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">Send SMS</h4>
              <p className="text-sm text-gray-600 mb-3">To: {client.phone}</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="sms-message">Message</Label>
                  <Textarea
                    id="sms-message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Type your SMS message..."
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={() => handleSendCommunication('sms')} 
                  disabled={loading || !formData.message.trim()}
                  className="w-full"
                >
                  {loading ? 'Sending...' : 'Send SMS'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="email" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">Send Email</h4>
              <p className="text-sm text-gray-600 mb-3">To: {client.email || 'No email address'}</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Email subject..."
                  />
                </div>
                <div>
                  <Label htmlFor="email-message">Message</Label>
                  <Textarea
                    id="email-message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Type your email message..."
                    rows={6}
                  />
                </div>
                <Button 
                  onClick={() => handleSendCommunication('email')} 
                  disabled={loading || !formData.message.trim() || !client.email}
                  className="w-full"
                >
                  {loading ? 'Sending...' : 'Send Email'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="call" className="space-y-4">
            <div className="p-4 border rounded-lg bg-gray-50">
              <h4 className="font-medium mb-2">Log Phone Call</h4>
              <p className="text-sm text-gray-600 mb-3">Phone: {client.phone}</p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="call-notes">Call Notes</Label>
                  <Textarea
                    id="call-notes"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="What was discussed during the call..."
                    rows={4}
                  />
                </div>
                <Button 
                  onClick={() => handleSendCommunication('call')} 
                  disabled={loading || !formData.message.trim()}
                  className="w-full"
                >
                  {loading ? 'Saving...' : 'Log Call'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="space-y-4">
              <h4 className="font-medium">Communication History</h4>
              {communications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No communication history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {communications.map((comm) => (
                    <div key={comm.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center space-x-2">
                          {getIconForType(comm.type)}
                          <span className="font-medium capitalize">{comm.type}</span>
                          <Badge variant="outline">{comm.status}</Badge>
                        </div>
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-4 w-4 mr-1" />
                          {new Date(comm.sent_at).toLocaleString()}
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
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
