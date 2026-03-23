
import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useClients } from '@/hooks/useClients';
import { useSupabaseAppointments } from '@/hooks/useSupabaseAppointments';
import { useTreatments } from '@/contexts/TreatmentContext';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  type: 'client' | 'appointment' | 'treatment';
  id: string;
  name: string;
  subtitle?: string;
}

export function SidebarSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const { state } = useSidebar();
  const navigate = useNavigate();
  
  const { clients } = useClients();
  const { appointments } = useSupabaseAppointments();
  const { treatments } = useTreatments();
  
  const isCollapsed = state === 'collapsed';

  const searchResults = useMemo(() => {
    if (!value.trim()) return [];

    const results: SearchResult[] = [];
    const searchTerm = value.toLowerCase();

    // Search clients
    clients.forEach(client => {
      if (client.name.toLowerCase().includes(searchTerm) || 
          client.email.toLowerCase().includes(searchTerm) ||
          client.phone.includes(searchTerm)) {
        results.push({
          type: 'client',
          id: client.id.toString(),
          name: client.name,
          subtitle: client.email
        });
      }
    });

    // Search appointments (using Supabase appointments)
    appointments.forEach(appointment => {
      if (appointment.client_name.toLowerCase().includes(searchTerm) ||
          appointment.treatment_name.toLowerCase().includes(searchTerm)) {
        results.push({
          type: 'appointment',
          id: appointment.id,
          name: `${appointment.treatment_name} - ${appointment.client_name}`,
          subtitle: `${appointment.appointment_date} at ${appointment.appointment_time}`
        });
      }
    });

    // Search treatments
    treatments.forEach(treatment => {
      if (treatment.name.toLowerCase().includes(searchTerm) ||
          treatment.description.toLowerCase().includes(searchTerm)) {
        results.push({
          type: 'treatment',
          id: treatment.id,
          name: treatment.name,
          subtitle: `$${treatment.price} - ${treatment.duration}min`
        });
      }
    });

    return results.slice(0, 20);
  }, [value, clients, appointments, treatments]);

  const handleItemSelect = (item: SearchResult) => {
    setOpen(false);
    setValue('');
    
    switch (item.type) {
      case 'client':
        navigate('/clients');
        break;
      case 'appointment':
        navigate('/appointments');
        break;
      case 'treatment':
        navigate('/settings');
        break;
    }
  };

  if (isCollapsed) {
    return (
      <div className="px-3 py-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-14 h-14 hover:bg-muted/60 transition-colors duration-200 rounded-xl mx-auto"
            >
              <Search className="h-6 w-6" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" side="right" align="start">
            <Command>
              <CommandInput 
                placeholder="Search clients, appointments..." 
                value={value}
                onValueChange={setValue}
              />
              <CommandList>
                {searchResults.length === 0 && value.trim() && (
                  <CommandEmpty>No results found.</CommandEmpty>
                )}
                {searchResults.length > 0 && (
                  <>
                    {searchResults.filter(item => item.type === 'client').length > 0 && (
                      <CommandGroup heading="Clients">
                        {searchResults.filter(item => item.type === 'client').map((item) => (
                          <CommandItem 
                            key={`client-${item.id}`}
                            onSelect={() => handleItemSelect(item)}
                            className="cursor-pointer p-3"
                          >
                            <div>
                              <div className="font-medium">{item.name}</div>
                              {item.subtitle && (
                                <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {searchResults.filter(item => item.type === 'appointment').length > 0 && (
                      <CommandGroup heading="Appointments">
                        {searchResults.filter(item => item.type === 'appointment').map((item) => (
                          <CommandItem 
                            key={`appointment-${item.id}`}
                            onSelect={() => handleItemSelect(item)}
                            className="cursor-pointer p-3"
                          >
                            <div>
                              <div className="font-medium">{item.name}</div>
                              {item.subtitle && (
                                <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {searchResults.filter(item => item.type === 'treatment').length > 0 && (
                      <CommandGroup heading="Treatments">
                        {searchResults.filter(item => item.type === 'treatment').map((item) => (
                          <CommandItem 
                            key={`treatment-${item.id}`}
                            onSelect={() => handleItemSelect(item)}
                            className="cursor-pointer p-3"
                          >
                            <div>
                              <div className="font-medium">{item.name}</div>
                              {item.subtitle && (
                                <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-12 pr-4 py-3 text-sm bg-muted/40 border border-border/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600/50 transition-all duration-200"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setOpen(true)}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" side="bottom" align="start">
          <Command>
            <CommandInput 
              placeholder="Search clients, appointments..." 
              value={value} 
              onValueChange={setValue} 
            />
            <CommandList>
              {searchResults.length === 0 && value.trim() && (
                <CommandEmpty>No results found.</CommandEmpty>
              )}
              {searchResults.length > 0 && (
                <>
                  {searchResults.filter(item => item.type === 'client').length > 0 && (
                    <CommandGroup heading="Clients">
                      {searchResults.filter(item => item.type === 'client').map((item) => (
                        <CommandItem 
                          key={`client-${item.id}`}
                          onSelect={() => handleItemSelect(item)}
                          className="cursor-pointer p-3"
                        >
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.subtitle && (
                              <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.filter(item => item.type === 'appointment').length > 0 && (
                    <CommandGroup heading="Appointments">
                      {searchResults.filter(item => item.type === 'appointment').map((item) => (
                        <CommandItem 
                          key={`appointment-${item.id}`}
                          onSelect={() => handleItemSelect(item)}
                          className="cursor-pointer p-3"
                        >
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.subtitle && (
                              <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.filter(item => item.type === 'treatment').length > 0 && (
                    <CommandGroup heading="Treatments">
                      {searchResults.filter(item => item.type === 'treatment').map((item) => (
                        <CommandItem 
                          key={`treatment-${item.id}`}
                          onSelect={() => handleItemSelect(item)}
                          className="cursor-pointer p-3"
                        >
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.subtitle && (
                              <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
