import { useNavigate } from 'react-router-dom';
import {
  Zap, CheckCircle, Clock, Users, ArrowRight,
  Star, Shield, TrendingUp, Calendar, Mail, Phone
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white w-full max-w-full overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-gray-900 text-base sm:text-lg">Tractify</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap"
            >
              <span className="hidden sm:inline">Contractor </span>Login
            </button>
            <button
              onClick={() => navigate('/get-quote')}
              className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Get a Free </span>Quote
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-purple-50 pt-14 pb-20 sm:pt-20 sm:pb-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-100/40 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative">
          <div className="inline-flex items-center gap-2 bg-brand-100 text-brand-700 text-xs sm:text-sm font-semibold px-3 py-1.5 sm:px-4 rounded-full mb-5 sm:mb-6">
            <Zap className="w-3.5 h-3.5" />
            Instant Lead Matching
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gray-900 mb-4 sm:mb-6 leading-tight tracking-tight">
            Home Services,<br />
            <span className="text-brand-500">Booked Instantly.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-500 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-2">
            Tractify connects homeowners with top local contractors in seconds — no phone calls, no waiting. Get matched, pick a time, done.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
            <button
              onClick={() => navigate('/get-quote')}
              className="btn-primary text-base px-8 py-3.5 shadow-lg shadow-brand-200"
            >
              Get a Free Quote <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="btn-secondary text-base px-8 py-3.5"
            >
              I'm a Contractor
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4 sm:mt-5">No credit card required · Takes 60 seconds</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-14 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">How it works</h2>
            <p className="text-gray-500 text-sm sm:text-base">From request to booked appointment in minutes</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Mail,
                title: 'Tell us what you need',
                desc: 'Fill out a quick form describing your project, location, and preferred timing.',
              },
              {
                step: '02',
                icon: Zap,
                title: 'Get instantly matched',
                desc: 'Our engine finds the best available contractor in your area for your specific job.',
              },
              {
                step: '03',
                icon: Calendar,
                title: 'Pick your time slot',
                desc: "Choose a time that works for you from the contractor's live availability. Done.",
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative flex md:block gap-4 items-start">
                <div className="flex items-center gap-3 mb-0 md:mb-4 shrink-0">
                  <div className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-4xl font-black text-gray-100 md:block hidden">{step}</span>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="py-14 md:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Services we cover</h2>
            <p className="text-gray-500 text-sm sm:text-base">Trusted professionals across all major home services</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              '🏠 Roofing', '❄️ HVAC', '⚡ Electrical', '🔧 Plumbing',
              '🎨 Painting', '🌿 Landscaping', '🪟 Windows', '🏗️ General Contractor',
            ].map(service => (
              <div key={service} className="bg-white rounded-2xl p-3 sm:p-4 text-center border border-gray-100 hover:border-brand-200 hover:shadow-sm transition-all text-xs sm:text-sm font-medium text-gray-700">
                {service}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY TRACTIFY ── */}
      <section className="py-14 md:py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-5 sm:mb-6">Why homeowners choose Tractify</h2>
              <div className="space-y-4 sm:space-y-5">
                {[
                  { icon: Clock, title: 'Instant matching', desc: 'No waiting days for a callback. Get matched in seconds.' },
                  { icon: Shield, title: 'Vetted contractors', desc: 'Every contractor on our platform is screened and reviewed.' },
                  { icon: TrendingUp, title: 'Real availability', desc: "Book directly into the contractor's live calendar. No double-booking." },
                  { icon: CheckCircle, title: 'Confirmation emails', desc: 'Both you and your contractor get instant confirmation with all the details.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3 sm:gap-4">
                    <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{title}</p>
                      <p className="text-gray-500 text-sm mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-brand-500 to-purple-600 rounded-3xl p-6 sm:p-8 text-white">
              <div className="flex items-center gap-1.5 mb-4 sm:mb-6">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300 fill-yellow-300" />
                ))}
              </div>
              <blockquote className="text-base sm:text-lg font-medium leading-relaxed mb-4 sm:mb-6">
                "I submitted my roofing request and had an appointment booked within 10 minutes. Incredible service."
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">S</div>
                <div>
                  <p className="font-semibold text-sm">Sarah M.</p>
                  <p className="text-white/70 text-xs">Homeowner · Seattle, WA</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR CONTRACTORS ── */}
      <section className="py-14 md:py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Are you a contractor?</h2>
            <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">Join Tractify and get qualified leads delivered straight to your calendar — no cold calling, no chasing.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
            {[
              { icon: Users, title: 'Qualified leads only', desc: 'Every lead has already said yes to your trade. No tire-kickers.' },
              { icon: Calendar, title: 'Automatic scheduling', desc: 'Homeowners book directly into your availability. You just show up.' },
              { icon: TrendingUp, title: 'Grow your business', desc: 'More bookings, less admin. Focus on the work, not the paperwork.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-brand-50 rounded-xl flex items-center justify-center mb-3 sm:mb-4">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1 sm:mb-2 text-sm sm:text-base">{title}</h3>
                <p className="text-gray-500 text-sm">{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <button
              onClick={() => navigate('/apply')}
              className="btn-primary text-base px-8 py-3.5"
            >
              Apply to Join <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-sm text-gray-400 mt-3">
              Already have an account?{' '}
              <button onClick={() => navigate('/login')} className="text-brand-500 font-semibold hover:underline">
                Sign in
              </button>
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-brand-500 to-purple-600">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 sm:mb-4">Ready to get started?</h2>
          <p className="text-brand-100 text-base sm:text-lg mb-8 sm:mb-10">Tell us about your project and we'll match you with the right contractor today.</p>
          <button
            onClick={() => navigate('/get-quote')}
            className="inline-flex items-center gap-2 bg-white text-brand-600 font-bold px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl hover:bg-brand-50 transition-all shadow-xl text-base sm:text-lg"
          >
            Get a Free Quote <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-gray-900 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-white">Tractify</span>
          </div>
          <p className="text-gray-500 text-sm">© {new Date().getFullYear()} Tractify. All rights reserved.</p>
          <div className="flex gap-5 text-sm text-gray-500">
            <a href="/get-quote" className="hover:text-white transition-colors">Get a Quote</a>
            <a href="/apply" className="hover:text-white transition-colors">Join as Contractor</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
