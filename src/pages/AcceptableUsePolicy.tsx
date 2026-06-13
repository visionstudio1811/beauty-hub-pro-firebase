import React from 'react';
import { LegalPageLayout } from '@/components/public-site/LegalPageLayout';

const AcceptableUsePolicy: React.FC = () => {
  return (
    <LegalPageLayout
      title="Acceptable Use Policy"
      lastUpdated="June 6, 2026"
      intro={
        <p>
          This Acceptable Use Policy ("AUP") describes how you may and may not use the Beauty Hub Pro platform, websites, and related services. It is incorporated into and forms part of our <a href="/terms">Terms of Use</a>. Capitalized terms not defined here have the meanings given in the Terms of Use.
        </p>
      }
    >
      <h2>1. Your responsibility</h2>
      <p>
        You are responsible for everything that happens through your account. This AUP applies to you, your employees, your contractors, any users you provision under your account, and any end clients you grant access through the Platform. If you become aware of any violation by anyone using your account, you must stop it immediately and tell us.
      </p>

      <h2>2. Prohibited content</h2>
      <p>You may not use the Platform to upload, transmit, store, share, or send messages that:</p>
      <ul>
        <li>Are unlawful, fraudulent, defamatory, obscene, pornographic, hateful, or discriminatory;</li>
        <li>Promote or facilitate violence, self-harm, terrorism, human trafficking, or child sexual abuse material;</li>
        <li>Infringe or misappropriate any intellectual property, privacy, publicity, or other right of any person;</li>
        <li>Contain malware, ransomware, spyware, or any other malicious code;</li>
        <li>Disclose another person's confidential or personal information without their consent;</li>
        <li>Are intended to deceive recipients about the identity of the sender or the nature of the message.</li>
      </ul>

      <h2>3. Prohibited messaging conduct</h2>
      <p>You may not send SMS, email, or other messages through the Platform that:</p>
      <ul>
        <li>Are unsolicited, unwanted, or sent without the recipient's prior express consent, in violation of the TCPA, CAN-SPAM Act, GDPR, or any other applicable law;</li>
        <li>Are sent to numbers or addresses obtained from a purchased, scraped, or rented list;</li>
        <li>Disregard a STOP, UNSUBSCRIBE, opt-out request, or any equivalent;</li>
        <li>Misrepresent the sender, the content, or the purpose of the message;</li>
        <li>Promote prohibited content categories under carrier rules (such as cannabis, gambling, payday loans, or "get rich quick" schemes) without proper carrier registration and pre-approval;</li>
        <li>Are sent at a frequency or in a manner that violates carrier policies or our <a href="/sms-terms">SMS Terms</a>.</li>
      </ul>

      <h2>4. Prohibited system conduct</h2>
      <p>You may not:</p>
      <ul>
        <li>Access the Platform other than through the interfaces we provide (including scraping, crawling, or reverse engineering);</li>
        <li>Probe, scan, or test the vulnerability of the Platform or attempt to bypass authentication, authorization, or rate limits, except under a coordinated, written security testing agreement with us;</li>
        <li>Interfere with the proper functioning of the Platform, including by denial-of-service, traffic floods, or excessive automated calls;</li>
        <li>Use the Platform to host or distribute content unrelated to your salon, spa, or wellness business;</li>
        <li>Resell, sublicense, or expose the Platform to third parties outside your organization, except for your normal end clients;</li>
        <li>Use the Platform to build, train, or benchmark a competing product or service;</li>
        <li>Remove or alter any copyright, trademark, or other proprietary notice in the Platform.</li>
      </ul>

      <h2>5. Data hygiene</h2>
      <p>You must:</p>
      <ul>
        <li>Have all rights and consents necessary to upload, store, and process the Customer Data you put into the Platform, including the rights to send marketing communications to the contacts in your audience;</li>
        <li>Keep your records of consent and provide them to us within fifteen (15) days of a written request;</li>
        <li>Delete records that are no longer needed and respond promptly to data subject access, deletion, and correction requests from your end clients;</li>
        <li>Not use the Platform to store Protected Health Information (PHI) as a HIPAA covered entity or business associate unless you have a signed Business Associate Agreement with us. The Platform is not HIPAA-compliant by default (see Section 5 of the <a href="/terms">Terms of Use</a>);</li>
        <li>Not share login credentials between users. Every staff member must have their own account so role and audit trails are accurate.</li>
      </ul>

      <h2>6. Security</h2>
      <p>
        You must protect the security of your account and the Customer Data inside it. This includes using strong, unique passwords, enabling and protecting multi-factor or OTP flows where offered, promptly removing access for departing staff, and reporting suspected unauthorized access to us within forty-eight (48) hours.
      </p>

      <h2>7. Reporting violations</h2>
      <p>
        If you become aware of a violation of this AUP, whether by you, your team, your end clients, or any third party, report it to <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a>. We will investigate reports in good faith and may take action consistent with this AUP and the <a href="/terms">Terms of Use</a>.
      </p>

      <h2>8. Enforcement</h2>
      <p>
        We may investigate any suspected violation of this AUP, and we may, in our sole discretion, take any of the following actions without prior notice:
      </p>
      <ul>
        <li>Require corrective action;</li>
        <li>Temporarily or permanently suspend access to all or part of the Platform;</li>
        <li>Remove or restrict access to specific content;</li>
        <li>Terminate the account;</li>
        <li>Cooperate with law enforcement.</li>
      </ul>
      <p>
        Where practical and where it does not increase risk to other customers or end clients, we will first contact the account admin and provide an opportunity to cure. We are not required to give notice in cases of serious violation, abuse, illegal activity, or risk to the Platform.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this AUP from time to time. The "Last updated" date at the top of this page indicates when the latest version took effect.
      </p>

      <h2>10. Contact</h2>
      <ul>
        <li>Email: <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a></li>
        <li>Phone: <a href="tel:+17542326590">+1 754-232-6590</a></li>
      </ul>
    </LegalPageLayout>
  );
};

export default AcceptableUsePolicy;
