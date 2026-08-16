import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, PhoneCall, MessageSquare, CalendarCheck,
  Smartphone, LayoutGrid, KeyRound, CheckCircle2,
} from 'lucide-react';

// ── Reusable line-art SVGs — hand-drawn in the same thin white-stroke style
// used throughout the pitch deck, built fresh rather than reusing the deck's
// stock photography (per Jose's explicit instruction). ─────────────────────

// Fades + rises a section into view the first time it crosses the viewport —
// cheap, dependency-free scroll animation via IntersectionObserver.
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

// Card wrapper for the full-color unDraw illustrations Jose uploaded — keeps
// them readable whether they're sitting on the indigo gradient (white card +
// glow) or inside one of the white section panels (soft brand-tinted card,
// since a white card on white background would just disappear).
function Illustration({ src, alt, className = '', imgClassName = 'w-full h-auto', light = false }) {
  return (
    <div className={`relative ${className}`}>
      {!light && <div className="glow-orb w-2/3 h-2/3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/25" />}
      <div
        className={
          light
            ? 'relative bg-brand-50 border border-brand-100 rounded-3xl p-6 sm:p-8'
            : 'relative bg-white rounded-3xl shadow-2xl shadow-brand-900/30 p-6 sm:p-8'
        }
      >
        <img src={src} alt={alt} className={imgClassName} />
      </div>
    </div>
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The actual product demo — a phone mockup that plays out a real Brain 3
// missed-call-to-booked-job text exchange on a loop. Lives in the hero where
// the static phone illustration used to be, so visitors see the thing work
// instead of reading a description of it.
const SMS_CONVO = [
  { from: 'system', text: '📵 Missed call — (206) 555-0182' },
  { from: 'ai', text: "Hey! Sorry we missed you at Premier Comfort HVAC — I'm their scheduling assistant. What's the address that needs service?" },
  { from: 'homeowner', text: '1234 Maple Ave, Bellevue' },
  { from: 'ai', text: "Got it. What's going on — heating or cooling?" },
  { from: 'homeowner', text: "AC isn't cooling the house" },
  { from: 'ai', text: 'Mike has openings Tue 10am, Tue 2pm, or Wed 9am. Which works best?' },
  { from: 'homeowner', text: 'Tuesday 2pm' },
  { from: 'ai', text: "You're booked! Mike will be there Tuesday at 2pm. 🎉" },
];

function SmsDemo({ className = '' }) {
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      while (!cancelled) {
        for (let i = 0; i < SMS_CONVO.length; i++) {
          if (cancelled) return;
          const msg = SMS_CONVO[i];
          if (msg.from === 'ai') {
            setTyping(true);
            await sleep(900 + Math.random() * 400);
            if (cancelled) return;
            setTyping(false);
          } else {
            await sleep(500);
          }
          if (cancelled) return;
          setCount(i + 1);
          await sleep(700);
        }
        await sleep(2800);
        if (cancelled) return;
        setCount(0);
        setTyping(false);
        await sleep(700);
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [count, typing]);

  const visible = SMS_CONVO.slice(0, count);

  return (
    <div className={`relative ${className}`}>
      <div className="glow-orb w-64 h-64 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/15" />
      <div className="relative mx-auto w-56 sm:w-72 md:w-80">
        <div className="relative rounded-[2.5rem] border-[10px] border-[#1f1d3a] bg-[#1f1d3a] shadow-2xl shadow-brand-900/40">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-20 h-5 bg-[#1f1d3a] rounded-b-2xl z-10" />
          <div
            ref={scrollRef}
            className="scrollbar-none h-[360px] sm:h-[440px] md:h-[480px] bg-white rounded-[1.75rem] overflow-y-auto px-3 pt-8 pb-3 flex flex-col gap-2"
          >
            {visible.map((m, i) =>
              m.from === 'system' ? (
                <div key={i} className="text-center text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wide py-1">
                  {m.text}
                </div>
              ) : (
                <div
                  key={i}
                  className={`max-w-[82%] px-3 py-2 rounded-2xl text-[11px] sm:text-xs leading-snug ${
                    m.from === 'ai'
                      ? 'self-end bg-brand-500 text-white rounded-br-sm'
                      : 'self-start bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              )
            )}
            {typing && (
              <div className="self-end bg-brand-500/70 px-3 py-2.5 rounded-2xl rounded-br-sm flex gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
              </div>
            )}
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/80 text-[10px] sm:text-xs font-semibold px-3 py-1.5 rounded-full mt-4 mx-auto w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Live example — no client info used
        </div>
      </div>
    </div>
  );
}

// Animated trial tracker for "Proof Before You Pay" — jobs land one at a time
// until the trial hits 5, then a "trial complete, $0 charged" state holds
// before looping. Same idea as the hero SMS demo: show the mechanism instead
// of describing it.
const TRIAL_JOBS = [
  { job: 'AC Repair', place: 'Bellevue, WA' },
  { job: 'Furnace Tune-Up', place: 'Renton, WA' },
  { job: 'Duct Cleaning', place: 'Kirkland, WA' },
  { job: 'Heat Pump Install', place: 'Redmond, WA' },
  { job: 'AC Repair', place: 'Tacoma, WA' },
];

function TrialTracker({ className = '' }) {
  const [count, setCount] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      while (!cancelled) {
        for (let i = 0; i < TRIAL_JOBS.length; i++) {
          if (cancelled) return;
          await sleep(1100);
          if (cancelled) return;
          setCount(i + 1);
        }
        await sleep(700);
        if (cancelled) return;
        setComplete(true);
        await sleep(3200);
        if (cancelled) return;
        setComplete(false);
        setCount(0);
        await sleep(600);
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <div className="glow-orb w-2/3 h-2/3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-brand-100/60" />
      <div className="relative bg-white rounded-3xl shadow-2xl shadow-brand-900/30 p-6 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <p className="text-brand-900 font-bold text-sm">Sample trial timeline</p>
          <p className="font-display text-brand-500 text-lg tracking-tight">{count}<span className="text-gray-300">/5</span></p>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${(count / TRIAL_JOBS.length) * 100}%` }}
          />
        </div>
        <div className="space-y-2">
          {TRIAL_JOBS.map((j, i) => {
            const done = i < count;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all duration-500 ${
                  done ? 'bg-brand-50 border-brand-100 opacity-100 translate-x-0' : 'bg-gray-50 border-gray-100 opacity-40 -translate-x-1'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-brand-500' : 'bg-gray-200'}`}>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </div>
                <div className="min-w-0">
                  <p className="text-gray-800 text-xs font-semibold truncate">Appointment {i + 1} — {j.job}</p>
                  <p className="text-gray-400 text-[10px]">{j.place}</p>
                </div>
              </div>
            );
          })}
        </div>
        {complete && (
          <div className="mt-4 flex items-center gap-2 bg-brand-500 text-white text-xs font-bold px-3 py-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Trial complete — $0 charged
          </div>
        )}
      </div>
      <p className="text-gray-400 text-[10px] text-center mt-3">
        Example for illustration — actual jobs are booked appointments and vary by niche and market.
      </p>
    </div>
  );
}

function PeopleArt({ className }) {
  return (
    <svg viewBox="0 0 320 220" fill="none" className={className}>
      <g stroke="white" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="160" cy="185" rx="120" ry="14" />
        {[70, 160, 250].map((cx, i) => (
          <g key={i}>
            <circle cx={cx} cy="60" r="22" />
            <path d={`M ${cx - 34} 150 Q ${cx - 34} 100 ${cx} 96 Q ${cx + 34} 100 ${cx + 34} 150 L ${cx + 34} 185 L ${cx - 34} 185 Z`} />
          </g>
        ))}
        <rect x="40" y="150" width="240" height="14" rx="2" strokeOpacity="0.6" />
      </g>
    </svg>
  );
}

// ── Small shared building blocks ────────────────────────────────────────────

function Eyebrow({ children, dark = false }) {
  return (
    <p className={`text-[11px] sm:text-xs font-bold tracking-[0.15em] uppercase ${dark ? 'text-brand-500' : 'text-white/70'}`}>
      {children}
    </p>
  );
}

function PageNumber({ n, dark = false }) {
  return (
    <span className={`font-display text-2xl sm:text-3xl tracking-tight ${dark ? 'text-brand-100' : 'text-white/50'}`}>
      ({n})
    </span>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden bg-tractify-gradient">
      <div className="bg-grain" />

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-50 bg-white/5 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-lg" />
            <span className="font-display text-white text-base sm:text-lg tracking-tight">TRACTIFY</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => navigate('/waitlist')}
              className="inline-flex items-center gap-2 bg-white text-brand-700 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-brand-50 transition-all shadow-sm whitespace-nowrap"
            >
              Join the Waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO (cover) ── */}
      <section className="relative pt-16 pb-14 sm:pt-24 sm:pb-16 px-4 sm:px-6 overflow-hidden">
        <div className="glow-orb w-[28rem] h-[28rem] -top-24 -left-24 bg-white/10" />
        <div className="glow-orb w-96 h-96 top-10 right-0 bg-brand-300/25" />
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center relative">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-full mb-7 sm:mb-9">
              Bringing billion-dollar solutions to everyday contractors
            </div>
            <h1 className="font-display text-white text-5xl sm:text-7xl leading-[0.95] tracking-tight mb-6 sm:mb-8">
              STOP MISSING<br />CALLS.
            </h1>
            <p className="text-white/80 text-base sm:text-xl max-w-xl mx-auto md:mx-0 leading-relaxed mb-9 sm:mb-11">
              Tractify captures every missed call, texts the homeowner back, and books the job
              straight onto your calendar — automatically. No app. No dashboard. No login required.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start">
              <button
                onClick={() => navigate('/waitlist')}
                className="btn-sheen inline-flex items-center justify-center gap-2 bg-white text-brand-700 text-base font-bold px-8 py-3.5 rounded-xl hover:shadow-xl shadow-lg shadow-brand-900/30"
              >
                Join the Waitlist <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <p className="text-white/50 text-xs sm:text-sm mt-5">
              Your first 5 booked jobs are free — no card required to start.
            </p>
          </div>
          <SmsDemo />
        </div>
      </section>

      {/* ── STAT STRIP ── */}
      <Reveal>
        <section className="relative px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-5xl mx-auto grid grid-cols-3 divide-x divide-white/15 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
            {[
              { value: '5', label: 'Free booked jobs' },
              { value: '60 sec', label: 'Missed-call response' },
              { value: '0', label: 'Apps or logins' },
            ].map(({ value, label }) => (
              <div key={label} className="text-center px-3 py-6 sm:py-8">
                <p className="font-display text-white text-3xl sm:text-4xl tracking-tight mb-1">{value}</p>
                <p className="text-white/60 text-[11px] sm:text-xs font-semibold uppercase tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── (01) WHO WE ARE ── */}
      <Reveal>
        <section className="relative border-t border-white/10 px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-80 h-80 -bottom-20 -right-20 bg-brand-400/20" />
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center relative">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <PageNumber n="01" />
                <Eyebrow>Who We Are</Eyebrow>
              </div>
              <h2 className="font-display text-white text-3xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
                WHO<br />WE ARE
              </h2>
              <p className="text-white/75 text-sm sm:text-base leading-relaxed mb-8 max-w-lg">
                Tractify exists because contractors were losing jobs to a missed phone call.
                We built a system that captures every missed call, texts the homeowner back,
                and books the job straight onto the calendar — automatically, with no app,
                no dashboard, and no login required.
              </p>
              <div className="space-y-4 max-w-md">
                <div className="border-t border-white/15 pt-3">
                  <p className="text-white text-xs font-bold uppercase tracking-wide mb-1">Mission</p>
                  <p className="text-white/70 text-sm">Turn every missed call into a booked job.</p>
                </div>
                <div className="border-t border-white/15 pt-3">
                  <p className="text-white text-xs font-bold uppercase tracking-wide mb-1">Vision</p>
                  <p className="text-white/70 text-sm">Become the booking layer for every home service contractor in America.</p>
                </div>
              </div>
            </div>
            <PeopleArt className="w-full max-w-md mx-auto opacity-90" />
          </div>
        </section>
      </Reveal>

      {/* ── (02) MARKET INSIGHT — white panel ── */}
      <Reveal>
        <section className="relative bg-white px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-96 h-96 -top-32 left-1/2 -translate-x-1/2 bg-brand-100/60" />
          <div className="max-w-4xl mx-auto text-center relative">
            <div className="flex items-center justify-center gap-4 mb-4">
              <PageNumber n="02" dark />
              <Eyebrow dark>Market Insight</Eyebrow>
            </div>
            <h2 className="font-display text-brand-900 text-3xl sm:text-5xl leading-[1.05] tracking-tight mb-5">
              A MISSED CALL TODAY IS A BOOKED JOB FOR YOUR COMPETITOR TOMORROW.
            </h2>
            <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
              Customers don't wait. If a business doesn't answer, they call the next name on
              the list within minutes. Tractify closes that gap automatically — every missed
              call gets a reply before the customer ever picks up the phone again.
            </p>
          </div>
        </section>
      </Reveal>

      {/* ── (03) WHAT WE DO ── */}
      <Reveal>
        <section className="border-t border-white/10 px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center mb-12">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <PageNumber n="03" />
                  <Eyebrow>Services We Offer</Eyebrow>
                </div>
                <h2 className="font-display text-white text-3xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
                  SERVICES<br />WE OFFER
                </h2>
                <p className="text-white/75 text-sm sm:text-base leading-relaxed max-w-lg">
                  From the first missed call to the final booked appointment, Tractify runs the
                  entire pipeline automatically — over text message, with zero dashboard required.
                </p>
              </div>
              <Illustration
                src="/illustrations/undraw_booking_8vl5.svg"
                alt="Booking an appointment"
                className="w-full max-w-md mx-auto"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { icon: PhoneCall, title: 'Missed Call Text-Back', desc: 'Every missed call triggers an instant, friendly text — before the homeowner ever calls your competitor.' },
                { icon: MessageSquare, title: 'SMS Booking', desc: 'The homeowner picks a time right in the text thread. No link, no app, no waiting on hold.' },
                { icon: CalendarCheck, title: 'Calendar Automation', desc: 'The job lands straight on your calendar, confirmed — you just show up.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="group bg-white/10 border border-white/15 rounded-2xl p-6 backdrop-blur-sm transition-all hover:bg-white/15 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-900/20">
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center mb-4 transition-colors group-hover:bg-white/25">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-white font-bold text-sm mb-2 tracking-tight">{title}</p>
                  <p className="text-white/70 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── (04) WHY TRACTIFY — white panel, breaks up the blue ── */}
      <Reveal>
        <section className="relative bg-white px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-96 h-96 -top-32 right-0 bg-brand-100/60" />
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center relative">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <PageNumber n="04" dark />
                <Eyebrow dark>Why Tractify</Eyebrow>
              </div>
              <h2 className="font-display text-brand-900 text-3xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
                WHY<br />TRACTIFY
              </h2>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-lg">
                Every business owner we talk to says the same thing: "I'm too busy doing jobs to
                spend the day chained to a phone." What sets Tractify apart is a system built
                entirely around text message — no app, no login, no learning curve — so booked
                jobs show up without changing how a business already works.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {[
                { icon: Smartphone, label: 'No app' },
                { icon: LayoutGrid, label: 'No dashboard' },
                { icon: KeyRound, label: 'No login' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="bg-brand-50 border border-brand-100 rounded-2xl p-5 flex flex-col items-center text-center gap-3 transition-all hover:bg-brand-100/70 hover:-translate-y-1">
                  <Icon className="w-7 h-7 text-brand-500" />
                  <p className="text-gray-700 text-xs font-semibold">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── (05) OUR TEAM ── */}
      <Reveal>
        <section className="border-t border-white/10 px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-4 mb-4">
              <PageNumber n="05" />
              <Eyebrow>The Team Behind The System</Eyebrow>
            </div>
            <h2 className="font-display text-white text-3xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
              OUR TEAM
            </h2>
            <p className="text-white/75 text-sm sm:text-base leading-relaxed mb-12 max-w-2xl">
              Two founders and a system that runs the backend. Jose owns product and strategy.
              Daniel owns content and growth. That's the entire team it takes to book jobs for
              contractors nationwide.
            </p>
            <div className="grid sm:grid-cols-2 gap-5 max-w-xl">
              {[
                { photo: '/team/jose.jpg', name: 'Jose', role: 'Product & Strategy', ratio: '4 / 5' },
                { photo: '/team/daniel.png', name: 'Daniel', role: 'Content & Growth', ratio: '4 / 5' },
              ].map(({ photo, name, role, ratio }) => (
                <div key={name} className="bg-white/10 border border-white/15 rounded-2xl overflow-hidden transition-all hover:bg-white/15 hover:-translate-y-1">
                  <div className="bg-black/20" style={{ aspectRatio: ratio }}>
                    <img src={photo} alt={name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-5">
                    <p className="text-white font-bold text-base">{name}</p>
                    <p className="text-white/60 text-xs font-semibold uppercase tracking-wide">{role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>

      {/* ── (06) PROOF BEFORE YOU PAY — white panel ── */}
      <Reveal>
        <section className="relative bg-white px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-96 h-96 top-0 -left-32 bg-brand-100/60" />
          <div className="max-w-6xl mx-auto grid md:grid-cols-[1.15fr_0.85fr] gap-10 md:gap-14 items-center relative">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
                <PageNumber n="06" dark />
                <Eyebrow dark>Proof Before You Pay</Eyebrow>
              </div>
              <h2 className="font-display text-brand-900 text-3xl sm:text-5xl leading-[1.02] tracking-tight mb-5">
                PROOF<br />BEFORE<br />YOU PAY
              </h2>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-lg mx-auto md:mx-0 mb-8">
                Every new contractor gets 5 booked jobs completely free. Proof before a dollar
                changes hands.
              </p>
              <div className="flex items-center justify-center md:justify-start gap-5">
                <span className="font-display text-brand-700 text-7xl sm:text-8xl leading-none">5</span>
                <span className="text-brand-900 font-bold text-lg sm:text-xl uppercase tracking-wide leading-tight max-w-[8rem]">
                  Free<br />Booked<br />Jobs!
                </span>
              </div>
            </div>
            <TrialTracker className="w-full max-w-xs mx-auto" />
          </div>
        </section>
      </Reveal>

      {/* ── (07) PERFORMANCE ── */}
      <Reveal>
        <section className="relative border-t border-white/10 px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-96 h-96 -bottom-32 -left-20 bg-brand-300/20" />
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center relative">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <PageNumber n="07" />
                <Eyebrow>Our Performance</Eyebrow>
              </div>
              <h2 className="font-display text-white text-2xl sm:text-4xl leading-[1.05] tracking-tight mb-6">
                TRACTIFY IS BUILT TO PUT BOOKED JOBS ON YOUR CALENDAR WITHIN DAYS OF SIGNING UP — NOT MONTHS.
              </h2>
              <p className="text-white/60 text-xs font-bold uppercase tracking-wide mb-4">By the numbers:</p>
              <div className="space-y-3 max-w-lg">
                {[
                  '5 free booked jobs before any money changes hands',
                  '0 apps, logins, or dashboards required to get started',
                  'Missed calls answered by text in under 60 seconds',
                ].map(item => (
                  <div key={item} className="flex items-start gap-3 border-t border-white/15 pt-3">
                    <CheckCircle2 className="w-4 h-4 text-white/70 shrink-0 mt-0.5" />
                    <p className="text-white/80 text-sm">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <Illustration
              src="/illustrations/undraw_ai-data-extraction_soxc.svg"
              alt="Automated data and reporting"
              className="w-full max-w-md mx-auto"
            />
          </div>
        </section>
      </Reveal>

      {/* ── (08) WHAT'S NEXT — white panel ── */}
      <Reveal>
        <section className="relative bg-white px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div className="glow-orb w-96 h-96 -top-20 right-0 bg-brand-100/60" />
          <div className="max-w-6xl mx-auto relative">
            <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center mb-12">
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <PageNumber n="08" dark />
                  <Eyebrow dark>What's Next For Tractify</Eyebrow>
                </div>
                <h2 className="font-display text-brand-900 text-3xl sm:text-5xl leading-[1.02] tracking-tight">
                  WHAT'S NEXT<br />FOR TRACTIFY
                </h2>
              </div>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-lg">
                We're expanding beyond HVAC into plumbing, electrical, roofing, landscaping, and
                more — same system, same promise. The goal: the default way every home service
                business gets booked.
              </p>
            </div>
            <Illustration
              src="/illustrations/undraw_under-construction_hdrn.svg"
              alt="Expanding to new trades"
              className="max-w-2xl mx-auto"
              imgClassName="w-full h-auto max-h-40"
              light
            />
          </div>
        </section>
      </Reveal>

      {/* ── CLOSING CTA ── */}
      <Reveal>
        <section className="relative border-t border-white/10 px-4 sm:px-6 py-20 sm:py-32 overflow-hidden">
          <div className="glow-orb w-[32rem] h-[32rem] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/10" />
          <div className="max-w-3xl mx-auto mb-12 relative">
            <Illustration
              src="/illustrations/undraw_under-construction_c2y1.svg"
              alt="Contractor at work"
              className="max-w-sm mx-auto"
            />
          </div>
          <div className="max-w-5xl mx-auto text-center relative">
            <h2 className="font-display text-white text-4xl sm:text-6xl md:text-7xl leading-[0.98] tracking-tight mb-9">
              STOP MISSING CALLS.<br />START BOOKING JOBS.
            </h2>
            <button
              onClick={() => navigate('/waitlist')}
              className="btn-sheen inline-flex items-center justify-center gap-2 bg-white text-brand-700 text-base font-bold px-8 py-3.5 rounded-xl hover:shadow-xl shadow-lg shadow-brand-900/30"
            >
              Join the Waitlist <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      </Reveal>

      {/* ── FOOTER ── */}
      <footer className="relative border-t border-white/10 px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-7 h-7 rounded-lg" />
            <span className="font-display text-white text-sm tracking-tight">TRACTIFY</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-white/60">
            <button onClick={() => navigate('/waitlist')} className="hover:text-white transition-colors">Waitlist</button>
            <button onClick={() => navigate('/login')} className="hover:text-white transition-colors">Contractor Login</button>
            <button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors">Privacy</button>
            <button onClick={() => navigate('/terms')} className="hover:text-white transition-colors">Terms</button>
            <a href="mailto:support@tractifyhq.com" className="hover:text-white transition-colors">support@tractifyhq.com</a>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} OMNIANCEGROUP LLC</p>
        </div>
      </footer>
    </div>
  );
}
