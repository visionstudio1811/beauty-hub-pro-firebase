
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseTreatments, Treatment } from '@/hooks/useSupabaseTreatments';

export const TreatmentManagement: React.FC = () => {
  const { treatments, loading, addTreatment, updateTreatment } = useSupabaseTreatments();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    duration: '',
    description: '',
    category: '',
  });
  const { toast } = useToast();

  const resetForm = () => {
    setFormData({ name: '', price: '', duration: '', description: '', category: '' });
    setEditingTreatment(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (treatment: Treatment) => {
    setEditingTreatment(treatment);
    setFormData({
      name: treatment.name,
      price: treatment.price?.toString() || '',
      duration: treatment.duration.toString(),
      description: treatment.description || '',
      category: treatment.category || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.duration) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const treatmentData = {
        name: formData.name,
        price: formData.price ? parseFloat(formData.price) : undefined,
        duration: parseInt(formData.duration),
        description: formData.description || undefined,
        category: formData.category || undefined,
        is_active: true,
      };

      if (editingTreatment) {
        await updateTreatment(editingTreatment.id, treatmentData);
      } else {
        await addTreatment(treatmentData);
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving treatment:', error);
    }
  };

  const handleDelete = async (treatmentId: string) => {
    try {
      await updateTreatment(treatmentId, { is_active: false });
    } catch (error) {
      console.error('Error deleting treatment:', error);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-sm text-gray-500">Loading treatments...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col space-y-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Settings className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-lg truncate">Services & Treatments</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAddDialog} className="w-full sm:w-auto shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                Add Treatment
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md mx-auto max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingTreatment ? 'Edit Treatment' : 'Add New Treatment'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingTreatment 
                    ? 'Update the treatment details below.'
                    : 'Create a new treatment with pricing and duration.'
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-sm">Treatment Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter treatment name"
                    className="w-full text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="price" className="text-sm">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0"
                      className="w-full text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration" className="text-sm">Duration (min) *</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      placeholder="60"
                      className="w-full text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category" className="text-sm">Category</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Facial, Massage"
                    className="w-full text-sm"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-sm">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the treatment"
                    rows={3}
                    className="w-full resize-none text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto text-sm">
                  Cancel
                </Button>
                <Button onClick={handleSave} className="w-full sm:w-auto text-sm">
                  {editingTreatment ? 'Update' : 'Add'} Treatment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription className="text-sm">
          Manage your treatment services, pricing, and duration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {treatments.map((treatment) => (
            <div key={treatment.id} className="p-3 border rounded-lg space-y-3">
              <div className="space-y-2">
                <h4 className="font-medium text-sm break-words">{treatment.name}</h4>
                <div className="flex flex-wrap gap-1">
                  {treatment.price && <Badge variant="secondary" className="text-xs">${treatment.price}</Badge>}
                  <Badge variant="outline" className="text-xs">{treatment.duration} min</Badge>
                  {treatment.category && <Badge variant="outline" className="text-xs">{treatment.category}</Badge>}
                </div>
                {treatment.description && (
                  <p className="text-xs text-muted-foreground break-words">{treatment.description}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(treatment)}
                    className="flex-1 text-xs h-8"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(treatment.id)}
                    className="flex-1 text-red-600 hover:text-red-700 text-xs h-8"
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
