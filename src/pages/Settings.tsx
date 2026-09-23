
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Settings as SettingsIcon,
  Users,
  Package,
  Calendar,
  Clock,
  ShoppingBag,
  Tag,
  RefreshCw,
  Zap,
  FileSignature,
  ClipboardList,
  Receipt,
  FileText,
  Sparkles,
  Palette,
} from 'lucide-react';

// Import components with named exports
import { UserManagement } from '@/components/UserManagement';
import { PackageManagement } from '@/components/PackageManagement';
import { TreatmentManagement } from '@/components/TreatmentManagement';
import { AddonManagement } from '@/components/AddonManagement';
import { SchedulingConfiguration } from '@/components/SchedulingConfiguration';
import { BusinessHours } from '@/components/BusinessHours';
import { StaffSchedulesSection } from '@/components/staff/StaffSchedulesSection';
import { SchedulerLinks } from '@/components/settings/SchedulerLinks';
import { BusinessInfoEditor } from '@/components/BusinessInfoEditor';
import { DropdownDataManagement } from '@/components/DropdownDataManagement';
import EnhancedProductManagement from '@/components/EnhancedProductManagement';
import { ProductCategoryManagement } from '@/components/ProductCategoryManagement';
import { ProductBrandManagement } from '@/components/ProductBrandManagement';
import { AcuityIntegration } from '@/components/AcuityIntegration';
import { LogoManagement } from '@/components/LogoManagement';
import { WaiverTemplateEditor } from '@/components/waivers/WaiverTemplateEditor';
import { InvoiceSettingsEditor } from '@/components/InvoiceSettingsEditor';
import { InvoiceHistoryViewer } from '@/components/InvoiceHistoryViewer';
import { LoginBrandingSettings } from '@/components/settings/LoginBrandingSettings';
import { PaymentIntegration } from '@/components/settings/PaymentIntegration';
import { ClubMembershipSettings } from '@/components/settings/ClubMembershipSettings';


const Settings = () => {
  const { t } = useTranslation('settings');
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('section') || 'general';

  const renderTabContent = (tabId: string) => {
    switch (tabId) {
      case 'general':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  {t('sections.general.title')}
                </CardTitle>
                <CardDescription>
                  {t('sections.general.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessInfoEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('sections.brandLogo.title')}</CardTitle>
                <CardDescription>
                  {t('sections.brandLogo.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LogoManagement />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('sections.dropdownData.title')}</CardTitle>
                <CardDescription>
                  {t('sections.dropdownData.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DropdownDataManagement />
              </CardContent>
            </Card>
          </div>
        );
      case 'users':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t('sections.users.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.users.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserManagement />
            </CardContent>
          </Card>
        );
      case 'packages':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t('sections.packages.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.packages.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PackageManagement />
            </CardContent>
          </Card>
        );
      case 'treatments':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('sections.treatments.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.treatments.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TreatmentManagement />
            </CardContent>
          </Card>
        );
      case 'addons':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t('sections.addons.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.addons.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddonManagement />
            </CardContent>
          </Card>
        );
      case 'products':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                {t('sections.products.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.products.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnhancedProductManagement />
            </CardContent>
          </Card>
        );
      case 'categories':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {t('sections.categories.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.categories.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProductCategoryManagement />
            </CardContent>
          </Card>
        );
      case 'brands':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {t('sections.brands.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.brands.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProductBrandManagement />
            </CardContent>
          </Card>
        );
      case 'scheduling':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('sections.scheduling.title')}
                </CardTitle>
                <CardDescription>
                  {t('sections.scheduling.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SchedulingConfiguration />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('sections.businessHours.title')}</CardTitle>
                <CardDescription>
                  {t('sections.businessHours.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessHours />
              </CardContent>
            </Card>
          </div>
        );
      case 'staff-schedules':
        return <StaffSchedulesSection />;
      case 'scheduler-links':
        return <SchedulerLinks />;
      case 'waivers':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                {t('sections.waivers.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.waivers.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaiverTemplateEditor kind="waiver" />
            </CardContent>
          </Card>
        );
      case 'intake':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                {t('sections.intake.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.intake.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaiverTemplateEditor kind="intake" />
            </CardContent>
          </Card>
        );
      case 'agreements':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                {t('sections.agreements.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.agreements.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaiverTemplateEditor kind="agreement" />
            </CardContent>
          </Card>
        );
      case 'invoice-settings':
        return <InvoiceSettingsEditor />;
      case 'invoice-history':
        return <InvoiceHistoryViewer />;
      case 'acuity':
        return <AcuityIntegration />;
      case 'payments':
        return <PaymentIntegration />;
      case 'club':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t('sections.club.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.club.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClubMembershipSettings />
            </CardContent>
          </Card>
        );
      case 'login-screen':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                {t('sections.loginBranding.title')}
              </CardTitle>
              <CardDescription>
                {t('sections.loginBranding.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginBrandingSettings />
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-none mx-auto px-2 sm:px-4 lg:px-6">
      <div className="space-y-6 w-full overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t('page.title')}</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">
            {t('page.subtitle')}
          </p>
        </div>
        <div className="w-full overflow-hidden">
          {renderTabContent(activeTab)}
        </div>
      </div>
    </div>
  );
};

export default Settings;
