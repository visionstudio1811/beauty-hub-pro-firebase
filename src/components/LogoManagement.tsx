
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Image, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

/** Renders a data-URL or remote image URL into a 64×64 canvas and sets it as the page favicon. */
export const applyFavicon = (url: string) => {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 64, 64);
    const faviconUrl = canvas.toDataURL('image/png');
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = faviconUrl;
  };
  img.src = url;
};

const resetFavicon = () => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = '/favicon.ico';
};

export const LogoManagement: React.FC = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    const load = async () => {
      if (!currentOrganization?.id) return;
      try {
        const snap = await getDoc(doc(db, 'organizations', currentOrganization.id));
        const url = snap.data()?.logo_url ?? null;
        if (url) {
          setLogoUrl(url);
          applyFavicon(url);
        }
      } catch {
        // non-fatal
      }
    };
    load();
  }, [currentOrganization?.id]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image file (PNG, JPG, SVG).', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please select an image smaller than 5MB.', variant: 'destructive' });
      return;
    }
    if (!currentOrganization?.id) {
      toast({ title: 'No organization', description: 'Cannot save logo without an active organization.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const storageRef = ref(storage, `organizations/${currentOrganization.id}/logo/logo.${ext}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'organizations', currentOrganization.id), { logo_url: downloadUrl });

      setLogoUrl(downloadUrl);
      applyFavicon(downloadUrl);
      toast({ title: 'Logo updated', description: 'Your logo has been saved and will appear on all devices.' });
    } catch (error) {
      console.error('Logo upload error:', error);
      toast({ title: 'Upload failed', description: 'Could not save logo. Please try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!currentOrganization?.id) return;
    try {
      await updateDoc(doc(db, 'organizations', currentOrganization.id), { logo_url: null });
      setLogoUrl(null);
      resetFavicon();
      toast({ title: 'Logo removed', description: 'Your logo has been removed.' });
    } catch (error) {
      console.error('Logo remove error:', error);
      toast({ title: 'Failed to remove logo', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileSelect(files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  return (
    <div className="space-y-4">
      {logoUrl ? (
        <>
          <div>
            <Label>Current Logo</Label>
            <div className="mt-2 p-4 border rounded-lg bg-muted/40 flex items-center gap-4">
              <img src={logoUrl} alt="Business Logo" className="max-h-16 max-w-[180px] object-contain" />
              <p className="text-xs text-muted-foreground">This image is also used as the browser tab icon.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="flex-1" disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Change Logo
            </Button>
            <Button onClick={handleRemoveLogo} variant="outline" className="flex-1 text-destructive hover:text-destructive" disabled={uploading}>
              <X className="h-4 w-4 mr-2" />
              Remove Logo
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Label>Upload Logo</Label>
          <div
            className={`mt-2 border-2 border-dashed rounded-lg p-6 sm:p-10 text-center transition-colors cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-10 w-10 mx-auto text-muted-foreground mb-3 animate-spin" />
            ) : (
              <Image className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            )}
            <p className="text-sm text-foreground font-medium mb-1">
              {uploading ? 'Uploading...' : 'Drag and drop your logo here'}
            </p>
            <p className="text-xs text-muted-foreground mb-3">The logo will also be used as the browser tab icon.</p>
            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} disabled={uploading}>
              Browse Files
            </Button>
            <p className="text-xs text-muted-foreground mt-3">PNG, JPG, SVG up to 5MB</p>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
    </div>
  );
};
