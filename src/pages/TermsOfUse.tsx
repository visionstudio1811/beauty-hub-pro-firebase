import React from 'react';
import { LegalPageLayout } from '@/components/public-site/LegalPageLayout';

const TermsOfUse: React.FC = () => {
  return (
    <LegalPageLayout
      title="Terms of Use"
      lastUpdated="June 6, 2026"
      intro={
        <p>
          These Terms of Use (the "Terms") govern your access to and use of the Beauty Hub Pro website, applications, and services operated by The Golden Circle Consulting LLC ("we," "us," or "Beauty Hub Pro"). By accessing or using the Platform, you agree to be bound by these Terms.
        </p>
      }
    >
      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account, requesting a quote, signing an order form, or otherwise using the Platform, you confirm that you have read, understood, and agree to be bound by these Terms and our <a href="/privacy">Privacy Policy</a>, <a href="/sms-terms">SMS Terms</a>, and <a href="/acceptable-use">Acceptable Use Policy</a>. If you do not agree, you must not use the Platform.
      </p>
      <p>
        If you are using the Platform on behalf of an organization, you represent that you have the authority to bind that organization to these Terms, and "you" refers to that organization. Individual end clients of our customers are subject to the customer's own terms in addition to these.
      </p>

      <h2>2. Description of the Service</h2>
      <p>
        Beauty Hub Pro is a multi-tenant software platform for salons, spas, and similar businesses. The Service includes appointment scheduling, client records, treatment and package management, digital waivers and intake forms, invoicing, a white-label client portal, marketing and transactional messaging, integrations (such as Acuity Scheduling and Google Drive), and consulting support delivered by The Golden Circle Consulting LLC.
      </p>
      <p>
        Specific features available to your account depend on your subscription, your add-ons, and your jurisdiction. We may add, modify, or remove features over time. We will use reasonable efforts to notify customers in advance of material changes to paid features.
      </p>

      <h2>3. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract under applicable law.</li>
        <li>Account creation by self-signup is not available. Accounts are provisioned through an onboarding process, and only an admin may create additional users for your organization.</li>
        <li>You are responsible for maintaining the confidentiality of your credentials and for all activity under your account.</li>
        <li>You must promptly notify us of any unauthorized use or suspected compromise of your account.</li>
        <li>We reserve the right to refuse, suspend, or terminate accounts at our discretion, including for violation of these Terms or our <a href="/acceptable-use">Acceptable Use Policy</a>.</li>
      </ul>

      <h2>4. Fees, billing, and quotes</h2>
      <ul>
        <li>The Platform is sold by custom quote. Pricing depends on team size, locations, integrations, and usage; specific fees are set out in your order form, statement of work, or written quote.</li>
        <li>Subscriptions are billed in advance on a recurring basis (typically monthly or annually as set out in your quote). All fees are in US Dollars unless your quote specifies otherwise.</li>
        <li>Usage-based items (such as SMS volume) may be billed in arrears at the rates set out in your quote.</li>
        <li>Late payments may incur a fee of 1.5% per month (or the maximum permitted by law, whichever is lower) and may result in service suspension after written notice.</li>
        <li>Except as required by law or expressly stated in your quote, fees are non-refundable.</li>
      </ul>

      <h2>5. Customer data and ownership</h2>
      <p>
        You retain all rights, title, and interest in the data you and your users submit to the Platform ("Customer Data"). You grant us a worldwide, non-exclusive, royalty-free license to host, process, transmit, display, and otherwise use Customer Data solely to provide and improve the Service, to comply with law, and as otherwise permitted under these Terms and our <a href="/privacy">Privacy Policy</a>.
      </p>
      <p>
        You are responsible for: (a) the accuracy and lawfulness of Customer Data, (b) having all necessary rights and consents (including from your end clients) to upload Customer Data and to send messages through the Platform, and (c) any third-party claims arising from Customer Data.
      </p>

      <h3>Data processing</h3>
      <p>
        Where we process personal data contained in Customer Data on your behalf, we act as a processor and you act as the controller. That processing is governed by our <a href="/dpa">Data Processing Addendum</a> ("DPA"), which is incorporated into these Terms by reference. If there is a conflict between the DPA and these Terms regarding the processing of personal data, the DPA controls.
      </p>

      <h3>Health data and HIPAA</h3>
      <p>
        The Platform may be used to store general client intake information that is not regulated health data (for example, allergies, skin type, or treatment preferences collected by a salon or spa that is not a HIPAA covered entity), subject to the <a href="/privacy">Privacy Policy</a> and your own consents. However, <strong>the Platform is not a HIPAA-compliant service, and we do not currently enter into Business Associate Agreements.</strong> If you are a "covered entity" or "business associate" as defined under the U.S. Health Insurance Portability and Accountability Act ("HIPAA"), you must not use the Platform to create, receive, maintain, or transmit Protected Health Information ("PHI") as defined under HIPAA unless and until you have entered into a signed Business Associate Agreement with us. You are solely responsible for determining whether your use involves PHI and for obtaining any required agreements before such use.
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Your use of the Platform must comply with our <a href="/acceptable-use">Acceptable Use Policy</a>, including the prohibitions on unlawful content, abusive messaging, attempts to circumvent security, and reverse engineering. Violations may result in suspension or termination without refund.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        Beauty Hub Pro, the software, the underlying technology, the user interface, the brand templates, the marketing site, and all other materials we provide (collectively, the "Beauty Hub Pro IP") are owned by us or our licensors and are protected by intellectual property laws. Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform during your subscription term, solely for your internal business use.
      </p>
      <p>
        You may not (a) copy, modify, or create derivative works of the Beauty Hub Pro IP; (b) reverse engineer, decompile, or attempt to derive source code; (c) remove or alter any proprietary notices; (d) use the Platform to build a competing product; or (e) resell, sublicense, or make the Platform available to third parties outside your organization (other than to your end clients as part of normal use).
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Platform integrates with third-party services (for example, Twilio, Infobip, Resend, Acuity Scheduling, Google Cloud, and Google Drive). Your use of those services is governed by their own terms and privacy policies. We are not responsible for the availability, accuracy, or content of third-party services, and we cannot guarantee that they will remain compatible with the Platform.
      </p>

      <h2>9. Feedback</h2>
      <p>
        If you provide feedback, suggestions, or ideas about the Platform, you grant us a perpetual, irrevocable, royalty-free license to use that feedback for any purpose, without attribution or compensation.
      </p>

      <h2>10. Confidentiality</h2>
      <p>
        Each party may receive confidential information from the other. Each party agrees to (a) use confidential information solely to perform under these Terms, (b) protect it with the same degree of care as it uses for its own confidential information (and no less than a reasonable degree of care), and (c) not disclose it to third parties except to employees, contractors, and advisers bound by similar confidentiality obligations. Confidential information does not include information that is publicly available without breach, independently developed, or rightfully received from a third party without restriction.
      </p>

      <h2>11. Term and termination</h2>
      <ul>
        <li>These Terms remain in effect for as long as you use the Platform or maintain an account.</li>
        <li>Either party may terminate for material breach if the breach remains uncured 30 days after written notice.</li>
        <li>You may terminate your subscription at any time by contacting us; termination is effective at the end of the current billing period.</li>
        <li>We may suspend or terminate immediately if (a) you fail to pay, (b) we have a reasonable, good-faith belief that your use violates law or threatens the security of the Platform, or (c) required by law or carrier policy.</li>
        <li>Upon termination, your access ceases. You may export Customer Data for 30 days after termination, after which we may delete it in accordance with our <a href="/privacy">Privacy Policy</a> retention schedule.</li>
      </ul>

      <h2>12. Disclaimers</h2>
      <p>
        THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT DEFECTS WILL BE CORRECTED.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST REVENUE, OR LOSS OF DATA, ARISING OUT OF OR RELATING TO THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS WILL NOT EXCEED THE AMOUNTS YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. THESE LIMITATIONS APPLY REGARDLESS OF THE THEORY OF LIABILITY.
      </p>

      <h2>14. Indemnification</h2>
      <p>
        You will defend, indemnify, and hold harmless Beauty Hub Pro, its affiliates, officers, directors, employees, and agents from and against any third-party claims, damages, liabilities, and expenses (including reasonable attorneys' fees) arising out of (a) your Customer Data, (b) your violation of these Terms, the <a href="/acceptable-use">Acceptable Use Policy</a>, or applicable law, or (c) your infringement of any third-party intellectual property or privacy right.
      </p>

      <h2>15. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of the State of Florida, USA, without regard to its conflict-of-law principles. The parties consent to exclusive jurisdiction and venue in the state and federal courts located in Florida for any dispute arising out of or relating to these Terms, except that either party may seek injunctive relief in any court of competent jurisdiction.
      </p>
      <p>
        Before initiating litigation, the parties will attempt in good faith to resolve any dispute through written notice and a thirty (30) day discussion period. Nothing in this Section restricts a party's ability to seek emergency or injunctive relief.
      </p>

      <h2>16. Changes to the Service or these Terms</h2>
      <p>
        We may modify these Terms from time to time. Material changes will be notified by email to account holders or by a prominent notice on the Platform. The "Last updated" date at the top reflects the current version. Your continued use of the Platform after changes take effect constitutes acceptance of the updated Terms. If you do not agree, you must stop using the Platform.
      </p>

      <h2>17. Miscellaneous</h2>
      <ul>
        <li><strong>Entire agreement:</strong> these Terms, together with the Privacy Policy, SMS Terms, Acceptable Use Policy, and any order form or quote, constitute the entire agreement between the parties.</li>
        <li><strong>Severability:</strong> if any provision is held invalid, the remaining provisions remain in effect.</li>
        <li><strong>Assignment:</strong> you may not assign these Terms without our prior written consent. We may assign these Terms to a successor in connection with a merger, acquisition, or sale of assets.</li>
        <li><strong>No waiver:</strong> failure to enforce any provision is not a waiver of the right to enforce it later.</li>
        <li><strong>Force majeure:</strong> neither party is liable for delay or failure caused by events beyond reasonable control.</li>
        <li><strong>Notices:</strong> we may give notice by email, in-app message, or postal mail. You may give us notice at the contact details below.</li>
      </ul>

      <h2>18. Contact</h2>
      <p>
        Questions about these Terms? Contact:
      </p>
      <ul>
        <li>The Golden Circle Consulting LLC</li>
        <li>State of Florida, United States</li>
        <li>Email: <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a></li>
        <li>Phone: <a href="tel:+17542326590">+1 754-232-6590</a></li>
      </ul>
    </LegalPageLayout>
  );
};

export default TermsOfUse;
