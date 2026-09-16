import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LegalPageLayout,
  LegalList,
  LegalParagraph,
  LegalText,
} from '@/components/public-site/LegalPageLayout';

const LAST_UPDATED = new Date(2026, 5, 6); // June 6, 2026

const SmsTerms: React.FC = () => {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout
      title={t('sms.title')}
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          <LegalText k="sms.intro" />
        </p>
      }
    >
      <h2>{t('sms.s1.h')}</h2>
      <LegalParagraph k="sms.s1.p" />

      <h2>{t('sms.s2.h')}</h2>
      <LegalParagraph k="sms.s2.p1" />
      <LegalParagraph k="sms.s2.p2" />

      <h2>{t('sms.s3.h')}</h2>
      <LegalParagraph k="sms.s3.p" />
      <LegalList k="sms.s3.items" />

      <h2>{t('sms.s4.h')}</h2>
      <LegalParagraph k="sms.s4.p" />

      <h2>{t('sms.s5.h')}</h2>
      <LegalParagraph k="sms.s5.p1" />
      <LegalList k="sms.s5.items" />
      <LegalParagraph k="sms.s5.p2" />

      <h2>{t('sms.s6.h')}</h2>
      <LegalParagraph k="sms.s6.p" />

      <h2>{t('sms.s7.h')}</h2>
      <LegalParagraph k="sms.s7.p" />

      <h2>{t('sms.s8.h')}</h2>
      <LegalParagraph k="sms.s8.p" />

      <h2>{t('sms.s9.h')}</h2>
      <LegalParagraph k="sms.s9.p1" />
      <LegalList k="sms.s9.items" />
      <LegalParagraph k="sms.s9.p2" />

      <h2>{t('sms.s10.h')}</h2>
      <LegalParagraph k="sms.s10.p" />

      <h2>{t('sms.s11.h')}</h2>
      <LegalParagraph k="sms.s11.p" />

      <h2>{t('sms.s12.h')}</h2>
      <LegalList k="sms.s12.items" />
    </LegalPageLayout>
  );
};

export default SmsTerms;
