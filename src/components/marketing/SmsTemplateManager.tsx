import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '@/i18n';
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
  const { t } = useTranslation('marketing');
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
      // Resolved through the i18n instance so `t` is not a dep of load() —
      // a language switch must not re-fetch the template list.
      toast({ title: i18n.t('marketing:smsTemplates.toasts.loadError'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
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

  const selectTemplate = (tpl: SmsTemplate) => {
    setSelected(tpl);
    setName(tpl.name);
    setBody(tpl.body);
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
      toast({ title: t('smsTemplates.toasts.nameRequired'), description: t('smsTemplates.toasts.nameRequiredDescription'), variant: 'destructive' });
      return;
    }
    if (!body.trim()) {
      toast({ title: t('smsTemplates.toasts.messageRequired'), description: t('smsTemplates.toasts.messageRequiredDescription'), variant: 'destructive' });
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
      toast({ title: t('smsTemplates.toasts.saved') });
      await load();
      onUpdate?.();
    } catch (err) {
      toast({ title: t('smsTemplates.toasts.saveError'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tpl: SmsTemplate) => {
    if (!currentOrganization?.id) return;
    try {
      await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'smsTemplates', tpl.id));
      if (selected?.id === tpl.id) startNew();
      toast({ title: t('smsTemplates.toasts.deleted') });
      await load();
      onUpdate?.();
    } catch (err) {
      toast({ title: t('smsTemplates.toasts.deleteError'), description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const seg = smsSegments(body);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MessageSquare className="h-5 w-5 me-2" />
          {t('smsTemplates.title')}
        </CardTitle>
        <CardDescription>
          <Trans t={t} i18nKey="smsTemplates.description" components={{ code: <code /> }} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* List */}
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full" onClick={startNew}>
              <Plus className="h-4 w-4 me-2" />
              {t('smsTemplates.newTemplate')}
            </Button>
            {loadingList ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('smsTemplates.empty')}</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => selectTemplate(tpl)}
                    className={`w-full text-start px-3 py-2 rounded-md border text-sm transition-colors ${
                      selected?.id === tpl.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <p className="font-medium truncate">{tpl.name || t('smsTemplates.untitled')}</p>
                    <p className="text-xs text-muted-foreground truncate">{tpl.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <Label htmlFor="tpl-name">{t('smsTemplates.fields.name')}</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('smsTemplates.fields.namePlaceholder')}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="tpl-body">{t('smsTemplates.fields.message')}</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertToken('{first_name}')}>
                    {t('smsTemplates.fields.insertFirstName')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => insertToken('{name}')}>
                    {t('smsTemplates.fields.insertName')}
                  </Button>
                </div>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('smsTemplates.fields.bodyPlaceholder')}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('smsTemplates.stats', {
                  chars: seg.chars,
                  segments: t('smsTemplates.segments', { count: seg.segments }),
                  encoding: seg.encoding,
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {selected ? t('smsTemplates.saveChanges') : t('smsTemplates.createTemplate')}
              </Button>
              {selected && (
                <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={() => remove(selected)}>
                  <Trash2 className="h-4 w-4 me-2" />
                  {t('common:actions.delete')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
