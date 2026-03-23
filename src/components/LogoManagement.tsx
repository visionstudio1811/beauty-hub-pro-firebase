
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, Image, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/** Renders a data-URL image into a 64×64 canvas and sets it as the page favicon. */
export const applyFavicon = (dataUrl: string) => {
  const img = new window.Image();
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
  img.src = dataUrl;
};

/** Restores the default favicon by removing the dynamic <link> element. */
const resetFavicon = () => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = '/favicon.ico';
};

export const LogoManagement: React.FC = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (PNG, JPG, SVG).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setLogoUrl(result);
      localStorage.setItem('lumiere-logo', result);
      applyFavicon(result);
      window.dispatchEvent(new Event('storage'));
      toast({
        title: "Logo updated",
        description: "Your logo has been updated and the browser tab icon has changed.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileSelect(files[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    localStorage.removeItem('lumiere-logo');
    resetFavicon();
    window.dispatchEvent(new Event('storage'));
    toast({
      title: "Logo removed",
      description: "Your logo has been removed.",
    });
  };

  React.useEffect(() => {
    const savedLogo = localStorage.getItem('lumiere-logo');
    if (savedLogo) setLogoUrl(savedLogo);
  }, []);

  return (
    <div className="space-y-4">
      {logoUrl ? (
        <>
          <div>
            <Label>Current Logo</Label>
            <div className="mt-2 p-4 border rounded-lg bg-muted/40 flex items-center gap-4">
              <img
                src={logoUrl}
                alt="Business Logo"
                className="max-h-16 max-w-[180px] object-contain"
              />
              <p className="text-xs text-muted-foreground">
                This image is also used as the browser tab icon.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleUploadClick} variant="outline" className="flex-1">
              <Upload className="h-4 w-4 mr-2" />
              Change Logo
            </Button>
            <Button onClick={handleRemoveLogo} variant="outline" className="flex-1 text-destructive hover:text-destructive">
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
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleUploadClick}
          >
            <Image className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-foreground font-medium mb-1">
              Drag and drop your logo here
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              The logo will also be used as the browser tab icon.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleUploadClick(); }}>
              Browse Files
            </Button>
            <p className="text-xs text-muted-foreground mt-3">PNG, JPG, SVG up to 5MB</p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
};
