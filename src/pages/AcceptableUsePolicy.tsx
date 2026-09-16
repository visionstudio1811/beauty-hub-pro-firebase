import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LegalPageLayout,
  LegalList,
  LegalParagraph,
  LegalText,
} from '@/components/public-site/LegalPageLayout';

const LAST_UPDATED = new Date(2026, 5, 6); // June 6, 2026

const AcceptableUsePolicy: React.FC = () => {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout
      title={t('aup.title')}
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          <LegalText k="aup.intro" />
        </p>
      }
    >
      <h2>{t('aup.s1.h')}</h2>
      <LegalParagraph k="aup.s1.p" />

      <h2>{t('aup.s2.h')}</h2>
      <LegalParagraph k="aup.s2.p" />
      <LegalList k="aup.s2.items" />

      <h2>{t('aup.s3.h')}</h2>
      <LegalParagraph k="aup.s3.p" />
      <LegalList k="aup.s3.items" />

      <h2>{t('aup.s4.h')}</h2>
      <LegalParagraph k="aup.s4.p" />
      <LegalList k="aup.s4.items" />

      <h2>{t('aup.s5.h')}</h2>
      <LegalParagraph k="aup.s5.p" />
      <LegalList k="aup.s5.items" />

      <h2>{t('aup.s6.h')}</h2>
      <LegalParagraph k="aup.s6.p" />

      <h2>{t('aup.s7.h')}</h2>
      <LegalParagraph k="aup.s7.p" />

      <h2>{t('aup.s8.h')}</h2>
      <LegalParagraph k="aup.s8.p1" />
      <LegalList k="aup.s8.items" />
      <LegalParagraph k="aup.s8.p2" />

      <h2>{t('aup.s9.h')}</h2>
      <LegalParagraph k="aup.s9.p" />

      <h2>{t('aup.s10.h')}</h2>
      <LegalList k="aup.s10.items" />
    </LegalPageLayout>
  );
};

export default AcceptableUsePolicy;
