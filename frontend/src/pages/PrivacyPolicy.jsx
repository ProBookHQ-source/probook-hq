import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const CONTACT_EMAIL = 'oiltoheatrebate@gmail.com';
  const EFFECTIVE_DATE = 'July 28, 2026';

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-gray-900">Tractify</span>
          </button>
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Back
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Effective date: {EFFECTIVE_DATE} · OMNIANCEGROUP LLC d/b/a Tractify</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Who We Are</h2>
            <p>
              Tractify is operated by OMNIANCEGROUP LLC, a Washington state limited liability company ("we," "us," or "our").
              Our platform connects homeowners with HVAC contractors and manages appointment booking on behalf of those contractors.
              This Privacy Policy explains how we collect, use, and protect personal information when you use our services at tractifyhq.com and contractor subdomains (e.g., yourcontractor.tractifyhq.com).
            </p>
            <p className="mt-3">
              <strong>Tractify as platform operator:</strong> Information submitted through contractor booking forms on any Tractify-powered site (including contractor subdomains) is collected and processed by OMNIANCEGROUP LLC d/b/a Tractify as the platform operator. We may retain and use this information to improve our services, match homeowners with service providers, and contact homeowners about relevant home service needs — including on behalf of other contractors on our platform. Contractors using our platform do not own or control this data; they receive access to it solely for the purpose of fulfilling service appointments booked through Tractify.
            </p>
            <p className="mt-3">
              For questions or requests, contact us at: <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Information We Collect</h2>
            <p className="font-semibold text-gray-800 mb-2">From homeowners:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Full name, email address, and phone number (provided when requesting a quote or booking an appointment)</li>
              <li>Service type and description of the work needed</li>
              <li>ZIP code and general service area</li>
              <li>IP address and approximate location (collected automatically)</li>
              <li>Browser type, device type, and pages visited (standard web server logs)</li>
            </ul>
            <p className="font-semibold text-gray-800 mt-4 mb-2">From contractors:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Business name, contact name, email, and phone number</li>
              <li>Business address, service areas, and license information</li>
              <li>Google Business Profile information (fetched via Google Places API)</li>
              <li>Appointment and booking history within our platform</li>
              <li>Availability schedules you configure in our portal</li>
            </ul>
            <p className="font-semibold text-gray-800 mt-4 mb-2">Automatically collected:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Referral source and advertising campaign tags (UTM parameters)</li>
              <li>Form step completion data for improving our intake experience</li>
              <li>Appointment outcomes logged by contractors (e.g., whether a job closed)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Match homeowners with appropriate contractors and facilitate appointment booking</li>
              <li>Send appointment confirmation, reminder, and cancellation emails and SMS messages</li>
              <li>Send booking links and follow-up messages via SMS on behalf of contractors</li>
              <li>Operate the contractor portal and scheduling calendar</li>
              <li>Improve matching accuracy, channel performance, and service quality</li>
              <li>Generate aggregated performance reports for contractors</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information to third parties. We do not use your information for advertising to you on external platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. SMS Communications</h2>
            <p>
              By providing your phone number and submitting a service request or booking form on a Tractify-powered site, you expressly consent to receive text messages (SMS) from or on behalf of the contractor you are contacting. These messages may include:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Booking link messages after a missed call or form submission</li>
              <li>Appointment confirmation and reminder messages</li>
              <li>Cancellation and rescheduling notifications</li>
              <li>Follow-up messages if you did not complete your booking</li>
            </ul>
            <p className="mt-3">
              <strong>To opt out:</strong> Reply <strong>STOP</strong> to any SMS message you receive. You will be removed from future messages immediately. Reply <strong>HELP</strong> for assistance. Message and data rates may apply. Message frequency varies.
            </p>
            <p className="mt-3">
              We comply with the Telephone Consumer Protection Act (TCPA) and CTIA messaging guidelines. Contractors using our platform are responsible for their own compliance with applicable SMS marketing laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Third-Party Services</h2>
            <p>We share information with the following service providers only as necessary to operate our platform:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Twilio</strong> — SMS and voice messaging. Homeowner phone numbers are passed to Twilio to send booking and appointment messages. Twilio's privacy policy is at twilio.com/legal/privacy.</li>
              <li><strong>Resend</strong> — Transactional email delivery. Homeowner and contractor email addresses are passed to Resend to send booking confirmations and notifications. Resend's privacy policy is at resend.com/legal/privacy-policy.</li>
              <li><strong>Stripe</strong> — Payment processing for contractor subscriptions. Stripe collects payment information directly; we never store credit card numbers. Stripe's privacy policy is at stripe.com/privacy.</li>
              <li><strong>Google</strong> — Google Places API is used to look up business information when contractors sign up. Google's privacy policy is at policies.google.com/privacy.</li>
              <li><strong>Cloudflare</strong> — DNS, CDN, and hosting for contractor subdomains. Cloudflare may log IP addresses as part of network security. Cloudflare's privacy policy is at cloudflare.com/privacypolicy/.</li>
              <li><strong>Railway</strong> — Cloud infrastructure hosting our backend and database. Data is stored in Railway's managed PostgreSQL database within the United States.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Data Retention</h2>
            <p>
              We retain homeowner contact information and appointment records indefinitely as part of the Tractify platform dataset. This data is used to improve service matching, predict demand, and contact homeowners about relevant home service needs — including after the contractor who originally served them is no longer active on the platform.
            </p>
            <p className="mt-3">
              Contractors may request deletion of their own account and business information at any time. Contractor account closure does not trigger deletion of homeowner records, which are owned and retained by Tractify as the platform operator.
            </p>
            <p className="mt-3">
              Homeowners may request deletion of their personal information (name, email, phone number, address) by contacting us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>. We will process deletion requests within 30 days. We may retain de-identified and aggregated data derived from your information indefinitely for product improvement, analytics, and AI model training purposes, even after deletion of your personal information. De-identified data cannot reasonably be used to identify you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Your Rights</h2>
            <p>Depending on where you live, you may have the following rights regarding your personal information:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information.</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information.</li>
              <li><strong>Portability:</strong> Request your data in a structured, machine-readable format.</li>
              <li><strong>Opt-out of sale:</strong> We do not sell personal information, so this right does not apply.</li>
            </ul>
            <p className="mt-3">
              <strong>California residents (CCPA):</strong> You have the right to know what personal information is collected, to request deletion, and to opt out of the sale of personal information. We do not sell personal information.
            </p>
            <p className="mt-3">
              <strong>Washington state residents (My Health MY Data Act / Washington Consumer Privacy Act):</strong> You have the right to access, correct, delete, and obtain a copy of your personal data, and to opt out of processing for certain purposes.
            </p>
            <p className="mt-3">
              To exercise any of these rights, email us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Security</h2>
            <p>
              We implement reasonable technical and organizational measures to protect your information, including encrypted connections (HTTPS/TLS), hashed password storage, rate limiting on all API endpoints, and JWT-based authentication with expiring tokens.
            </p>
            <p className="mt-3">
              No system is perfectly secure. If you believe your information has been compromised, please contact us immediately at <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Cookies and Tracking</h2>
            <p>
              Our platform uses essential cookies for authentication (session JWT tokens stored in localStorage). We do not use third-party advertising cookies or cross-site tracking cookies on tractifyhq.com.
            </p>
            <p className="mt-3">
              Individual contractor subdomains may load a Facebook Pixel for retargeting advertising. This is disclosed in the contractor's site experience. You may opt out of Facebook's ad tracking at facebook.com/settings/ads.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Children's Privacy</h2>
            <p>
              Our services are not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us and we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the effective date at the top. For material changes, we will notify active contractors by email. Continued use of our services after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Contact Us</h2>
            <p>For privacy-related questions, requests, or complaints:</p>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
              <p className="font-semibold text-gray-900">OMNIANCEGROUP LLC d/b/a Tractify</p>
              <p className="text-gray-600 mt-1">Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a></p>
              <p className="text-gray-600">Website: tractifyhq.com</p>
            </div>
          </section>

        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-white">Tractify</span>
          <p className="text-gray-500 text-sm">© {new Date().getFullYear()} OMNIANCEGROUP LLC. All rights reserved.</p>
          <div className="flex gap-5 text-sm text-gray-500">
            <a href="/privacy" className="text-white">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
