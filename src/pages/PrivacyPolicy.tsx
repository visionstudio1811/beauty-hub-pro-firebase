import React from 'react';
import { LegalPageLayout } from '@/components/public-site/LegalPageLayout';

const PrivacyPolicy: React.FC = () => {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated="June 6, 2026"
      intro={
        <p>
          This Privacy Policy explains how The Golden Circle Consulting LLC ("we," "us," or "Beauty Hub Pro") collects, uses, shares, and protects information when you visit our website, use our salon and spa management platform, or interact with the marketing and transactional communications we send on behalf of our customers.
        </p>
      }
    >
      <h2>1. Who we are</h2>
      <p>
        Beauty Hub Pro is the software arm of The Golden Circle Consulting LLC, a Florida limited liability company. Throughout this policy, references to "the Platform" or "the Service" mean the Beauty Hub Pro web application, client portal, and related Cloud Functions, regardless of whether they are accessed at beautyhubpro.com or a white-label domain operated by one of our customers (for example, crm.your-salon.com).
      </p>
      <p>
        When you are a customer's client (for example, a client of a salon that uses our Platform), our customer (not Beauty Hub Pro) is the controller of your personal data, and we act as a processor. This Privacy Policy describes the practices Beauty Hub Pro follows in either role.
      </p>

      <h2>2. Information we collect</h2>
      <h3>2.1 Information you provide directly</h3>
      <ul>
        <li><strong>Account information:</strong> name, email address, phone number, organization name, role, and password (stored hashed).</li>
        <li><strong>Quote-request information:</strong> business size, current software, contact details, and free-text notes you submit through our public quote form.</li>
        <li><strong>Customer organization data:</strong> client records, appointments, treatments, packages, products, invoices, waivers, intake forms, agreements, photographs uploaded to forms, signatures captured in-app, and other operational data you enter into the Platform.</li>
        <li><strong>Communications:</strong> the content of messages you send us or that you send through the Platform to your clients.</li>
      </ul>

      <h3>2.2 Information collected automatically</h3>
      <ul>
        <li><strong>Device and usage data:</strong> IP address, browser type, operating system, device identifiers, language preference, referring URL, pages visited, and timestamps.</li>
        <li><strong>Cookies and similar technologies:</strong> see Section 9 for details.</li>
        <li><strong>Authentication signals:</strong> session tokens, sign-in timestamps, and idle activity events used to enforce the 60-minute session timeout.</li>
      </ul>

      <h3>2.3 Information from third parties</h3>
      <ul>
        <li><strong>Identity providers:</strong> when you sign in with Google or via phone OTP, the identity provider shares the identifiers you authorize (typically email or phone number).</li>
        <li><strong>Scheduling integrations:</strong> when our customer connects Acuity Scheduling, we receive appointment and client records that Acuity sends over its webhook or that we fetch via Acuity's API.</li>
        <li><strong>Payment and messaging providers:</strong> we receive operational metadata from Twilio, Infobip, Resend, and similar providers (delivery status, error codes), but we do not handle credit-card data directly.</li>
      </ul>

      <h2>3. How we use information</h2>
      <p>We use the information described above to:</p>
      <ul>
        <li>Operate, secure, and improve the Platform;</li>
        <li>Provision accounts, authenticate users, and enforce role-based access;</li>
        <li>Process bookings, package consumption, invoices, and the transactional messages tied to those actions;</li>
        <li>Send marketing and operational communications you have requested or that our customer has configured (subject to opt-out; see Section 6);</li>
        <li>Provide customer support, onboarding, data migration, and consulting services;</li>
        <li>Detect, prevent, and respond to fraud, abuse, security incidents, and rule violations;</li>
        <li>Comply with applicable law, court orders, and regulatory obligations.</li>
      </ul>

      <h2>4. Legal bases for processing (GDPR / UK GDPR)</h2>
      <p>
        Where European Economic Area, United Kingdom, or Swiss data protection law applies, we rely on the following legal bases:
      </p>
      <ul>
        <li><strong>Contract:</strong> to provide the Platform you or your organization signed up for.</li>
        <li><strong>Legitimate interests:</strong> to secure the Platform, prevent abuse, improve product quality, and conduct direct marketing to existing business customers, balanced against your rights.</li>
        <li><strong>Consent:</strong> for non-essential cookies, marketing emails to non-customers, and any processing requiring explicit opt-in.</li>
        <li><strong>Legal obligation:</strong> to retain records, respond to lawful requests, and meet tax and accounting requirements.</li>
      </ul>

      <h2>5. How we share information</h2>
      <p>We do not sell personal information. We share information in the following limited ways:</p>
      <ul>
        <li><strong>Sub-processors and infrastructure providers</strong> who help us operate the Platform; see Section 7 for a current list.</li>
        <li><strong>Our customers (the salons, spas, and studios on the Platform)</strong> where you are their client. They control your data within their organization's tenant.</li>
        <li><strong>Professional advisers</strong> (lawyers, accountants, auditors) under confidentiality.</li>
        <li><strong>Business transfers:</strong> in connection with a merger, acquisition, financing, or sale of assets, subject to the new entity continuing to honor this policy.</li>
        <li><strong>Legal compliance:</strong> when we believe in good faith that disclosure is necessary to comply with law, protect rights and safety, or respond to lawful requests.</li>
      </ul>

      <h2>6. Marketing communications and SMS</h2>
      <p>
        We send marketing email to people who have asked to hear from us or whose organization is a current Beauty Hub Pro customer. You can opt out at any time by clicking "unsubscribe" in any marketing email or by emailing us. Transactional emails (account, security, billing) cannot be unsubscribed while you have an active account.
      </p>
      <p>
        Marketing and transactional SMS sent through the Platform are governed by our <a href="/sms-terms">SMS Terms</a>, including the STOP / HELP keyword behavior required by US carriers. We do not buy or sell phone numbers for marketing, and we do not use phone numbers for advertising on third-party platforms.
      </p>

      <h2>7. Sub-processors and third-party services</h2>
      <p>We rely on the following sub-processors to provide the Platform:</p>
      <ul>
        <li><strong>Google Cloud / Firebase</strong>: hosting, authentication, Firestore database, Cloud Functions, Cloud Storage (United States).</li>
        <li><strong>Twilio, Inc.</strong>: SMS delivery in the United States and other supported countries.</li>
        <li><strong>Infobip Ltd.</strong>: SMS delivery as an alternative to Twilio.</li>
        <li><strong>Resend (Resend Inc.)</strong>: transactional and marketing email delivery.</li>
        <li><strong>Acuity Scheduling (Squarespace, Inc.)</strong>: calendar sync, optional per organization.</li>
        <li><strong>Google Drive (Google LLC)</strong>: automatic backup of signed waivers and issued invoices when a customer enables Drive backup.</li>
      </ul>
      <p>
        Each sub-processor processes personal data only on documented instructions, under written contracts that require appropriate technical and organizational measures. We review this list periodically; updates will be reflected in this Section with an updated "Last updated" date at the top of this policy.
      </p>

      <h2>8. International transfers</h2>
      <p>
        We are based in the United States, and our infrastructure providers process data primarily in the United States. If you access the Platform from outside the United States, your information will be transferred to and processed in the United States. Where required, we rely on Standard Contractual Clauses, supplementary measures, or the EU-U.S. Data Privacy Framework (where applicable) to lawfully transfer personal data out of the EEA, UK, or Switzerland.
      </p>

      <h2>9. Cookies and similar technologies</h2>
      <p>We use the following categories of cookies and local storage:</p>
      <ul>
        <li><strong>Strictly necessary:</strong> authentication, security, idle-timeout coordination across tabs, CSRF protection. Cannot be disabled.</li>
        <li><strong>Functional:</strong> user preferences such as language and theme.</li>
        <li><strong>Analytics:</strong> aggregated usage metrics so we can prioritize what to build. Set only with consent.</li>
        <li><strong>Marketing:</strong> we do not place advertising cookies on the public site at this time.</li>
      </ul>
      <p>
        You can manage your choices through the cookie banner the first time you visit, or by clearing site data in your browser. Strictly necessary cookies cannot be refused without disabling parts of the Platform.
      </p>

      <h2>10. Data retention</h2>
      <p>
        We retain personal data for as long as needed to provide the Platform and comply with our legal obligations. Account data is retained for the life of the account and for up to twelve (12) months after termination so customers can reactivate without losing history. Auditable records (invoices, signed waivers, audit logs) are retained for a minimum of seven (7) years to meet tax and recordkeeping obligations, even after account termination, unless a shorter retention is required by law.
      </p>

      <h2>11. Your rights</h2>
      <p>Depending on where you live, you may have the following rights with respect to your personal data:</p>
      <ul>
        <li>Access a copy of the personal data we hold about you;</li>
        <li>Correct inaccurate data;</li>
        <li>Delete personal data (subject to retention obligations);</li>
        <li>Restrict or object to certain processing;</li>
        <li>Receive your data in a portable format;</li>
        <li>Withdraw consent where processing relies on consent;</li>
        <li>Not be discriminated against for exercising your rights (CCPA / CPRA);</li>
        <li>Lodge a complaint with a supervisory authority (GDPR / UK GDPR).</li>
      </ul>
      <p>
        If you are a client of one of our customers, please direct rights requests to that customer first; they are the controller of your data inside their tenant. We will assist them in honoring your request. For requests about data we control directly (for example, account holders, quote requesters, marketing recipients), contact us using the details in Section 14.
      </p>

      <h2>12. Children</h2>
      <p>
        The Platform is intended for use by businesses and the adult clients of those businesses. We do not knowingly collect personal data from children under the age of thirteen (13), or under the age of sixteen (16) where applicable in the EEA, without parental consent. If you believe a child has provided personal data to us without appropriate consent, contact us and we will delete it.
      </p>

      <h2>13. Security</h2>
      <p>
        We implement industry-standard administrative, technical, and physical safeguards designed to protect personal data, including: per-tenant data isolation enforced at the database rule layer, encryption in transit (TLS) and at rest, role-based access control with audit logs, OTP-gated signing flows for sensitive documents, rate-limiting on outbound paid services, and routine security review. No system is perfectly secure; you use the Platform at your own risk and should keep your account credentials confidential.
      </p>

      <h2>14. Contact us</h2>
      <p>
        For privacy questions, requests, or complaints, contact us at:
      </p>
      <ul>
        <li>Email: <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a></li>
        <li>Phone: <a href="tel:+17542326590">+1 754-232-6590</a></li>
        <li>Postal: The Golden Circle Consulting LLC, State of Florida, United States</li>
      </ul>

      <h2>15. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be flagged on the Platform or by email to account holders. The "Last updated" date at the top of this page indicates when the latest version took effect. Your continued use of the Platform after changes take effect constitutes acceptance of the updated policy.
      </p>
    </LegalPageLayout>
  );
};

export default PrivacyPolicy;
