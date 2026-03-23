export interface CountryData {
  name: string;
  code: string;
  flag: string;
  pattern: string;
  maxLength: number;
}

export const countries: CountryData[] = [
  {
    name: "Israel",
    code: "+972",
    flag: "🇮🇱",
    pattern: "## ###-####",
    maxLength: 9
  },
  {
    name: "United States",
    code: "+1",
    flag: "🇺🇸", 
    pattern: "(###) ###-####",
    maxLength: 10
  },
  {
    name: "Canada",
    code: "+1",
    flag: "🇨🇦",
    pattern: "(###) ###-####", 
    maxLength: 10
  },
  {
    name: "United Kingdom",
    code: "+44",
    flag: "🇬🇧",
    pattern: "#### ### ####",
    maxLength: 10
  },
  {
    name: "Germany",
    code: "+49",
    flag: "🇩🇪",
    pattern: "### ### ####",
    maxLength: 11
  },
  {
    name: "France",
    code: "+33",
    flag: "🇫🇷",
    pattern: "# ## ## ## ##",
    maxLength: 9
  },
  {
    name: "Australia",
    code: "+61",
    flag: "🇦🇺",
    pattern: "### ### ###",
    maxLength: 9
  },
  {
    name: "Japan",
    code: "+81",
    flag: "🇯🇵",
    pattern: "##-####-####",
    maxLength: 10
  },
  {
    name: "South Korea",
    code: "+82",
    flag: "🇰🇷",
    pattern: "##-####-####",
    maxLength: 10
  },
  {
    name: "China",
    code: "+86",
    flag: "🇨🇳",
    pattern: "### #### ####",
    maxLength: 11
  }
];

export const formatPhoneNumber = (phoneNumber: string, pattern: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  let formatted = '';
  let digitIndex = 0;
  
  for (let i = 0; i < pattern.length && digitIndex < cleaned.length; i++) {
    if (pattern[i] === '#') {
      formatted += cleaned[digitIndex];
      digitIndex++;
    } else {
      formatted += pattern[i];
    }
  }
  
  return formatted;
};

export const validatePhoneNumber = (phoneNumber: string, country: CountryData): boolean => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  return cleaned.length === country.maxLength;
};

export const formatToE164 = (phoneNumber: string, countryCode: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  return `${countryCode}${cleaned}`;
};