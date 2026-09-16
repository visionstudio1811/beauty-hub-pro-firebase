import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LegalPageLayout,
  LegalList,
  LegalParagraph,
  LegalText,
} from '@/components/public-site/LegalPageLayout';

const LAST_UPDATED = new Date(2026, 5, 6); // June 6, 2026

const DataProcessingAddendum: React.FC = () => {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout
      title={t('dpa.title')}
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          <LegalText k="dpa.intro" />
        </p>
      }
    >
      <h2>{t('dpa.s1.h')}</h2>
      <LegalParagraph k="dpa.s1.p" />

      <h2>{t('dpa.s2.h')}</h2>
      <LegalParagraph k="dpa.s2.p" />

      <h2>{t('dpa.s3.h')}</h2>
      <LegalParagraph k="dpa.s3.p" />

      <h2>{t('dpa.s4.h')}</h2>
      <LegalParagraph k="dpa.s4.p" />

      <h2>{t('dpa.s5.h')}</h2>
      <LegalParagraph k="dpa.s5.p" />

      <h2>{t('dpa.s6.h')}</h2>
      <LegalParagraph k="dpa.s6.p" />

      <h2>{t('dpa.s7.h')}</h2>
      <LegalParagraph k="dpa.s7.p" />

      <h2>{t('dpa.s8.h')}</h2>
      <LegalParagraph k="dpa.s8.p" />

      <h2>{t('dpa.s9.h')}</h2>
      <LegalParagraph k="dpa.s9.p" />

      <h2>{t('dpa.s10.h')}</h2>
      <LegalParagraph k="dpa.s10.p" />

      <h2>{t('dpa.s11.h')}</h2>
      <LegalParagraph k="dpa.s11.p" />

      <h2>{t('dpa.s12.h')}</h2>
      <LegalParagraph k="dpa.s12.p" />

      <h2>{t('dpa.annexA.h')}</h2>
      <LegalList k="dpa.annexA.items" />

      <h2>{t('dpa.annexB.h')}</h2>
      <LegalList k="dpa.annexB.items" />

      <h2>{t('dpa.contact.h')}</h2>
      <LegalList k="dpa.contact.items" />
    </LegalPageLayout>
  );
};

export default DataProcessingAddendum;
