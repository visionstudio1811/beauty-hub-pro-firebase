
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Settings, 
  Users, 
  Package, 
  Calendar, 
  Clock, 
  Building, 
  ShoppingBag,
  Tag
} from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface MobileSettingsTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const MobileSettingsTabs: React.FC<MobileSettingsTabsProps> = ({
  tabs,
  activeTab,
  onTabChange
}) => {
  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const ActiveIcon = activeTabData?.icon || Settings;

  return (
    <div className="w-full mb-6">
      <Select value={activeTab} onValueChange={onTabChange}>
        <SelectTrigger className="w-full h-12">
          <SelectValue>
            <div className="flex items-center space-x-2">
              <ActiveIcon className="h-4 w-4" />
              <span>{activeTabData?.label || 'Select Section'}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <SelectItem key={tab.id} value={tab.id}>
                <div className="flex items-center space-x-2">
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
};
