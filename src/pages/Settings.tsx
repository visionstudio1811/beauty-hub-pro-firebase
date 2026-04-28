
import React from 'react';
import { useSearchParams } from 'react-router-dom';
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
  FileText
} from 'lucide-react';

// Import components with named exports
import { UserManagement } from '@/components/UserManagement';
import { PackageManagement } from '@/components/PackageManagement';
import { TreatmentManagement } from '@/components/TreatmentManagement';
import { SchedulingConfiguration } from '@/components/SchedulingConfiguration';
import { BusinessHours } from '@/components/BusinessHours';
import { BusinessInfoEditor } from '@/components/BusinessInfoEditor';
import { DropdownDataManagement } from '@/components/DropdownDataManagement';
import EnhancedProductManagement from '@/components/EnhancedProductManagement';
import { ProductCategoryManagement } from '@/components/ProductCategoryManagement';
import { AcuityIntegration } from '@/components/AcuityIntegration';
import { LogoManagement } from '@/components/LogoManagement';
import { WaiverTemplateEditor } from '@/components/waivers/WaiverTemplateEditor';
import { InvoiceSettingsEditor } from '@/components/InvoiceSettingsEditor';
import { InvoiceHistoryViewer } from '@/components/InvoiceHistoryViewer';


const Settings = () => {
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
                  General Settings
                </CardTitle>
                <CardDescription>
                  Manage your application's general settings and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessInfoEditor />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Brand Logo</CardTitle>
                <CardDescription>
                  Upload your business logo — it appears in the sidebar and as the browser tab icon
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LogoManagement />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dropdown Data Management</CardTitle>
                <CardDescription>
                  Manage dropdown options for forms and selections
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
                User Management
              </CardTitle>
              <CardDescription>
                Manage user accounts, roles, and permissions
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
                Package Management
              </CardTitle>
              <CardDescription>
                Create and manage service packages for your clients
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
                Treatment Management
              </CardTitle>
              <CardDescription>
                Manage your available treatments and services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TreatmentManagement />
            </CardContent>
          </Card>
        );
      case 'products':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Product Management
              </CardTitle>
              <CardDescription>
                Manage your products and retail inventory
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
                Product Categories
              </CardTitle>
              <CardDescription>
                Manage product categories for better organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProductCategoryManagement />
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
                  Scheduling Configuration
                </CardTitle>
                <CardDescription>
                  Configure your appointment scheduling settings and availability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SchedulingConfiguration />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>
                  Set your operating hours for each day of the week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BusinessHours />
              </CardContent>
            </Card>
          </div>
        );
      case 'waivers':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                Waiver Templates
              </CardTitle>
              <CardDescription>
                Create and manage consent waiver forms to send to clients before their appointments
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
                Intake Form Templates
              </CardTitle>
              <CardDescription>
                Create and manage new-client intake forms — collect medical history, contact info, photos, etc.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WaiverTemplateEditor kind="intake" />
            </CardContent>
          </Card>
        );
      case 'invoice-settings':
        return <InvoiceSettingsEditor />;
      case 'invoice-history':
        return <InvoiceHistoryViewer />;
      case 'acuity':
        return <AcuityIntegration />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-none mx-auto px-2 sm:px-4 lg:px-6">
      <div className="space-y-6 w-full overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">
            Manage your application settings and preferences
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
