import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react';
import { CountryData, formatToE164 } from '@/lib/countryData';
import { useAuth } from '@/contexts/AuthContext';

export default function Auth() {
  const [authData, setAuthData] = useState({
    phoneNumber: '',
    countryCode: '+972',
    otp: '',
    email: '',
    password: '',
    fullName: '',
    step: 'phone' as 'phone' | 'otp' | 'credentials',
    isSignUp: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePhoneChange = (value: string, countryCode: string, isValid: boolean) => {
    setAuthData(prev => ({ ...prev, phoneNumber: value, countryCode }));
    setIsPhoneValid(isValid);
  };

  const handleCountryChange = (country: CountryData) => {
    setAuthData(prev => ({ ...prev, countryCode: country.code }));
  };

  const handleOtpChange = (value: string) => {
    setAuthData(prev => ({ ...prev, otp: value }));
  };

  const handleSendOtp = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();

    if (!authData.phoneNumber || !isPhoneValid) {
      toast({
        title: 'Missing information',
        description: 'Please enter a valid phone number',
        variant: 'destructive',
      });
      return;
    }

    setAuthData(prev => ({ ...prev, isSignUp }));
    setIsLoading(true);

    try {
      const sendVerification = httpsCallable(functions, 'sendVerification');
      const result = await sendVerification({
        phoneNumber: authData.phoneNumber,
        countryCode: authData.countryCode,
        isSignUp,
      });

      const data = result.data as any;

      if (data?.error || !data?.success) {
        console.log('Error from cloud function:', data);
        if (data?.code === 'PHONE_EXISTS') {
          toast({
            title: 'Phone number already registered',
            description: 'This phone number is already registered. Please switch to Sign In.',
            variant: 'destructive',
          });
        } else if (data?.code === 'PHONE_NOT_FOUND') {
          toast({
            title: 'Phone number not found',
            description: "This phone number doesn't match any account in our system. Please switch to Sign Up.",
            variant: 'destructive',
          });
        } else if (data?.code === 'INVALID_PHONE_FORMAT') {
          toast({
            title: 'Invalid phone number format',
            description: 'Please check your phone number format and try again.',
            variant: 'destructive',
          });
        } else if (data?.code === 'INVALID_PHONE_NUMBER') {
          toast({
            title: 'Invalid phone number',
            description: 'This phone number is not valid. Please enter a correct phone number.',
            variant: 'destructive',
          });
        } else if (data?.code === 'PHONE_UNSUBSCRIBED') {
          toast({
            title: 'Phone number unavailable',
            description: 'This phone number has opted out of SMS messages.',
            variant: 'destructive',
          });
        } else {
          const errorMessage =
            data?.error || 'Unable to process phone number. Please check your number and try again.';
          toast({ title: 'Phone verification failed', description: errorMessage, variant: 'destructive' });
        }
        return;
      }

      toast({ title: 'Code sent!', description: 'Please check your phone for the verification code.' });
      setAuthData(prev => ({ ...prev, step: 'otp' }));
    } catch (error: any) {
      console.error('Error calling sendVerification function:', error);
      toast({
        title: 'Phone verification failed',
        description: 'Unable to verify phone number. Please check your number and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authData.otp || authData.otp.length !== 6) {
      toast({
        title: 'Invalid code',
        description: 'Please enter a valid 6-digit verification code',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const verifyOtp = httpsCallable(functions, 'verifyOtp');
      const result = await verifyOtp({
        phoneNumber: authData.phoneNumber,
        code: authData.otp,
        isSignUp: authData.isSignUp,
      });

      const data = result.data as any;

      if (!data?.success || !data?.customToken) {
        toast({
          title: 'Verification failed',
          description: data?.error || 'Invalid verification code. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Sign in with the custom token from Cloud Function
      await signInWithCustomToken(auth, data.customToken);

      if (authData.isSignUp) {
        // Move to credentials step for new users to complete sign-up
        setAuthData(prev => ({ ...prev, step: 'credentials' }));
        toast({ title: 'Phone verified!', description: 'Please complete your account setup.' });
      } else {
        toast({ title: 'Welcome back!', description: 'You have been signed in successfully.' });
        navigate('/');
      }
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      toast({
        title: 'Verification failed',
        description: error.message || 'Unable to verify your code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authData.email || !authData.password) {
      toast({
        title: 'Missing information',
        description: 'Please enter your email and password',
        variant: 'destructive',
      });
      return;
    }

    if (authData.isSignUp && !authData.fullName) {
      toast({
        title: 'Missing information',
        description: 'Please enter your full name',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      // Save user profile to Firestore
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          email: authData.email,
          phone: authData.phoneNumber,
          fullName: authData.fullName,
          role: 'staff',
          organizationId: null,
          organizationRole: null,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast({ title: 'Account created!', description: 'Your account has been set up successfully.' });
      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Setup failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    try {
      const sendVerification = httpsCallable(functions, 'sendVerification');
      const result = await sendVerification({
        phoneNumber: authData.phoneNumber,
        countryCode: authData.countryCode,
        isSignUp: authData.isSignUp,
      });

      const data = result.data as any;
      if (data?.error) {
        toast({ title: 'Failed to resend code', description: data.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Code resent!', description: 'A new verification code has been sent to your phone.' });
    } catch (error: any) {
      toast({
        title: 'Failed to resend code',
        description: error.message || 'Unable to resend verification code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetToPhone = () => {
    setAuthData(prev => ({ ...prev, step: 'phone', otp: '', email: '', password: '', fullName: '' }));
  };

  const renderPhoneStep = (isSignUp: boolean) => (
    <form onSubmit={(e) => handleSendOtp(e, isSignUp)} className="space-y-4">
      <div className="text-center space-y-2 mb-4">
        <h3 className="text-lg font-semibold">{isSignUp ? 'Sign Up' : 'Sign In'}</h3>
        <p className="text-sm text-muted-foreground">
          Enter your phone number to receive a verification code
        </p>
      </div>
      <div className="space-y-2">
        <div className="relative">
          <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <PhoneInput
            value={authData.phoneNumber}
            onChange={handlePhoneChange}
            onCountryChange={handleCountryChange}
            className="pl-10"
            required
          />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sending code...' : 'Send Verification Code'}
      </Button>
    </form>
  );

  const renderOtpStep = () => (
    <form onSubmit={handleVerifyOtp} className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Enter Verification Code</h3>
        <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to</p>
        <p className="font-medium text-foreground">{authData.phoneNumber}</p>
      </div>
      <div className="flex justify-center">
        <InputOTP maxLength={6} value={authData.otp} onChange={handleOtpChange}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || authData.otp.length !== 6}>
        {isLoading ? 'Verifying...' : 'Verify Code'}
      </Button>
      <div className="text-center space-y-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleResendOtp} disabled={isLoading}>
          Resend Code
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resetToPhone}>
          Change Phone Number
        </Button>
      </div>
    </form>
  );

  const renderCredentialsStep = (isSignUp: boolean) => (
    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
      <div className="text-center space-y-2 mb-4">
        <h3 className="text-lg font-semibold">{isSignUp ? 'Complete Sign Up' : 'Sign In'}</h3>
        <p className="text-sm text-muted-foreground">Phone verified for {authData.phoneNumber}</p>
      </div>

      {isSignUp && (
        <div className="space-y-2">
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              name="fullName"
              placeholder="Full name"
              value={authData.fullName}
              onChange={handleInputChange}
              className="pl-10"
              required
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            name="email"
            placeholder="Email"
            value={authData.email}
            onChange={handleInputChange}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type={showPassword ? 'text' : 'password'}
            name="password"
            placeholder="Password"
            value={authData.password}
            onChange={handleInputChange}
            className="pl-10 pr-10"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
      </Button>

      <Button type="button" variant="ghost" size="sm" onClick={resetToPhone} className="w-full">
        Start Over
      </Button>
    </form>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-2xl">B</span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold text-foreground">BeautyHub Pro</CardTitle>
            <p className="text-sm text-muted-foreground">Professional beauty business management</p>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              {authData.step === 'phone' && renderPhoneStep(false)}
              {authData.step === 'otp' && renderOtpStep()}
              {authData.step === 'credentials' && renderCredentialsStep(false)}
            </TabsContent>

            <TabsContent value="signup">
              {authData.step === 'phone' && renderPhoneStep(true)}
              {authData.step === 'otp' && renderOtpStep()}
              {authData.step === 'credentials' && renderCredentialsStep(true)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
