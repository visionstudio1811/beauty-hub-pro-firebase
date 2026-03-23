import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import AddClientModal from '@/components/AddClientModal';
import { useClients, Client } from '@/hooks/useClients';
import { ClientPackage } from '@/hooks/useClientPackages';
import { Calendar as CalendarIcon, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppointmentForm } from '@/hooks/useAppointmentForm';
import { useSupabaseAppointments } from '@/hooks/useSupabaseAppointments';
import { ClientSection } from '@/components/appointment-form/ClientSection';
import { PackageSection } from '@/components/appointment-form/PackageSection';
import { AppointmentDetailsSection } from '@/components/appointment-form/AppointmentDetailsSection';


interface Appointment {
  id: string;
  time: string;
  date: string;
  client: string;
  treatment: string;
  staff: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  phone: string;
  email: string;
  notes: string;
  allergies?: string;
}

interface AppointmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
  clientName?: string;
  editAppointment?: Appointment | null;
}

export const AppointmentFormModal: React.FC<AppointmentFormModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  editAppointment
}) => {
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  
  const { toast } = useToast();
  const { addClient } = useClients();
  const { } = useSupabaseAppointments();

  const {
    formData,
    setFormData,
    selectedDate,
    setSelectedDate,
    selectedClient,
    setSelectedClient,
    selectedPackage,
    setSelectedPackage,
    selectedTreatment,
    availableTreatments,
    availableTimeSlots,
    staffProfiles,
    clientPackages,
    addAppointment,
    refreshPackages,
    getNextAvailableRoomId,
    validateAppointmentBooking,
    loading,
    selectedDateString
  } = useAppointmentForm(clientId, clientName);

  const handleClientSelect = (client: Client | null) => {
    setSelectedClient(client);
    setSelectedPackage(null);
    if (client) {
      setFormData({
        ...formData,
        clientName: client.name,
        clientPhone: client.phone,
        clientEmail: client.email || '',
        treatmentId: '',
        time: ''
      });
    } else {
      setFormData({
        ...formData,
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        treatmentId: '',
        time: ''
      });
    }
  };

  const handleCreateNewClient = () => {
    setIsAddClientModalOpen(true);
  };

  const handleAddNewClient = async (newClient: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
    const addedClient = await addClient(newClient);
    setSelectedClient(addedClient);
    setFormData({
      ...formData,
      clientName: addedClient.name,
      clientPhone: addedClient.phone,
      clientEmail: addedClient.email || ''
    });
  };

  const handlePackageSelect = (packageItem: ClientPackage | null) => {
    setSelectedPackage(packageItem);
    setFormData({
      ...formData,
      treatmentId: '',
      time: ''
    });
  };

  const handleTimeChange = (value: string) => {
    const nextRoomId = getNextAvailableRoomId(value);
    setFormData({...formData, time: value, roomId: nextRoomId});
  };

  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setFormData({...formData, time: ''});
    }
  };

  const handleFormDataChange = (updates: Partial<typeof formData>) => {
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate basic form fields
    if (!formData.clientName || !formData.clientPhone) {
      toast({
        title: "Validation Error",
        description: "Please fill in client name and phone number",
        variant: "destructive"
      });
      return;
    }

    // Validate appointment booking availability
    const validationError = validateAppointmentBooking();
    if (validationError) {
      toast({
        title: "Booking Error",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    if (!selectedTreatment) {
      toast({
        title: "Error",
        description: "Please select a treatment",
        variant: "destructive"
      });
      return;
    }

    // Validate staff selection
    if (!formData.staffId) {
      toast({
        title: "Error",
        description: "Please select a staff member",
        variant: "destructive"
      });
      return;
    }

    const selectedStaff = staffProfiles.find(s => s.id === formData.staffId);
    if (!selectedStaff) {
      toast({
        title: "Error",
        description: "Selected staff member not found. Please try selecting again.",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('Submitting appointment with data:', {
        client_id: selectedClient?.id || null,
        staff_id: formData.staffId || null,
        treatment_id: formData.treatmentId || null,
        package_id: selectedPackage?.package_id || null,
      });

      // Create appointment
      await addAppointment({
        client_id: selectedClient?.id || null,
        client_name: formData.clientName,
        client_phone: formData.clientPhone,
        client_email: formData.clientEmail,
        appointment_date: selectedDateString,
        appointment_time: formData.time,
        treatment_id: formData.treatmentId || null,
        treatment_name: selectedTreatment.name,
        staff_id: formData.staffId || null,
        staff_name: selectedStaff.full_name || selectedStaff.email,
        duration: selectedTreatment.duration,
        status: 'scheduled',
        notes: formData.notes,
        room_id: formData.roomId,
        package_id: selectedPackage?.package_id || null,
        purchase_id: selectedPackage?.id || undefined,
        session_used: false
      });

      // Refresh package data after successful appointment creation
      if (selectedPackage && selectedClient) {
        refreshPackages();
      }

      onClose();
      setFormData({
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        time: '',
        treatmentId: '',
        staffId: '',
        notes: '',
        roomId: ''
      });
      setSelectedClient(null);
      setSelectedPackage(null);
      setSelectedDate(new Date());
    } catch (error) {
      console.error('Error creating appointment:', error);
      toast({
        title: "Error",
        description: editAppointment ? "Failed to update appointment. Please try again." : "Failed to create appointment. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              {editAppointment ? 'Edit Appointment' : 'New Appointment'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <ClientSection
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onClientSelect={handleClientSelect}
              onCreateNewClient={handleCreateNewClient}
            />

            <PackageSection
              selectedClient={selectedClient}
              clientPackages={clientPackages}
              selectedPackage={selectedPackage}
              onSelectPackage={handlePackageSelect}
              loading={loading.packages}
            />

            <AppointmentDetailsSection
              selectedDate={selectedDate}
              onDateChange={handleDateChange}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              availableTreatments={availableTreatments}
              staffProfiles={staffProfiles}
              availableTimeSlots={availableTimeSlots}
              selectedPackage={selectedPackage}
              onTimeChange={handleTimeChange}
              loading={loading}
            />


            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-purple-600 hover:bg-purple-700"
                disabled={loading.staff || loading.treatments}
              >
                {editAppointment ? 'Update Appointment' : 'Book Appointment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onAdd={handleAddNewClient}
      />
    </>
  );
};
