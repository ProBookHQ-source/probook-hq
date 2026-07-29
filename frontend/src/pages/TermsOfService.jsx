import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
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
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Effective date: {EFFECTIVE_DATE} · OMNIANCEGROUP LLC d/b/a Tractify</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Agreement to Terms</h2>
            <p>
              These Terms of Service ("Terms") govern your use of the Tractify platform and services provided by OMNIANCEGROUP LLC, a Washington state limited liability company ("Tractify," "we," "us," or "our"). By signing up for, accessing, or using our services, you agree to be bound by these Terms.
            </p>
            <p className="mt-3">
              If you are agreeing to these Terms on behalf of a business, you represent that you have the authority to bind that business to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Services</h2>
            <p>
              Tractify is a software-as-a-service (SaaS) platform that provides HVAC contractors and other home service professionals with:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>An online booking platform hosted on a Tractify subdomain (e.g., yourcompany.tractifyhq.com)</li>
              <li>Lead intake forms and homeowner-facing booking flows</li>
              <li>Missed call text-back automation via SMS</li>
              <li>Appointment management and calendar scheduling</li>
              <li>Email and SMS notifications to homeowners and contractors</li>
              <li>Multi-channel traffic and lead delivery during the free trial period</li>
            </ul>
            <p className="mt-3">
              Tractify is a technology platform. We are not a general contractor, HVAC technician, home services company, or licensed service provider. We do not perform any of the services booked through our platform. The relationship and any agreements regarding the actual service work are solely between the contractor and the homeowner.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Free Trial</h2>
            <p>
              Tractify offers a free trial for qualifying contractors. The free trial includes:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>A fully deployed booking website on a Tractify subdomain</li>
              <li>Access to all platform features during the trial period</li>
              <li>Traffic and lead delivery via Tractify's multi-channel system</li>
            </ul>
            <p className="mt-3">
              <strong>Important:</strong> The free trial is defined as the delivery of up to <strong>5 confirmed bookings</strong> (appointments scheduled through the platform) — not 5 completed or closed jobs. A "booking" occurs when a homeowner selects a time slot and confirms an appointment via the Tractify platform. Whether that appointment results in a completed service or revenue is outside Tractify's control.
            </p>
            <p className="mt-3">
              We make reasonable efforts to deliver trial bookings through paid advertising, missed call automation, and other channels. We do not guarantee a specific number of bookings within a specific timeframe, as results depend on factors including contractor availability, service area, response rates, and market conditions.
            </p>
            <p className="mt-3">
              Tractify reserves the right to modify or discontinue the free trial offer at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Paid Services and Payment Terms</h2>
            <p>
              After the free trial concludes (at or around 5 confirmed bookings), continued use of the Tractify platform requires payment:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Setup fee:</strong> $2,000 (one-time, non-refundable after platform deployment and activation)</li>
              <li><strong>Monthly retainer:</strong> $800/month (subject to increase based on services and market tier after the initial period)</li>
            </ul>
            <p className="mt-3">
              Payment is processed via Stripe. By providing payment information, you authorize Tractify to charge the applicable fees. All fees are in USD. Failure to pay within 7 days of a due invoice may result in suspension of services.
            </p>
            <p className="mt-3">
              Monthly retainers are billed in advance on a recurring basis. You may cancel at any time with 30 days written notice to <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a>. No refunds are provided for partial billing periods.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Contractor Responsibilities</h2>
            <p>By using Tractify, you agree to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Maintain all required business licenses, insurance, and certifications for your trade and service area</li>
              <li>Honor appointments booked through the platform and contact homeowners promptly if an appointment must be cancelled</li>
              <li>Keep your availability calendar current to prevent double-bookings</li>
              <li>Respond to homeowners in a professional and timely manner</li>
              <li>Not use the platform for unlawful, deceptive, or misleading practices</li>
              <li>Comply with all applicable federal, state, and local laws governing your business</li>
              <li>Obtain any required consents before uploading customer lists for SMS campaigns</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. SMS and Communications Compliance</h2>
            <p>
              Tractify's SMS features (missed call text-back, appointment reminders, and booking links) are sent to homeowners who have submitted a service request or called the contractor's forwarded number. By using these features, contractors represent that they understand and agree to comply with:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>The Telephone Consumer Protection Act (TCPA)</li>
              <li>CTIA Messaging Principles and Best Practices</li>
              <li>All applicable carrier guidelines</li>
            </ul>
            <p className="mt-3">
              Tractify is not responsible for TCPA violations arising from a contractor's own customer lists or unsolicited outbound messaging initiated outside of the platform's automated flows.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Intellectual Property</h2>
            <p>
              Tractify and its licensors retain all rights to the platform software, booking system, and associated technology. You retain ownership of your business name, logo, and content you provide.
            </p>
            <p className="mt-3">
              You grant Tractify a limited license to use your business name, logo, and publicly available information (including Google reviews) to populate and operate your contractor site on our platform.
            </p>
            <p className="mt-3">
              Your booking history, customer data, and appointment records generated through the platform belong to you. If you cancel your account, we will provide a data export upon request within 30 days of cancellation. After 60 days, data may be deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Disclaimer of Warranties</h2>
            <p className="uppercase text-sm font-semibold text-gray-500 mb-2">Important — please read carefully</p>
            <p>
              THE TRACTIFY PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="mt-3">
              WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE. WE DO NOT GUARANTEE ANY SPECIFIC NUMBER OF LEADS, BOOKINGS, COMPLETED JOBS, OR REVENUE THROUGH OUR PLATFORM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Limitation of Liability</h2>
            <p className="uppercase text-sm font-semibold text-gray-500 mb-2">Important — please read carefully</p>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OMNIANCEGROUP LLC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST REVENUE, LOST DATA, OR BUSINESS INTERRUPTION, ARISING FROM OR RELATED TO YOUR USE OF THE TRACTIFY PLATFORM, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-3">
              OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE PLATFORM SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO TRACTIFY IN THE 3 MONTHS PRIOR TO THE CLAIM, OR (B) $100.
            </p>
            <p className="mt-3">
              SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES OR LIMITATION OF LIABILITY FOR CONSEQUENTIAL DAMAGES, SO THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU IN FULL.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless OMNIANCEGROUP LLC and its officers, directors, employees, and agents from and against any claims, damages, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from: (a) your use of the platform; (b) your violation of these Terms; (c) your violation of any third-party rights or applicable law; or (d) any dispute between you and a homeowner regarding services you provided.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Termination</h2>
            <p>
              Either party may terminate the service relationship at any time with 30 days written notice. Tractify may suspend or terminate your account immediately without notice for: material breach of these Terms, non-payment, illegal activity, or conduct that threatens the integrity of the platform or the safety of other users.
            </p>
            <p className="mt-3">
              Upon termination: your subdomain and booking site will be deactivated, your Twilio number may be released and reassigned, and your access to the contractor portal will be revoked. No refund will be issued for fees already paid.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Dispute Resolution</h2>
            <p>
              We encourage you to contact us first at <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 hover:underline">{CONTACT_EMAIL}</a> with any concern. Most issues can be resolved quickly and informally.
            </p>
            <p className="mt-3">
              Any dispute that cannot be resolved informally shall be submitted to binding arbitration under the rules of the American Arbitration Association (AAA), conducted in Washington state. You waive the right to a jury trial and the right to participate in a class action lawsuit related to our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">13. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Washington, without regard to conflict of law principles. Any legal proceedings not subject to arbitration shall be brought in the state or federal courts located in Washington state.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">14. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify active contractors of material changes by email at least 14 days before they take effect. Continued use of the platform after changes take effect constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">15. Contact</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm mt-3">
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
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms" className="text-white">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
