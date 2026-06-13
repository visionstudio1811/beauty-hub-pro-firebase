import React from 'react';
import { LegalPageLayout } from '@/components/public-site/LegalPageLayout';

const SmsTerms: React.FC = () => {
  return (
    <LegalPageLayout
      title="SMS / Mobile Messaging Terms"
      lastUpdated="June 6, 2026"
      intro={
        <p>
          These SMS Terms describe how Beauty Hub Pro and the businesses that use our Platform send text messages. They apply to both transactional messages (such as appointment confirmations and waiver links) and marketing messages. By providing a phone number to a Beauty Hub Pro customer or by texting a covered short code or long code, you agree to these SMS Terms.
        </p>
      }
    >
      <h2>1. Who is sending messages</h2>
      <p>
        Beauty Hub Pro is a software platform. Messages sent through the Platform are sent on behalf of our customers (salons, spas, and similar businesses). The business that collects your phone number is the sender from your perspective; Beauty Hub Pro provides the technology that delivers the message through carrier partners such as Twilio, Inc. and Infobip Ltd.
      </p>

      <h2>2. Consent</h2>
      <p>
        Before you receive marketing SMS through the Platform, the sending business must obtain your prior express written consent. By providing your mobile number to a business and opting in (whether on a paper form, online form, or by texting a designated keyword), you consent to receive SMS messages from that business at the number you provided. Consent is not a condition of purchase.
      </p>
      <p>
        For transactional messages (appointment confirmations, reminders, waiver links, OTP codes, package expiry notices), the business may text you because you have an active relationship with them, even if you have not opted into marketing. You may opt out of marketing while continuing to receive transactional messages.
      </p>

      <h2>3. Message frequency</h2>
      <p>
        Message frequency varies by business and message type. Typical volumes include:
      </p>
      <ul>
        <li><strong>Transactional:</strong> one message per booking, plus occasional reminders or follow-ups.</li>
        <li><strong>Marketing:</strong> the sending business sets the cadence, typically no more than four (4) messages per month per customer, but you should refer to the business's own messaging policy for specifics.</li>
      </ul>

      <h2>4. Carrier charges</h2>
      <p>
        Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.
      </p>

      <h2>5. Supported keywords</h2>
      <p>You can interact with messages sent through the Platform using standard keywords:</p>
      <ul>
        <li><strong>STOP:</strong> reply STOP to any message to unsubscribe from further messages from that business through that number. You will receive one confirmation message that you have been unsubscribed; after that, no further messages will be sent unless you opt back in.</li>
        <li><strong>HELP:</strong> reply HELP to receive contact information for the business sending the message.</li>
        <li><strong>UNSTOP / START:</strong> reply START to opt back in after a previous STOP.</li>
      </ul>
      <p>
        Carriers may also support cancel, end, quit, unsubscribe, opt-out, and remove as equivalents to STOP. The Platform respects opt-out requests through any of these keywords.
      </p>

      <h2>6. Supported carriers</h2>
      <p>
        SMS service is available on most major US carriers, including AT&amp;T, Verizon, T-Mobile, US Cellular, Sprint, and many regional carriers, subject to carrier acceptance. We cannot guarantee delivery on every carrier or in every country. International delivery depends on the recipient country and carrier; some destinations may not be supported.
      </p>

      <h2>7. Privacy</h2>
      <p>
        Mobile information collected as part of SMS consent will not be shared, sold, or rented to third parties or affiliates for marketing or promotional purposes. Mobile data may be shared with subprocessors strictly to deliver and operate the messaging service (such as Twilio or Infobip) consistent with our <a href="/privacy">Privacy Policy</a>. Opt-in data and consent records are retained by the sending business in line with their own policies.
      </p>

      <h2>8. OTP (one-time passcode) messages</h2>
      <p>
        Beauty Hub Pro sends one-time passcodes via SMS to verify identity for certain high-trust actions, such as signing a waiver, intake form, or agreement. OTP messages are transactional and cannot be unsubscribed while the action is in progress. Codes expire and become invalid after a short window. Never share an OTP with anyone, including someone who claims to be from Beauty Hub Pro or the sending business. We will never ask for your OTP over phone, chat, or email.
      </p>

      <h2>9. Reporting abuse</h2>
      <p>
        If you receive an SMS that you believe was sent without your consent or that violates these Terms, please:
      </p>
      <ul>
        <li>Reply STOP to the sender to stop further messages, and</li>
        <li>Email us at <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a> with the sender's name (if you know it) and the message content.</li>
      </ul>
      <p>
        We take messaging abuse seriously. Customers that send unauthorized or non-compliant messages are subject to suspension or termination under our <a href="/acceptable-use">Acceptable Use Policy</a>.
      </p>

      <h2>10. Compliance</h2>
      <p>
        We comply with applicable messaging regulations, including the Telephone Consumer Protection Act (TCPA) and the CTIA Messaging Principles and Best Practices. We register A2P 10DLC campaigns where applicable and provide consent documentation on request from carriers. Each customer of the Platform is responsible for the content and frequency of its own messages and for maintaining records of consent.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these SMS Terms from time to time. The "Last updated" date at the top of this page indicates when the latest version took effect. Continued use of the Platform constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <ul>
        <li>Email: <a href="mailto:thegoldencircle.skincare@gmail.com">thegoldencircle.skincare@gmail.com</a></li>
        <li>Phone: <a href="tel:+17542326590">+1 754-232-6590</a></li>
      </ul>
    </LegalPageLayout>
  );
};

export default SmsTerms;
