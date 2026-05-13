
import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { validateAndSanitize, clientSchema } from '@/lib/validation';
import { Client, useClients } from '@/hooks/useClients';
import { Plus, AlertTriangle, User, ChevronDown, ChevronUp } from 'lucide-react';

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => void;
  onOpenExisting?: (client: Client) => void;
}

type MatchLevel = 'name' | 'phone' | 'email';

interface ClientMatch {
  client: Client;
  reasons: MatchLevel[];
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const normalizePhone = (s: string) => s.replace(/\D/g, '');
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const OTHER_VALUE = '__other__';

const AddClientModal = ({ isOpen, onClose, onAdd, onOpenExisting }: AddClientModalProps) => {
  const { toast } = useToast();
  const { dropdownData, addCity, addReferralSource } = useDropdownData();
  const { clients } = useClients();

  const [newCity, setNewCity] = useState('');
  const [showNewCity, setShowNewCity] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [showNewSource, setShowNewSource] = useState(false);
  const [showMatches, setShowMatches] = useState(true);
  const [confirmDupOpen, setConfirmDupOpen] = useState(false);

  const resetInlineState = () => {
    setShowNewCity(false);
    setNewCity('');
    setShowNewSource(false);
    setNewSource('');
  };

  const handleClose = () => {
    resetInlineState();
    onClose();
  };

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    address: '',
    notes: '',
    city: '',
    referral_source: '',
    allergies: '',
    has_membership: false
  });

  const matches = useMemo<ClientMatch[]>(() => {
    const name = normalizeName(formData.name);
    const email = normalizeEmail(formData.email);
    const phone = normalizePhone(formData.phone);
    if (name.length < 2 && !email && phone.length < 7) return [];

    const buckets = new Map<string, ClientMatch>();
    const add = (client: Client, reason: MatchLevel) => {
      const existing = buckets.get(client.id);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      } else {
        buckets.set(client.id, { client, reasons: [reason] });
      }
    };

    for (const c of clients) {
      const cName = normalizeName(c.name || '');
      const cEmail = normalizeEmail(c.email || '');
      const cPhone = normalizePhone(c.phone || '');

      if (name.length >= 2 && cName && (cName === name || cName.startsWith(name) || cName.includes(name))) {
        add(c, 'name');
      }
      if (email && looksLikeEmail(formData.email) && cEmail && cEmail === email) {
        add(c, 'email');
      }
      if (phone.length >= 7 && cPhone && cPhone === phone) {
        add(c, 'phone');
      }
    }

    const list = Array.from(buckets.values());
    // Sort: exact-identifier matches (email/phone) first, then startsWith name, then includes name.
    list.sort((a, b) => {
      const aExact = a.reasons.includes('email') || a.reasons.includes('phone') ? 1 : 0;
      const bExact = b.reasons.includes('email') || b.reasons.includes('phone') ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aStarts = normalizeName(a.client.name || '').startsWith(name) ? 1 : 0;
      const bStarts = normalizeName(b.client.name || '').startsWith(name) ? 1 : 0;
      return bStarts - aStarts;
    });

    return list.slice(0, 5);
  }, [clients, formData.name, formData.email, formData.phone]);

  const hasHardMatch = matches.some(m => m.reasons.includes('email') || m.reasons.includes('phone'));

  const handleCityChange = async (value: string) => {
    if (value === OTHER_VALUE) {
      setShowNewCity(true);
      setFormData(prev => ({ ...prev, city: '' }));
    } else {
      setShowNewCity(false);
      setNewCity('');
      setFormData(prev => ({ ...prev, city: value }));
    }
  };

  const handleSaveNewCity = async () => {
    const trimmed = newCity.trim();
    if (!trimmed) return;
    try {
      await addCity(trimmed);
      setFormData(prev => ({ ...prev, city: trimmed }));
      setShowNewCity(false);
      setNewCity('');
      toast({ title: "City added", description: `"${trimmed}" is now available in the list.` });
    } catch {
      toast({ title: "Error", description: "Failed to add city.", variant: "destructive" });
    }
  };

  const handleSourceChange = async (value: string) => {
    if (value === OTHER_VALUE) {
      setShowNewSource(true);
      setFormData(prev => ({ ...prev, referral_source: '' }));
    } else {
      setShowNewSource(false);
      setNewSource('');
      setFormData(prev => ({ ...prev, referral_source: value }));
    }
  };

  const handleSaveNewSource = async () => {
    const trimmed = newSource.trim();
    if (!trimmed) return;
    try {
      await addReferralSource(trimmed);
      setFormData(prev => ({ ...prev, referral_source: trimmed }));
      setShowNewSource(false);
      setNewSource('');
      toast({ title: "Source added", description: `"${trimmed}" is now available in the list.` });
    } catch {
      toast({ title: "Error", description: "Failed to add source.", variant: "destructive" });
    }
  };

  const actuallyAdd = async () => {
    const clientData = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      birthday: formData.birthday,
      address: formData.address,
      notes: formData.notes,
      city: formData.city,
      referral_source: formData.referral_source,
      allergies: formData.allergies,
      has_membership: formData.has_membership,
      // UI properties
      status: formData.has_membership ? 'Have Membership' : "Don't Have Membership",
      lastVisit: 'Never',
      totalVisits: 0,
      activePackage: null,
      reviewReceived: false,
      purchases: [],
      totalRevenue: 0,
      recentPurchases: []
    };

    await onAdd(clientData);

    setFormData({
      name: '',
      phone: '',
      email: '',
      birthday: '',
      address: '',
      notes: '',
      city: '',
      referral_source: '',
      allergies: '',
      has_membership: false
    });
    setConfirmDupOpen(false);
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate required fields
      if (!formData.name.trim() || !formData.phone.trim()) {
        toast({
          title: "Validation Error",
          description: "Name and phone are required fields.",
          variant: "destructive"
        });
        return;
      }

      if (hasHardMatch) {
        setConfirmDupOpen(true);
        return;
      }

      await actuallyAdd();
    } catch (error) {
      console.error('Error adding client:', error);
    }
  };

  const handleOpenExisting = (client: Client) => {
    if (!onOpenExisting) return;
    setFormData({
      name: '',
      phone: '',
      email: '',
      birthday: '',
      address: '',
      notes: '',
      city: '',
      referral_source: '',
      allergies: '',
      has_membership: false
    });
    handleClose();
    // Defer to next tick so the AddClient modal animates out before details opens.
    setTimeout(() => onOpenExisting(client), 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>
            Add a new client to your database. Required fields are marked with *.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {matches.length > 0 && (
            <div
              className={`rounded-md border p-3 ${
                hasHardMatch
                  ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                  : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${hasHardMatch ? 'text-red-600' : 'text-amber-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${hasHardMatch ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'}`}>
                      {hasHardMatch ? 'Likely duplicate' : 'Similar clients'} — {matches.length} match{matches.length === 1 ? '' : 'es'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowMatches(s => !s)}
                      className="text-xs text-muted-foreground hover:underline flex items-center gap-0.5"
                    >
                      {showMatches ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {showMatches ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showMatches && (
                    <ul className="mt-2 space-y-1.5">
                      {matches.map(({ client, reasons }) => (
                        <li key={client.id} className="flex items-center justify-between gap-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{client.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {[client.email, client.phone].filter(Boolean).join(' • ')}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {reasons.map(r => (
                                <span
                                  key={r}
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    r === 'name'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                  }`}
                                >
                                  {r === 'name' ? 'name match' : r === 'email' ? 'email match' : 'phone match'}
                                </span>
                              ))}
                            </div>
                          </div>
                          {onOpenExisting && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenExisting(client)}
                              className="flex-shrink-0"
                            >
                              Open
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="birthday">Date of Birth</Label>
              <Input
                id="birthday"
                type="date"
                value={formData.birthday}
                onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <select
                id="city"
                value={showNewCity ? OTHER_VALUE : formData.city}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select City</option>
                {dropdownData.cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
                <option value={OTHER_VALUE}>+ Add new city…</option>
              </select>
              {showNewCity && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Enter new city"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSaveNewCity())}
                    autoFocus
                  />
                  <Button type="button" size="sm" onClick={handleSaveNewCity} disabled={!newCity.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="referral_source">How did you hear about us?</Label>
              <select
                id="referral_source"
                value={showNewSource ? OTHER_VALUE : formData.referral_source}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select Source</option>
                {dropdownData.referralSources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
                <option value={OTHER_VALUE}>+ Add new source…</option>
              </select>
              {showNewSource && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Enter new source"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSaveNewSource())}
                    autoFocus
                  />
                  <Button type="button" size="sm" onClick={handleSaveNewSource} disabled={!newSource.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="rounded-md border border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/30 p-3 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
              Internal — not visible to clients
            </div>
            <div>
              <Label htmlFor="allergies">Allergies / Medical alerts</Label>
              <textarea
                id="allergies"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-background"
                rows={2}
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder="Any known allergies..."
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-background"
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about the client..."
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="membership"
              checked={formData.has_membership}
              onChange={(e) => setFormData({ ...formData, has_membership: e.target.checked })}
              className="rounded"
            />
            <Label htmlFor="membership">Has Membership</Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">
              Add Client
            </Button>
          </div>
        </form>

        <AlertDialog open={confirmDupOpen} onOpenChange={setConfirmDupOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Likely duplicate</AlertDialogTitle>
              <AlertDialogDescription>
                A client with this {matches.find(m => m.reasons.includes('email')) ? 'email' : 'phone number'} already exists. Add a duplicate record anyway?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { void actuallyAdd(); }}>
                Add Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

export default AddClientModal;
