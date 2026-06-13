import React from 'react';
import { LegalPageLayout } from '@/components/public-site/LegalPageLayout';

const DataProcessingAddendum: React.FC = () => {
  return (
    <LegalPageLayout
      title="Data Processing Addendum"
      lastUpdated="June 6, 2026"
      intro={
        <p>
          This Data Processing Addendum ("DPA") forms part of the <a href="/terms">Terms of Use</a> between The Golden Circle Consulting LLC ("we," "us," or "Processor") and the organization that uses the Beauty Hub Pro platform ("you," "Customer," or "Controller"). It governs how we process personal data on your behalf when you use the Platform to manage your clients, appointments, forms, and communications.
        </p>
      }
    >
      <h2>1. Roles of the parties</h2>
      <p>
        For personal data relating to your clients and contained in Customer Data, you are the <strong>controller</strong> and we are the <strong>processor</strong> (or, where applicable, the "service provider" under U.S. state privacy laws). For data we collect about your account and your authorized users, we act as a controller as described in our <a href="/privacy">Privacy Policy</a>. This DPA applies only to our processing as a processor on your behalf.
      </p>

      <h2>2. Scope and instructions</h2>
      <p>
        We will process personal data only (a) to provide and support the Platform, (b) in accordance with your documented lawful instructions (including those given through the Platform's features and settings), and (c) as required by applicable law. The subject matter, duration, nature, and purpose of the processing, the types of personal data, and the categories of data subjects are described in Annex A.
      </p>

      <h2>3. Your responsibilities</h2>
      <p>
        You are responsible for establishing a lawful basis for the personal data you upload, for providing any required notices to your clients, and for obtaining any required consents (including for marketing communications sent through the Platform). You must not provide us with special categories of data or regulated health data except as permitted by the <a href="/terms">Terms of Use</a> (which prohibit using the Platform for HIPAA-regulated Protected Health Information absent a separate Business Associate Agreement).
      </p>

      <h2>4. Confidentiality</h2>
      <p>
        We ensure that personnel authorized to process personal data are bound by appropriate obligations of confidentiality and process personal data only on our instructions.
      </p>

      <h2>5. Security</h2>
      <p>
        We implement and maintain appropriate technical and organizational measures designed to protect personal data, including: encryption in transit and at rest, per-tenant data isolation enforced at the database rule layer, role-based access controls, audit logging, rate-limiting on outbound services, and routine security review. These measures are described in more detail in our <a href="/privacy">Privacy Policy</a> and may be updated to maintain or improve the level of protection.
      </p>

      <h2>6. Sub-processors</h2>
      <p>
        You authorize us to engage the sub-processors listed in Annex B to process personal data on our behalf. We impose data-protection obligations on each sub-processor that are no less protective than those in this DPA, and we remain responsible for their performance. We will give you a reasonable means to learn of changes to our sub-processor list (for example, by updating Annex B and the <a href="/privacy">Privacy Policy</a>) so you may object on reasonable data-protection grounds.
      </p>

      <h2>7. International transfers</h2>
      <p>
        We process personal data primarily in the United States. Where we transfer personal data originating in the European Economic Area, the United Kingdom, or Switzerland to a country without an adequacy decision, we rely on an appropriate transfer mechanism, such as the European Commission's Standard Contractual Clauses (and the UK Addendum, where applicable), which are incorporated into this DPA by reference where they apply.
      </p>

      <h2>8. Assistance to you</h2>
      <p>
        Taking into account the nature of the processing, we will provide reasonable assistance to help you (a) respond to requests from data subjects to exercise their rights, (b) meet your security, breach-notification, and data-protection-impact-assessment obligations, and (c) consult with supervisory authorities where required. The Platform's self-service features (export, edit, delete) are the primary means by which you can fulfill many data-subject requests directly.
      </p>

      <h2>9. Personal data breaches</h2>
      <p>
        We will notify you without undue delay after becoming aware of a personal data breach affecting your Customer Data, and will provide information reasonably available to us to help you meet your own notification obligations. Our notification is not an acknowledgment of fault or liability.
      </p>

      <h2>10. Return and deletion</h2>
      <p>
        Upon termination of the Platform services, we will, at your choice, delete or return your Customer Data, and delete existing copies, except to the extent retention is required by law or by the retention schedule described in our <a href="/privacy">Privacy Policy</a> (for example, auditable invoice and signed-form records).
      </p>

      <h2>11. Audits</h2>
      <p>
        We will make available information reasonably necessary to demonstrate compliance with this DPA and will allow for and contribute to audits, including inspections, conducted by you or an auditor you mandate, subject to reasonable confidentiality, scheduling, scope, and frequency limitations.
      </p>

      <h2>12. Liability and term</h2>
      <p>
        Each party's liability under this DPA is subject to the limitations and exclusions of liability in the <a href="/terms">Terms of Use</a>. This DPA takes effect when you begin using the Platform and continues for as long as we process personal data on your behalf.
      </p>

      <h2>Annex A: Details of processing</h2>
      <ul>
        <li><strong>Subject matter:</strong> provision of the Beauty Hub Pro salon and spa management platform.</li>
        <li><strong>Duration:</strong> the term of your use of the Platform, plus any legally required retention period.</li>
        <li><strong>Nature and purpose:</strong> hosting, storage, and processing of client records, appointments, packages, forms, invoices, and communications to operate your business.</li>
        <li><strong>Types of personal data:</strong> names, contact details, appointment and purchase history, form responses, photographs you upload, and signatures.</li>
        <li><strong>Categories of data subjects:</strong> your clients, prospects, and authorized staff users.</li>
      </ul>

      <h2>Annex B: Authorized sub-processors</h2>
      <ul>
        <li><strong>Google Cloud / Firebase</strong> (Google LLC): hosting, authentication, database, functions, storage (United States).</li>
        <li><strong>Twilio, Inc.</strong>: SMS delivery.</li>
        <li><strong>Infobip Ltd.</strong>: SMS delivery (alternative provider).</li>
        <li><strong>Resend (Resend Inc.)</strong>: transactional and marketing email delivery.</li>
        <li><strong>Acuity Scheduling</strong> (Squarespace, Inc.): calendar synchronization, optional per organization.</li>
        <li><strong>Google Drive</strong> (Google LLC): optional backup of signed forms and invoices when enabled.</li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>The Golden Circle Consulting LLC, State of Florida, United States</li>
        <li>Email: <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a></li>
        <li>Phone: <a href="tel:+17542326590">+1 754-232-6590</a></li>
      </ul>
    </LegalPageLayout>
  );
};

export default DataProcessingAddendum;
