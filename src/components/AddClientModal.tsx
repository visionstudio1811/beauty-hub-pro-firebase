
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useDropdownData } from '@/contexts/DropdownDataContext';
import { validateAndSanitize, clientSchema } from '@/lib/validation';
import { Client } from '@/hooks/useClients';
import { Plus } from 'lucide-react';

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => void;
}

const OTHER_VALUE = '__other__';

const AddClientModal = ({ isOpen, onClose, onAdd }: AddClientModalProps) => {
  const { toast } = useToast();
  const { dropdownData, addCity, addReferralSource } = useDropdownData();

  const [newCity, setNewCity] = useState('');
  const [showNewCity, setShowNewCity] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [showNewSource, setShowNewSource] = useState(false);

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
      handleClose();
    } catch (error) {
      console.error('Error adding client:', error);
    }
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

          <div>
            <Label htmlFor="allergies">Allergies</Label>
            <textarea
              id="allergies"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about the client..."
            />
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
      </DialogContent>
    </Dialog>
  );
};

export default AddClientModal;
