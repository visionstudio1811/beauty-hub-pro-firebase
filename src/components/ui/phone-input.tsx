
import React, { forwardRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countries, CountryData, formatPhoneNumber, validatePhoneNumber, formatToE164 } from '@/lib/countryData';

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, 'onChange'> {
  onChange?: (value: string, countryCode: string, isValid: boolean) => void;
  onCountryChange?: (country: CountryData) => void;
  defaultCountry?: CountryData;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, onChange, onCountryChange, defaultCountry, value, ...props }, ref) => {
    const [selectedCountry, setSelectedCountry] = useState<CountryData>(
      defaultCountry || countries.find(c => c.code === "+972") || countries[0]
    );
    const [open, setOpen] = useState(false);

    const handleCountrySelect = (country: CountryData) => {
      setSelectedCountry(country);
      setOpen(false);
      onCountryChange?.(country);
      
      // Clear the phone input when country changes
      if (onChange) {
        onChange("", country.code, false);
      }
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const formatted = formatPhoneNumber(inputValue, selectedCountry.pattern);
      const isValid = validatePhoneNumber(formatted, selectedCountry);
      
      onChange?.(formatted, selectedCountry.code, isValid);
    };

    return (
      <div className="flex">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[120px] justify-between rounded-r-none border-r-0"
            >
              <span className="flex items-center gap-2">
                <span>{selectedCountry.flag}</span>
                <span className="text-sm">{selectedCountry.code}</span>
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0">
            <Command>
              <CommandInput placeholder="Search country..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {countries.map((country) => (
                    <CommandItem
                      key={country.code + country.name}
                      value={country.name}
                      onSelect={() => handleCountrySelect(country)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedCountry.code === country.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex items-center gap-2">
                        <span>{country.flag}</span>
                        <span>{country.name}</span>
                        <span className="text-muted-foreground">({country.code})</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          ref={ref}
          className={cn("rounded-l-none", className)}
          value={value}
          onChange={handlePhoneChange}
          placeholder={selectedCountry.pattern.replace(/#/g, "0")}
          maxLength={selectedCountry.pattern.length}
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
