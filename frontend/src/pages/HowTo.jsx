import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CODE = '**61*+14256713861*11*20#';

const STEPS = [
  'We text you the forwarding code by itself, no other instructions mixed in.',
  'Press and hold the code, tap Copy.',
  'Open your Phone app, tap the Keypad tab.',
  'Tap and hold the number field until "Paste" pops up, then tap Paste.',
  'Tap the green call button. It connects for a second then hangs up on its own — that\'s normal, that means it worked.',
];

function CallForwardingDemo() {
  const [view, setView] = useState('messages'); // 'messages' | 'keypad'
  const [msgStep, setMsgStep] = useState(0); // 0 none, 1 explanation shown, 2 code shown
  const [typing, setTyping] = useState(false);
  const [showCopyTip, setShowCopyTip] = useState(false);
  const [showCopiedBadge, setShowCopiedBadge] = useState(false);
  const [dialField, setDialField] = useState('');
  const [showPasteTip, setShowPasteTip] = useState(false);
  const [callState, setCallState] = useState('idle'); // idle | dialing | connected | ended
  const [showConfirm, setShowConfirm] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      while (!cancelled) {
        // reset
        setView('messages');
        setMsgStep(0);
        setTyping(false);
        setShowCopyTip(false);
        setShowCopiedBadge(false);
        setDialField('');
        setShowPasteTip(false);
        setCallState('idle');
        setShowConfirm(false);
        await sleep(600);
        if (cancelled) return;

        // explanation bubble arrives
        setTyping(true);
        await sleep(1000);
        if (cancelled) return;
        setTyping(false);
        setMsgStep(1);
        await sleep(1000);
        if (cancelled) return;

        // bare code arrives as its own message
        setTyping(true);
        await sleep(900);
        if (cancelled) return;
        setTyping(false);
        setMsgStep(2);
        await sleep(800);
        if (cancelled) return;

        // long-press to copy
        setShowCopyTip(true);
        await sleep(1400);
        if (cancelled) return;
        setShowCopyTip(false);
        setShowCopiedBadge(true);
        await sleep(900);
        if (cancelled) return;
        setShowCopiedBadge(false);
        await sleep(400);
        if (cancelled) return;

        // switch to Phone app / keypad
        setView('keypad');
        await sleep(700);
        if (cancelled) return;

        // paste
        setShowPasteTip(true);
        await sleep(900);
        if (cancelled) return;
        setShowPasteTip(false);
        setDialField(CODE);
        await sleep(900);
        if (cancelled) return;

        // call it
        setCallState('dialing');
        await sleep(1400);
        if (cancelled) return;
        setCallState('connected');
        await sleep(1000);
        if (cancelled) return;
        setCallState('ended');
        await sleep(900);
        if (cancelled) return;

        // back to messages for confirmation
        setView('messages');
        setDialField('');
        setCallState('idle');
        await sleep(700);
        if (cancelled) return;

        setTyping(true);
        await sleep(900);
        if (cancelled) return;
        setTyping(false);
        setShowConfirm(true);
        await sleep(2800);
        if (cancelled) return;
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgStep, typing, showConfirm]);

  return (
    <div className="relative mx-auto w-64 sm:w-80">
      <div className="glow-orb w-72 h-72 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-brand-400/20 absolute -z-10" />
      <div className="relative rounded-[2.5rem] border-[10px] border-[#1f1d3a] bg-[#1f1d3a] shadow-2xl shadow-brand-900/40">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-20 h-5 bg-[#1f1d3a] rounded-b-2xl z-20" />
        <div className="relative h-[460px] sm:h-[520px] bg-white rounded-[1.75rem] overflow-hidden">

          {/* MESSAGES VIEW */}
          <div
            className={`absolute inset-0 flex flex-col transition-all duration-500 ease-out ${
              view === 'messages' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            <div className="pt-8 pb-2 px-4 text-center border-b border-gray-100">
              <div className="text-[11px] font-semibold text-gray-700">Tractify</div>
              <div className="text-[9px] text-gray-400">SMS</div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none px-3 py-3 flex flex-col gap-2">
              {msgStep >= 1 && (
                <div className="relative max-w-[85%] self-start bg-gray-100 text-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm text-[11px] leading-snug">
                  Here's exactly what to do. In a few seconds I'll text you a code by itself — once it lands, press and hold on it and tap Copy.
                </div>
              )}
              {msgStep >= 2 && (
                <div className="relative max-w-[85%] self-start">
                  <div className="bg-gray-100 text-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm text-[11px] font-mono leading-snug break-all">
                    {CODE}
                  </div>
                  {showCopyTip && (
                    <div className="absolute -top-9 left-2 bg-[#2c2c2e] text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg shadow-lg">
                      Copy
                      <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[#2c2c2e] rotate-45" />
                    </div>
                  )}
                  {showCopiedBadge && (
                    <div className="absolute -top-9 left-2 bg-green-600 text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1">
                      <span>✓</span> Copied
                    </div>
                  )}
                </div>
              )}
              {typing && (
                <div className="self-start bg-gray-100/80 px-3 py-2.5 rounded-2xl rounded-bl-sm flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                </div>
              )}
              {showConfirm && (
                <div className="max-w-[70%] self-end bg-green-500 text-white px-3 py-2 rounded-2xl rounded-br-sm text-[11px] font-semibold">
                  DONE
                </div>
              )}
            </div>
          </div>

          {/* KEYPAD VIEW */}
          <div
            className={`absolute inset-0 flex flex-col transition-all duration-500 ease-out ${
              view === 'keypad' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            <div className="pt-8 pb-1 px-4 text-center">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Keypad</div>
            </div>

            <div className="relative flex flex-col items-center justify-center py-4 min-h-[54px]">
              {showPasteTip && (
                <div className="absolute -top-1 bg-[#2c2c2e] text-white text-[10px] font-semibold px-3 py-1.5 rounded-lg shadow-lg z-10">
                  Paste
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2c2c2e] rotate-45" />
                </div>
              )}
              <div className="text-gray-800 font-mono text-[13px] sm:text-sm px-4 text-center break-all min-h-[20px]">
                {dialField || <span className="inline-block w-[2px] h-4 bg-brand-500 animate-pulse align-middle" />}
              </div>
              {callState !== 'idle' && (
                <div className="text-[10px] text-gray-400 mt-1">
                  {callState === 'dialing' && 'Calling Tractify Line…'}
                  {callState === 'connected' && '00:02'}
                  {callState === 'ended' && 'Call Ended'}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 px-6 mt-1">
              {['1','2','3','4','5','6','7','8','9','*','0','#'].map((k) => (
                <div
                  key={k}
                  className="aspect-square rounded-full bg-gray-100 flex items-center justify-center text-gray-800 text-sm font-medium"
                >
                  {k}
                </div>
              ))}
            </div>

            <div className="flex-1 flex items-start justify-center pt-4">
              <div className="relative">
                {callState === 'dialing' && (
                  <span className="absolute inset-0 rounded-full bg-green-500/50 animate-ping" />
                )}
                <div
                  className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-colors duration-300 ${
                    callState === 'ended' ? 'bg-gray-300' : 'bg-green-500'
                  }`}
                >
                  📞
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function HowTo() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-xl" />
            <span className="font-display font-black text-gray-900 tracking-tight">TRACTIFY</span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            How it works
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Setting up call forwarding.
          </h1>
          <p className="text-gray-600 text-lg mb-8">
            This is the exact same walkthrough Tractify texts you during setup — copy the code, paste it into your dialer, tap call. It hangs up on its own, that's normal.
          </p>
          <ol className="space-y-4">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-gray-700 text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <CallForwardingDemo />
      </div>
    </div>
  );
}
