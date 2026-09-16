import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LegalPageLayout,
  LegalList,
  LegalParagraph,
  LegalText,
} from '@/components/public-site/LegalPageLayout';

const LAST_UPDATED = new Date(2026, 5, 6); // June 6, 2026

const PrivacyPolicy: React.FC = () => {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout
      title={t('privacy.title')}
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          <LegalText k="privacy.intro" />
        </p>
      }
    >
      <h2>{t('privacy.s1.h')}</h2>
      <LegalParagraph k="privacy.s1.p1" />
      <LegalParagraph k="privacy.s1.p2" />

      <h2>{t('privacy.s2.h')}</h2>
      <h3>{t('privacy.s2.h21')}</h3>
      <LegalList k="privacy.s2.items21" />

      <h3>{t('privacy.s2.h22')}</h3>
      <LegalList k="privacy.s2.items22" />

      <h3>{t('privacy.s2.h23')}</h3>
      <LegalList k="privacy.s2.items23" />

      <h2>{t('privacy.s3.h')}</h2>
      <LegalParagraph k="privacy.s3.p" />
      <LegalList k="privacy.s3.items" />

      <h2>{t('privacy.s4.h')}</h2>
      <LegalParagraph k="privacy.s4.p" />
      <LegalList k="privacy.s4.items" />

      <h2>{t('privacy.s5.h')}</h2>
      <LegalParagraph k="privacy.s5.p" />
      <LegalList k="privacy.s5.items" />

      <h2>{t('privacy.s6.h')}</h2>
      <LegalParagraph k="privacy.s6.p1" />
      <LegalParagraph k="privacy.s6.p2" />

      <h2>{t('privacy.s7.h')}</h2>
      <LegalParagraph k="privacy.s7.p1" />
      <LegalList k="privacy.s7.items" />
      <LegalParagraph k="privacy.s7.p2" />

      <h2>{t('privacy.s8.h')}</h2>
      <LegalParagraph k="privacy.s8.p" />

      <h2>{t('privacy.s9.h')}</h2>
      <LegalParagraph k="privacy.s9.p1" />
      <LegalList k="privacy.s9.items" />
      <LegalParagraph k="privacy.s9.p2" />

      <h2>{t('privacy.s10.h')}</h2>
      <LegalParagraph k="privacy.s10.p" />

      <h2>{t('privacy.s11.h')}</h2>
      <LegalParagraph k="privacy.s11.p1" />
      <LegalList k="privacy.s11.items" />
      <LegalParagraph k="privacy.s11.p2" />

      <h2>{t('privacy.s12.h')}</h2>
      <LegalParagraph k="privacy.s12.p" />

      <h2>{t('privacy.s13.h')}</h2>
      <LegalParagraph k="privacy.s13.p" />

      <h2>{t('privacy.s14.h')}</h2>
      <LegalParagraph k="privacy.s14.p" />
      <LegalList k="privacy.s14.items" />

      <h2>{t('privacy.s15.h')}</h2>
      <LegalParagraph k="privacy.s15.p" />
    </LegalPageLayout>
  );
};

export default PrivacyPolicy;
