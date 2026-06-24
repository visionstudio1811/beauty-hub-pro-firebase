import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { smsSegments } from '@/lib/smsPersonalize';
import { Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
}

export const SmsTemplateManager: React.FC<{ onUpdate?: () => void }> = ({ onUpdate }) => {
  const { currentOrganization } = useOrganization();
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [selected, setSelected] = useState<SmsTemplate | null>(null);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!currentOrganization?.id) return;
    setLoadingList(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'organizations', currentOrganization.id, 'smsTemplates'), orderBy('updated_at', 'desc')),
      );
      setTemplates(snap.docs.map((d) => ({ id: d.id, name: d.data().name ?? '', body: d.data().body ?? '' })));
    } catch (err) {
      toast({ title: 'Error loading templates', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoadingList(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setSelected(null);
    setName('');
    setBody('');
  };

  const selectTemplate = (t: SmsTemplate) => {
    setSelected(t);
    setName(t.name);
    setBody(t.body);
  };

  const insertToken = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const save = async () => {
    if (!currentOrganization?.id) return;
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give the template a name.', variant: 'destructive' });
      return;
    }
    if (!body.trim()) {
      toast({ title: 'Message required', description: 'Add a message body.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (selected) {
        await updateDoc(doc(db, 'organizations', currentOrganization.id, 'smsTemplates', selected.id), {
          name,
          body,
          updated_at: now,
          updated_at_ts: serverTimestamp(),
        });
      } else {
        const ref = await addDoc(collection(db, 'organizations', currentOrganization.id, 'smsTemplates'), {
          name,
          body,
          organization_id: currentOrganization.id,
          created_at: now,
          updated_at: now,
          created_at_ts: serverTimestamp(),
          updated_at_ts: serverTimestamp(),
        });
        setSelected({ id: ref.id, name, body });
      }
      toast({ title: 'Template saved' });
      await load();
      onUpdate?.();
    } catch (err) {
      toast({ title: 'Error saving template', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: SmsTemplate) => {
    if (!currentOrganization?.id) return;
    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'smsTemplates', t.id));
      if (selected?.id === t.id) startNew();
      toast({ title: 'Template deleted' });
      await load();
      onUpdate?.();
    } catch (err) {
      toast({ title: 'Error deleting template', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const seg = smsSegments(body);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" />
          SMS Templates
        </CardTitle>
        <CardDescription>
          Save reusable SMS messages to load into campaigns, automations, and quick-sends. Use{' '}
          <code>{'{first_name}'}</code> or <code>{'{name}'}</code> for personalization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* List */}
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full" onClick={startNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
            {loadingList ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No templates yet.</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      selected?.id === t.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <p className="font-medium truncate">{t.name || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Appointment reminder"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="tpl-body">Message</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertToken('{first_name}')}>
                    + first name
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertToken('{name}')}>
                    + name
                  </Button>
                </div>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {first_name}, ..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {seg.chars} chars · {seg.segments} segment{seg.segments === 1 ? '' : 's'} · {seg.encoding}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selected ? 'Save Changes' : 'Create Template'}
              </Button>
              {selected && (
                <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => remove(selected)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
