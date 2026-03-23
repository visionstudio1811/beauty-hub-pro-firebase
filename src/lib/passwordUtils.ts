
interface PasswordOptions {
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  excludeSimilar: boolean;
}

export const generateSecurePassword = (options: PasswordOptions): string => {
  const {
    length,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
    excludeSimilar
  } = options;

  let charset = '';
  let requiredChars = '';

  const uppercase = excludeSimilar ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
  const numbers = excludeSimilar ? '23456789' : '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (includeUppercase) {
    charset += uppercase;
    requiredChars += getRandomChar(uppercase);
  }
  if (includeLowercase) {
    charset += lowercase;
    requiredChars += getRandomChar(lowercase);
  }
  if (includeNumbers) {
    charset += numbers;
    requiredChars += getRandomChar(numbers);
  }
  if (includeSymbols) {
    charset += symbols;
    requiredChars += getRandomChar(symbols);
  }

  if (charset === '') {
    throw new Error('At least one character type must be selected');
  }

  // Generate the remaining characters
  const remainingLength = length - requiredChars.length;
  let password = requiredChars;

  for (let i = 0; i < remainingLength; i++) {
    password += getRandomChar(charset);
  }

  // Shuffle the password to avoid predictable patterns
  return shuffleString(password);
};

const getRandomChar = (str: string): string => {
  // Use crypto.getRandomValues for cryptographically secure randomness
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return str[array[0] % str.length];
};

const shuffleString = (str: string): string => {
  const array = str.split('');
  for (let i = array.length - 1; i > 0; i--) {
    const randomValues = new Uint32Array(1);
    crypto.getRandomValues(randomValues);
    const j = randomValues[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array.join('');
};
