import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LegalPageLayout,
  LegalList,
  LegalParagraph,
  LegalText,
} from '@/components/public-site/LegalPageLayout';

const LAST_UPDATED = new Date(2026, 5, 6); // June 6, 2026

const TermsOfUse: React.FC = () => {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout
      title={t('terms.title')}
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          <LegalText k="terms.intro" />
        </p>
      }
    >
      <h2>{t('terms.s1.h')}</h2>
      <LegalParagraph k="terms.s1.p1" />
      <LegalParagraph k="terms.s1.p2" />

      <h2>{t('terms.s2.h')}</h2>
      <LegalParagraph k="terms.s2.p1" />
      <LegalParagraph k="terms.s2.p2" />

      <h2>{t('terms.s3.h')}</h2>
      <LegalList k="terms.s3.items" />

      <h2>{t('terms.s4.h')}</h2>
      <LegalList k="terms.s4.items" />

      <h2>{t('terms.s5.h')}</h2>
      <LegalParagraph k="terms.s5.p1" />
      <LegalParagraph k="terms.s5.p2" />

      <h3>{t('terms.s5.hData')}</h3>
      <LegalParagraph k="terms.s5.pData" />

      <h3>{t('terms.s5.hHealth')}</h3>
      <LegalParagraph k="terms.s5.pHealth" />

      <h2>{t('terms.s6.h')}</h2>
      <LegalParagraph k="terms.s6.p" />

      <h2>{t('terms.s7.h')}</h2>
      <LegalParagraph k="terms.s7.p1" />
      <LegalParagraph k="terms.s7.p2" />

      <h2>{t('terms.s8.h')}</h2>
      <LegalParagraph k="terms.s8.p" />

      <h2>{t('terms.s9.h')}</h2>
      <LegalParagraph k="terms.s9.p" />

      <h2>{t('terms.s10.h')}</h2>
      <LegalParagraph k="terms.s10.p" />

      <h2>{t('terms.s11.h')}</h2>
      <LegalList k="terms.s11.items" />

      <h2>{t('terms.s12.h')}</h2>
      <LegalParagraph k="terms.s12.p" />

      <h2>{t('terms.s13.h')}</h2>
      <LegalParagraph k="terms.s13.p" />

      <h2>{t('terms.s14.h')}</h2>
      <LegalParagraph k="terms.s14.p" />

      <h2>{t('terms.s15.h')}</h2>
      <LegalParagraph k="terms.s15.p1" />
      <LegalParagraph k="terms.s15.p2" />

      <h2>{t('terms.s16.h')}</h2>
      <LegalParagraph k="terms.s16.p" />

      <h2>{t('terms.s17.h')}</h2>
      <LegalList k="terms.s17.items" />

      <h2>{t('terms.s18.h')}</h2>
      <LegalParagraph k="terms.s18.p" />
      <LegalList k="terms.s18.items" />
    </LegalPageLayout>
  );
};

export default TermsOfUse;
