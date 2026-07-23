import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, addDays, startOfWeek, parseISO,
  isBefore, startOfDay, startOfMonth, endOfMonth, addMonths,
  getDaysInMonth, getDay,
} from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import { formatPhone } from '../utils/formatPhone';
import {
  Calendar, Clock, CheckCircle, XCircle, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, Phone, Mail,
  Link as LinkIcon, Settings, Lock, User, Ban, CalendarPlus, Trash2,
  Home, Plus, X, Eye, EyeOff, ListChecks, ExternalLink, Copy,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 7; // 7 AM – 7 PM
  return `${String(h).padStart(2, '0')}:00`;
});
// 4:00 AM → 10:00 PM in 30-min increments (37 slots)
const TIME_OPTIONS = Array.from({ length: 37 }, (_, i) => {
  const totalMin = 4 * 60 + i * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

const APPT_COLORS = {
  confirmed: { block: 'bg-brand-500 text-white',        dot: 'bg-brand-500', label: 'text-brand-600', badge: 'bg-brand-50 text-brand-700' },
  completed: { block: 'bg-gray-400 text-white',          dot: 'bg-gray-400',  label: 'text-gray-500',  badge: 'bg-gray-100 text-gray-500'  },
  cancelled: { block: 'bg-red-400 text-white',           dot: 'bg-red-400',   label: 'text-red-500',   badge: 'bg-red-50 text-red-500'     },
  pending:   { block: 'bg-yellow-400 text-white',        dot: 'bg-yellow-400',label: 'text-yellow-600',badge: 'bg-yellow-50 text-yellow-700'},
};

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-brand-500' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ── Time Select ───────────────────────────────────────────────────────────────
function TimeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll selected time into view when opened
  useEffect(() => {
    if (open && listRef.current) {
      const sel = listRef.current.querySelector('[data-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-brand-300 hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-brand-300 w-[96px]"
      >
        <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="flex-1 text-left">{fmtTime(value)}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-[120px] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {TIME_OPTIONS.map(t => (
              <button
                key={t}
                type="button"
                data-selected={t === value}
                onClick={() => { onChange(t); setOpen(false); }}
                className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                  t === value
                    ? 'bg-brand-500 text-white font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {fmtTime(t)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appointment Card ──────────────────────────────────────────────────────────
const STATUS_LABEL = { confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', pending: 'Pending' };

function AppointmentCard({ appt, confirmCancelId, setConfirmCancelId, cancelAppt, completeAppt }) {
  const colors = APPT_COLORS[appt.status] || APPT_COLORS.confirmed;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        {/* Date block */}
        <div className="text-center min-w-[52px]">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {format(parseISO(appt.scheduled_date), 'EEE')}
          </p>
          <p className={`text-3xl font-bold leading-tight ${colors.label}`}>
            {format(parseISO(appt.scheduled_date), 'd')}
          </p>
          <p className="text-xs text-gray-500 font-medium mt-0.5">{fmtTime(appt.scheduled_time)}</p>
        </div>

        {/* Divider */}
        <div className={`w-0.5 self-stretch rounded-full ${colors.dot} opacity-40`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
              {STATUS_LABEL[appt.status] || appt.status}
            </span>
          </div>
          <p className="font-bold text-gray-900 text-lg leading-snug truncate">{appt.lead_name}</p>
          <p className="text-sm text-gray-400 mb-3 truncate">{appt.niche_name}</p>
          {appt.lead_description && (
            <p className="text-xs text-gray-400 mb-3 leading-relaxed line-clamp-2 italic">
              "{appt.lead_description}"
            </p>
          )}
        </div>

        {/* Cancel (top-right) */}
        {appt.status === 'confirmed' && (
          <div className="shrink-0">
            {confirmCancelId === appt.id ? (
              <div className="flex flex-col gap-1 items-end">
                <button
                  onClick={() => cancelAppt.mutate(appt.id)}
                  disabled={cancelAppt.isPending}
                  className="text-xs font-bold bg-red-500 text-white px-3 py-2 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-all"
                >
                  {cancelAppt.isPending ? '…' : 'Yes, Cancel'}
                </button>
                <button onClick={() => setConfirmCancelId(null)} className="text-xs text-gray-400 hover:text-gray-600 py-1 px-2">
                  Keep it
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancelId(appt.id)}
                className="text-xs font-medium text-gray-400 hover:text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-xl border border-gray-200 transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action row — phone call + complete */}
      {(appt.lead_phone || appt.lead_email || appt.status === 'confirmed') && (
        <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-3 flex-wrap">
          {appt.lead_phone && (
            <a
              href={`tel:${appt.lead_phone}`}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <Phone className="w-4 h-4" /> Call {appt.lead_name.split(' ')[0]}
            </a>
          )}
          {appt.lead_email && (
            <a
              href={`mailto:${appt.lead_email}`}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-brand-500 hover:bg-brand-50 px-3 py-2.5 rounded-xl border border-gray-200 transition-all"
            >
              <Mail className="w-4 h-4" /> Email
            </a>
          )}
          {appt.status === 'confirmed' && (
            <button
              onClick={() => completeAppt.mutate(appt.id)}
              disabled={completeAppt.isPending}
              className="flex items-center gap-2 text-sm font-semibold text-green-600 hover:bg-green-50 px-4 py-2.5 rounded-xl border border-green-200 transition-all disabled:opacity-40 ml-auto"
            >
              <CheckCircle className="w-4 h-4" /> Mark Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ContractorPortal() {
  const user = JSON.parse(localStorage.getItem('user'));
  const qc = useQueryClient();

  const [tab, setTab] = useState('home');
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState({ date: '', start_time: '09:00', duration_hours: 1 });
  const [blockMonth, setBlockMonth] = useState(startOfMonth(new Date()));
  const [removingBlock, setRemovingBlock] = useState(null); // "date|time"
  const [confirmDeleteOverrideId, setConfirmDeleteOverrideId] = useState(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPwField, setShowPwField] = useState({ current: false, next: false, confirm: false });
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    company_name: user.company_name || '',
  });
  const [prefForm, setPrefForm] = useState({
    service_radius_miles: '',
    max_appointments_per_day: '',
  });
  const [zipInput, setZipInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const isLoadingFromSlots = useRef(false);

  // ── Onboarding checklist state ─────────────────────────────────────────────
  const [onboardingSteps, setOnboardingSteps] = useState({});
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);

  const from     = format(weekStart, 'yyyy-MM-dd');
  const to       = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Fixed current-week range (not tied to calendar navigation) — used for the "This Week" stat
  const thisWeekFrom = format(startOfWeek(new Date()), 'yyyy-MM-dd');
  const thisWeekTo   = format(addDays(startOfWeek(new Date()), 6), 'yyyy-MM-dd');
  const homeFrom     = format(new Date(), 'yyyy-MM-dd');
  const homeTo       = format(addDays(new Date(), 60), 'yyyy-MM-dd');

  // ── Queries ────────────────────────────────────────────────────────────────

  // Fetch contractor profile on load so the Settings form has fresh data (fixes phone blanking)
  const { data: contractorProfile } = useQuery({
    queryKey: ['contractor-profile', user.id],
    queryFn: () => api.get(`/contractors/${user.id}`).then(r => r.data),
  });

  // React Query v5 removed onSuccess — use useEffect instead
  useEffect(() => {
    if (!contractorProfile) return;
    const data = contractorProfile;
    setProfileForm({
      name: data.name || '',
      phone: data.phone || '',
      company_name: data.company_name || '',
    });
    setPrefForm({
      service_radius_miles: data.service_radius_miles ?? '',
      max_appointments_per_day: data.max_appointments_per_day ?? '',
    });
    // Load onboarding steps and show first-login modal if no steps done yet
    const steps = typeof data.onboarding_steps === 'string'
      ? JSON.parse(data.onboarding_steps || '{}')
      : (data.onboarding_steps || {});
    setOnboardingSteps(steps);
    const hasSeenModal = localStorage.getItem(`onboarding_modal_seen_${user.id}`);
    if (!hasSeenModal && Object.keys(steps).length === 0) {
      setShowOnboardingModal(true);
      localStorage.setItem(`onboarding_modal_seen_${user.id}`, '1');
    }
    try {
      const zips = JSON.parse(data.service_zip_codes || '[]');
      setZipInput(Array.isArray(zips) ? zips.join(', ') : (data.service_zip_codes || ''));
    } catch { setZipInput(data.service_zip_codes || ''); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorProfile]);

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', user.id, from, to],
    queryFn: () => api.get(`/bookings/contractor/${user.id}?from=${from}&to=${to}`).then(r => r.data),
    refetchInterval: 30000, // auto-refresh calendar every 30s to pick up new bookings
  });

  // Separate query for "This Week" stat — always current week, unaffected by calendar navigation
  const { data: thisWeekAppts = [] } = useQuery({
    queryKey: ['appointments-this-week', user.id, thisWeekFrom, thisWeekTo],
    queryFn: () => api.get(`/bookings/contractor/${user.id}?from=${thisWeekFrom}&to=${thisWeekTo}`).then(r => r.data),
    refetchInterval: 30000,
  });

  // Home tab query — always today → 60 days out, independent of calendar week navigation
  const { data: homeAppts = [] } = useQuery({
    queryKey: ['appointments-home', user.id, homeFrom, homeTo],
    queryFn: () => api.get(`/bookings/contractor/${user.id}?from=${homeFrom}&to=${homeTo}`).then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: slots = [] } = useQuery({
    queryKey: ['slots', user.id],
    queryFn: () => api.get(`/availability/${user.id}/slots`).then(r => r.data),
  });

  const [availability, setAvailability] = useState({});
  useEffect(() => {
    const map = {};
    slots.forEach(s => { map[s.day_of_week] = { start: s.start_time, end: s.end_time }; });
    isLoadingFromSlots.current = true;
    setAvailability(map);
    setIsDirty(false);
  }, [slots]);

  // Mark schedule as dirty when user makes changes (skip initial DB load)
  useEffect(() => {
    if (isLoadingFromSlots.current) { isLoadingFromSlots.current = false; return; }
    setIsDirty(true);
  }, [availability]); // eslint-disable-line react-hooks/exhaustive-deps

  const overridesFrom = format(new Date(), 'yyyy-MM-dd');
  const overridesTo   = format(addDays(new Date(), 365), 'yyyy-MM-dd');

  const { data: overrides = [] } = useQuery({
    queryKey: ['overrides', user.id],
    queryFn: () => api.get(`/availability/${user.id}/overrides?from=${overridesFrom}&to=${overridesTo}`).then(r => r.data),
  });

  // Override date picker: month+day with smart year detection
  const [newOverride, setNewOverride] = useState({ month: '', day: '', year: null, type: 'block', start: '09:00', end: '17:00' });

  // Compute the actual YYYY-MM-DD from the month+day+year picker
  const computedOverrideDate = (() => {
    if (!newOverride.month || !newOverride.day) return '';
    const today = new Date();
    const thisYr = today.getFullYear();
    const m = parseInt(newOverride.month);
    const d = parseInt(newOverride.day);
    const candidateThisYear = new Date(thisYr, m - 1, d);
    // Auto-detect: if date has passed this year, default to next year
    const autoYear = isBefore(candidateThisYear, startOfDay(today)) ? thisYr + 1 : thisYr;
    const yr = newOverride.year ?? autoYear;
    return format(new Date(yr, m - 1, d), 'yyyy-MM-dd');
  })();

  // Which years to offer in the pill selector
  const overrideYearOptions = (() => {
    if (!newOverride.month || !newOverride.day) return [];
    const today = new Date();
    const thisYr = today.getFullYear();
    const m = parseInt(newOverride.month);
    const d = parseInt(newOverride.day);
    const candidateThisYear = new Date(thisYr, m - 1, d);
    const thisYrIsPast = isBefore(candidateThisYear, startOfDay(today));
    const autoYear = thisYrIsPast ? thisYr + 1 : thisYr;
    const selectedYear = newOverride.year ?? autoYear;
    return [
      { year: thisYr, past: thisYrIsPast, active: selectedYear === thisYr },
      { year: thisYr + 1, past: false, active: selectedYear === thisYr + 1 },
    ];
  })();

  // Days available in the selected month (uses current year for leap-year accuracy)
  const daysInSelectedMonth = newOverride.month
    ? new Date(new Date().getFullYear(), parseInt(newOverride.month), 0).getDate()
    : 31;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveAvailability = useMutation({
    mutationFn: () => {
      // Validate end > start for all active days before sending
      for (const [day, val] of Object.entries(availability)) {
        if (val.end <= val.start) {
          const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day];
          throw new Error(`${dayName}: end time must be after start time`);
        }
      }
      const payload = Object.entries(availability).map(([day, val]) => ({
        day_of_week: Number(day),
        start_time: val.start,
        end_time: val.end,
      }));
      return api.put(`/availability/${user.id}/slots`, payload);
    },
    onSuccess: () => { toast.success('Schedule saved!'); qc.invalidateQueries(['slots']); setIsDirty(false); },
    onError: (err) => toast.error(err.message || 'Failed to save'),
  });

  const addOverride = useMutation({
    mutationFn: (data) => api.post(`/availability/${user.id}/overrides`, data),
    onSuccess: () => {
      toast.success('Date override saved!');
      qc.invalidateQueries(['overrides']);
      setNewOverride({ month: '', day: '', year: null, type: 'block', start: '09:00', end: '17:00' });
    },
    onError: () => toast.error('Failed to save'),
  });

  const removeOverride = useMutation({
    mutationFn: (id) => api.delete(`/availability/${user.id}/overrides/${id}`),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries(['overrides']); },
    onError: () => toast.error('Failed to remove'),
  });

  const cancelAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/cancel`),
    onSuccess: () => {
      toast.success('Cancelled — homeowner has been notified');
      qc.invalidateQueries(['appointments']);
      setConfirmCancelId(null);
    },
    onError: () => toast.error('Failed to cancel'),
  });

  const completeAppt = useMutation({
    mutationFn: (id) => api.put(`/bookings/${id}/complete`),
    onSuccess: () => { toast.success('Marked complete!'); qc.invalidateQueries(['appointments']); },
    onError: () => toast.error('Failed to update'),
  });

  const addBlock = useMutation({
    mutationFn: (data) => api.post(`/availability/${user.id}/manual-block`, data),
    onSuccess: (res) => {
      const { inserted, conflicts } = res.data;
      if (conflicts?.length) {
        toast.error(`${conflicts.length} slot(s) already taken: ${conflicts.join(', ')}`);
      } else {
        toast.success('Time blocked!');
      }
      qc.invalidateQueries(['appointments', user.id, from, to]);
      setShowBlockForm(false);
      setBlockForm({ date: '', start_time: '09:00', duration_hours: 1 });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to block time'),
  });

  const removeBlock = useMutation({
    mutationFn: ({ date, time }) => api.delete(`/availability/${user.id}/manual-block`, { params: { date, time } }),
    onSuccess: () => {
      toast.success('Block removed');
      qc.invalidateQueries(['appointments', user.id, from, to]);
      setRemovingBlock(null);
    },
    onError: () => toast.error('Failed to remove block'),
  });

  const updateProfile = useMutation({
    mutationFn: (data) => api.put(`/contractors/${user.id}`, data),
    onSuccess: () => toast.success('Profile updated!'),
    onError: () => toast.error('Failed to update'),
  });

  const changePassword = useMutation({
    mutationFn: (data) => api.put(`/contractors/${user.id}/password`, data),
    onSuccess: () => { toast.success('Password changed!'); setPwForm({ current: '', next: '', confirm: '' }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to change password'),
  });

  const markStep = useMutation({
    mutationFn: (step) => api.put(`/contractors/${user.id}/onboarding-step`, { step }),
    onSuccess: (res) => {
      const steps = typeof res.data.onboarding_steps === 'string'
        ? JSON.parse(res.data.onboarding_steps || '{}')
        : (res.data.onboarding_steps || {});
      setOnboardingSteps(steps);
      toast.success('Step marked complete!');
    },
    onError: () => toast.error('Failed to save step'),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAddOverride = () => {
    if (!computedOverrideDate) return toast.error('Please select a month and day');
    if (isBefore(parseISO(computedOverrideDate), startOfDay(new Date()))) {
      return toast.error('Cannot add an override for a past date');
    }
    if (newOverride.type === 'block') {
      addOverride.mutate({ date: computedOverrideDate, is_available: false });
    } else {
      if (newOverride.start >= newOverride.end) return toast.error('End time must be after start time');
      addOverride.mutate({ date: computedOverrideDate, is_available: true, start_time: newOverride.start, end_time: newOverride.end });
    }
  };

  const handleChangePassword = () => {
    if (pwForm.next.length < 6) return toast.error('Password must be at least 6 characters');
    if (pwForm.next !== pwForm.confirm) return toast.error('Passwords do not match');
    changePassword.mutate({ current_password: pwForm.current, new_password: pwForm.next });
  };

  const connectGoogle = async () => {
    try {
      const res = await api.get(`/auth/google/connect/${user.id}`);
      window.location.href = res.data.url;
    } catch { toast.error('Failed to connect Google Calendar'); }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  // Home tab uses homeAppts (today → 60 days) so it's never affected by calendar week navigation
  const todayAppts = homeAppts
    .filter(a => a.scheduled_date === todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const upcomingAppts = homeAppts
    .filter(a => a.scheduled_date > todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_time.localeCompare(b.scheduled_time));

  const thisWeekCount  = thisWeekAppts.filter(a => a.status === 'confirmed').length;
  const completedCount = homeAppts.filter(a => a.status === 'completed').length;
  const todayCount     = homeAppts.filter(a => a.scheduled_date === todayStr && a.status === 'confirmed').length;

  const cancelledAppts = homeAppts
    .filter(a => a.status === 'cancelled')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5);

  // ── Dynamic calendar hours based on contractor's schedule ─────────────────
  const calendarHours = useMemo(() => {
    if (!slots.length) {
      return Array.from({ length: 11 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
    }
    const starts = slots.map(s => parseInt(s.start_time.split(':')[0]));
    const ends   = slots.map(s => parseInt(s.end_time.split(':')[0]));
    // Add 1 to max end so the last hour row is visible
    const minH = Math.min(...starts);
    const maxH = Math.max(...ends) + 1;
    return Array.from({ length: maxH - minH }, (_, i) => `${String(i + minH).padStart(2, '0')}:00`);
  }, [slots]);

  // ── Onboarding checklist config ────────────────────────────────────────────
  const ONBOARDING_STEPS = [
    {
      key: 'availability',
      label: 'Confirm your availability',
      icon: '📅',
      description: 'Your hours have been pre-set based on your intake form. Tap below to confirm they look right — you can adjust anytime.',
      action: { label: 'Go to My Schedule →', onClick: () => setTab('availability') },
    },
    {
      key: 'twilio',
      label: 'Set up missed call forwarding',
      icon: '📞',
      description: contractorProfile?.twilio_number
        ? `Forward unanswered calls to your Tractify number: ${contractorProfile.twilio_number}. This turns every missed call into an automatic booking text.`
        : 'Your Tractify number will be set up soon. Check back after your onboarding call.',
      instructions: [
        { platform: 'iPhone', steps: 'Settings → Phone → Call Forwarding → When Unanswered → enter your Tractify number → toggle on' },
        { platform: 'Android', steps: 'Phone app → Menu (⋮) → Settings → Supplementary services → Call forwarding → When unanswered → enter your Tractify number' },
      ],
      copyText: contractorProfile?.twilio_number || null,
    },
    {
      key: 'gbp',
      label: 'Add booking link to Google Business Profile',
      icon: '🔍',
      description: 'Add your Tractify booking link under "Appointments" in your Google Business Profile. This lets customers searching "HVAC near me" book directly from your Google listing — free, zero ad spend.',
      instructions: [
        { platform: 'Steps', steps: 'Go to business.google.com → click your business → Edit Profile → scroll to "Appointments" → paste your booking link → Save' },
      ],
      copyText: contractorProfile?.booking_slug ? `https://tractifyhq.com/schedule/${contractorProfile.booking_slug}` : null,
    },
    {
      key: 'nextdoor',
      label: 'Post in a local Nextdoor neighborhood',
      icon: '🏘️',
      description: 'HVAC is the #1 requested service on Nextdoor. One post in your neighborhood can drive 2-3 bookings before your ads even start.',
      copyText: contractorProfile
        ? `Hey neighbors! ${contractorProfile.company_name || contractorProfile.name} now has online booking — pick a time that works for you right here: ${contractorProfile.booking_slug ? `https://tractifyhq.com/schedule/${contractorProfile.booking_slug}` : 'your booking link'}. Happy to help with any HVAC needs!`
        : null,
      link: { label: 'Open Nextdoor →', url: 'https://nextdoor.com' },
    },
    {
      key: 'facebook',
      label: 'Post in a local Facebook community group',
      icon: '👥',
      description: 'Find a local Facebook group like "[Your City] Neighbors" or "[Your City] Community Board" and post once. People asking for HVAC recommendations are mid-search — they convert immediately.',
      copyText: contractorProfile
        ? `Hi everyone! I run ${contractorProfile.company_name || contractorProfile.name} and we just launched online booking — no more phone tag, just pick a time that works for you: ${contractorProfile.booking_slug ? `https://tractifyhq.com/schedule/${contractorProfile.booking_slug}` : 'your booking link'}. Happy to help with any heating or cooling needs!`
        : null,
      link: { label: 'Open Facebook →', url: 'https://facebook.com/groups' },
    },
    {
      key: 'reviewers',
      label: 'Message your top Google reviewers',
      icon: '⭐',
      description: 'Your past happy customers already trust you. A quick message to your top Google reviewers can book 2-3 jobs before anything else kicks in.',
      instructions: [
        { platform: 'Find reviewers', steps: 'Go to business.google.com → Reviews → click "Reply" next to each review to send them a message' },
      ],
      copyText: contractorProfile
        ? `Hi [Name]! Thanks again for the kind review — it means a lot. We just launched online booking so you can schedule service anytime without the phone tag: ${contractorProfile.booking_slug ? `https://tractifyhq.com/schedule/${contractorProfile.booking_slug}` : 'your booking link'}. Hope we can help again soon!`
        : null,
    },
  ];

  const completedStepCount = ONBOARDING_STEPS.filter(s => onboardingSteps[s.key]).length;
  const allStepsDone = completedStepCount === ONBOARDING_STEPS.length;

  // ── Sidebar nav items ──────────────────────────────────────────────────────
  const NAV = [
    { id: 'home',         label: 'Home',        icon: Home,       badge: todayCount || null },
    { id: 'calendar',     label: 'Calendar',    icon: Calendar,   badge: null },
    { id: 'availability', label: 'My Schedule', icon: Clock,      badge: null },
    { id: 'setup',        label: 'Setup',       icon: ListChecks, badge: allStepsDone ? null : `${completedStepCount}/6` },
    { id: 'settings',     label: 'Settings',    icon: Settings,   badge: null },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans w-full max-w-full">

      {/* ── Sidebar (desktop only) ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-white border-r border-gray-100 flex-col shrink-0 shadow-sm">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <img src="/probook-icon-128.png" alt="Tractify" className="w-8 h-8 rounded-xl shadow-sm" />
            <span className="font-bold text-gray-900 text-base tracking-tight">Tractify</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => {
                if (isDirty && tab === 'availability' && id !== 'availability') {
                  toast('Don\'t forget to save your schedule!', { icon: '⚠️' });
                }
                setTab(id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                tab === id
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  tab === id ? 'bg-white/30 text-white' : 'bg-brand-500 text-white'
                }`}>{badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.company_name || user.email}</p>
          </div>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ════════════════ HOME ════════════════ */}
        {tab === 'home' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">

              {/* Greeting */}
              <div className="mb-8">
                <p className="text-sm text-gray-400 mb-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
                <h1 className="text-3xl font-bold text-gray-900">
                  {greeting()}, {user.name.split(' ')[0]}
                </h1>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: "Today's Jobs",  value: todayCount,    color: 'text-brand-600', bg: 'bg-brand-50' },
                  { label: 'This Week',     value: thisWeekCount, color: 'text-blue-600',  bg: 'bg-blue-50'  },
                  { label: 'Completed',     value: completedCount, color: 'text-green-600', bg: 'bg-green-50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-2xl px-5 py-4`}>
                    <p className={`text-3xl font-bold ${color} leading-tight`}>{value}</p>
                    <p className="text-sm text-gray-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Next Job Hero */}
              {(() => {
                const nextJob = todayAppts[0] || upcomingAppts[0];
                if (!nextJob) return (
                  <div className="bg-gradient-to-br from-brand-50 to-blue-50 border border-brand-100 rounded-2xl px-6 py-8 text-center mb-8">
                    <Calendar className="w-10 h-10 text-brand-200 mx-auto mb-3" />
                    <p className="text-gray-600 font-semibold text-lg">No jobs booked yet</p>
                    <p className="text-gray-400 text-sm mt-1">Once a customer books with you, it'll show up right here.</p>
                  </div>
                );
                const isToday = nextJob.scheduled_date === todayStr;
                return (
                  <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-6 mb-8 text-white shadow-lg">
                    <p className="text-brand-200 text-xs font-semibold uppercase tracking-widest mb-1">
                      {isToday ? '📅 Your Next Job — Today' : `📅 Your Next Job — ${format(parseISO(nextJob.scheduled_date), 'EEEE, MMM d')}`}
                    </p>
                    <p className="text-2xl font-bold mb-0.5 truncate">{nextJob.lead_name}</p>
                    <p className="text-brand-200 text-sm mb-4 truncate">{fmtTime(nextJob.scheduled_time)} · {nextJob.niche_name}</p>
                    {nextJob.lead_phone && (
                      <a
                        href={`tel:${nextJob.lead_phone}`}
                        className="inline-flex items-center gap-2 bg-white text-brand-600 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-brand-50 transition-all shadow-sm"
                      >
                        <Phone className="w-4 h-4" /> Call {nextJob.lead_name.split(' ')[0]}
                      </a>
                    )}
                  </div>
                );
              })()}

              {/* Today */}
              <div className="mb-8">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Today's Jobs</h2>
                {todayAppts.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 px-6 py-8 text-center">
                    <p className="text-gray-400 font-medium">Nothing scheduled for today</p>
                    <p className="text-gray-300 text-sm mt-1">Enjoy the day!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayAppts.map(appt => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        confirmCancelId={confirmCancelId}
                        setConfirmCancelId={setConfirmCancelId}
                        cancelAppt={cancelAppt}
                        completeAppt={completeAppt}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming */}
              {upcomingAppts.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Upcoming Jobs</h2>
                  <div className="space-y-3">
                    {upcomingAppts.map(appt => (
                      <AppointmentCard
                        key={appt.id}
                        appt={appt}
                        confirmCancelId={confirmCancelId}
                        setConfirmCancelId={setConfirmCancelId}
                        cancelAppt={cancelAppt}
                        completeAppt={completeAppt}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Cancellations */}
              {cancelledAppts.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Cancellations</h2>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {cancelledAppts.map((appt, i) => (
                      <div
                        key={appt.id}
                        className={`flex items-center gap-4 px-5 py-4 ${i < cancelledAppts.length - 1 ? 'border-b border-gray-50' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                          <XCircle className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{appt.lead_name}</p>
                          <p className="text-xs text-gray-400">
                            {format(parseISO(appt.scheduled_date), 'EEE, MMM d')} · {fmtTime(appt.scheduled_time)}
                            {appt.niche_name ? ` · ${appt.niche_name}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-red-400 bg-red-50 px-2.5 py-1 rounded-full shrink-0">
                          Cancelled
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ CALENDAR ════════════════ */}
        {tab === 'calendar' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">

            {/* ── Shared toolbar ──────────────────────────────────────────────── */}
            <div className="border-b border-gray-100 px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4 bg-white">
              <button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className="text-sm font-semibold text-white bg-brand-500 rounded-lg px-4 py-1.5 hover:bg-brand-600 transition-all shadow-sm"
              >
                Today
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setWeekStart(d => addDays(d, -7))} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all">
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => setWeekStart(d => addDays(d, 7))} className="p-1.5 hover:bg-gray-100 rounded-lg transition-all">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <h2 className="text-base font-semibold text-gray-900 flex-1">
                {format(weekStart, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => { setShowBlockForm(b => !b); }}
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-1.5 rounded-lg transition-all shadow-sm ${
                  showBlockForm
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-800 text-white hover:bg-gray-900'
                }`}
              >
                <Plus className="w-4 h-4" /> Block Time
              </button>
            </div>

            {/* Block Time form */}
            {showBlockForm && (
              <div className="border-b border-gray-100 bg-gray-50 px-4 md:px-6 py-5 overflow-x-hidden">
                <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">

                  {/* Mini month calendar */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 w-full md:w-64 md:shrink-0">
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setBlockMonth(m => addMonths(m, -1))}
                        disabled={isBefore(startOfMonth(blockMonth), startOfMonth(new Date()))}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <p className="text-sm font-semibold text-gray-900">
                        {format(blockMonth, 'MMMM yyyy')}
                      </p>
                      <button
                        onClick={() => setBlockMonth(m => addMonths(m, 1))}
                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {DAYS_SHORT.map(d => (
                        <div key={d} className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">
                          {d[0]}
                        </div>
                      ))}
                    </div>

                    {/* Day grid */}
                    <div className="grid grid-cols-7 gap-y-0.5">
                      {/* Leading blank cells */}
                      {Array.from({ length: getDay(startOfMonth(blockMonth)) }).map((_, i) => (
                        <div key={`blank-${i}`} />
                      ))}
                      {/* Day numbers */}
                      {Array.from({ length: getDaysInMonth(blockMonth) }, (_, i) => {
                        const dayNum = i + 1;
                        const dayDate = new Date(blockMonth.getFullYear(), blockMonth.getMonth(), dayNum);
                        const ds = format(dayDate, 'yyyy-MM-dd');
                        const isPast   = isBefore(startOfDay(dayDate), startOfDay(new Date()));
                        const isToday  = ds === todayStr;
                        const selected = blockForm.date === ds;
                        return (
                          <button
                            key={ds}
                            disabled={isPast}
                            onClick={() => setBlockForm(p => ({ ...p, date: ds }))}
                            className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-medium transition-all ${
                              selected
                                ? 'bg-brand-500 text-white shadow-sm'
                                : isPast
                                ? 'text-gray-200 cursor-not-allowed'
                                : isToday
                                ? 'text-brand-600 font-bold ring-1 ring-brand-300 hover:bg-brand-50'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time + duration + confirm */}
                  <div className="flex-1 pt-1">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Block off your time</p>
                      <button onClick={() => setShowBlockForm(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {blockForm.date ? (
                      <p className="text-base font-semibold text-gray-900 mb-4">
                        {format(parseISO(blockForm.date), 'EEEE, MMMM d')}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 mb-4">← Pick a day from the calendar</p>
                    )}

                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <label className="label">Start Time</label>
                        <TimeSelect
                          value={blockForm.start_time}
                          onChange={v => setBlockForm(p => ({ ...p, start_time: v }))}
                        />
                      </div>
                      <div>
                        <label className="label">Duration</label>
                        <select
                          value={blockForm.duration_hours}
                          onChange={e => setBlockForm(p => ({ ...p, duration_hours: Number(e.target.value) }))}
                          className="input"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                            <option key={h} value={h}>{h} hr{h > 1 ? 's' : ''}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          if (!blockForm.date) return toast.error('Pick a day first');
                          addBlock.mutate(blockForm);
                        }}
                        disabled={addBlock.isPending || !blockForm.date}
                        className="btn-primary disabled:opacity-40"
                      >
                        {addBlock.isPending ? 'Blocking…' : 'Block Hours'}
                      </button>
                    </div>

                    {blockForm.date && (
                      <p className="text-xs text-gray-400 mt-3">
                        {blockForm.duration_hours} hr{blockForm.duration_hours > 1 ? 's' : ''} starting at {fmtTime(blockForm.start_time)} will be hidden from homeowners.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Mobile: appointment list view ─────────────────────────────── */}
            <div className="md:hidden flex-1 overflow-y-auto overflow-x-hidden pb-16">
              <div className="p-4 space-y-5">
                {Array.from({ length: 7 }, (_, i) => {
                  const day     = addDays(weekStart, i);
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayAppts = appointments.filter(a => a.scheduled_date === dateStr && a.status !== 'external' && a.status !== 'cancelled');
                  const blocked  = appointments.filter(a => a.scheduled_date === dateStr && a.status === 'external');
                  const isDayOff = overrides.some(o => o.date === dateStr && !o.is_available);
                  const isToday  = dateStr === todayStr;
                  const isPast   = isBefore(startOfDay(day), startOfDay(new Date()));
                  return (
                    <div key={dateStr}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          isDayOff ? 'bg-red-100 text-red-400' :
                          isToday  ? 'bg-brand-500 text-white' :
                          isPast   ? 'bg-gray-100 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}>{format(day, 'd')}</div>
                        <div className="flex-1">
                          <p className={`text-sm font-bold ${isToday ? 'text-brand-600' : isPast ? 'text-gray-300' : 'text-gray-900'}`}>{format(day, 'EEEE')}</p>
                          <p className="text-xs text-gray-400">{format(day, 'MMMM d')}</p>
                        </div>
                        {isDayOff && <span className="text-xs font-bold text-red-400 bg-red-50 px-2 py-1 rounded-full">Day Off</span>}
                      </div>
                      {dayAppts.length === 0 && blocked.length === 0 && !isDayOff && (
                        <p className="text-xs text-gray-300 ml-13 pl-1">No appointments</p>
                      )}
                      {dayAppts.map(appt => (
                        <div key={appt.id} className={`ml-13 mb-2 rounded-xl px-4 py-3 ${(APPT_COLORS[appt.status] || APPT_COLORS.confirmed).block}`}>
                          <p className="text-xs font-semibold opacity-80">{fmtTime(appt.scheduled_time)}</p>
                          <p className="text-sm font-bold leading-tight">{appt.lead_name}</p>
                          <p className="text-xs opacity-75">{appt.niche_name}</p>
                          {appt.lead_phone && (
                            <a href={`tel:${appt.lead_phone}`} className="inline-flex items-center gap-1.5 mt-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                              <Phone className="w-3 h-3" /> Call
                            </a>
                          )}
                        </div>
                      ))}
                      {blocked.length > 0 && (
                        <div className="ml-13 mb-2 rounded-xl px-4 py-3 bg-gray-100 border border-dashed border-gray-300">
                          <p className="text-xs font-semibold text-gray-500">{blocked.length} blocked slot{blocked.length > 1 ? 's' : ''}</p>
                          {blocked.map(b => <p key={b.id} className="text-xs text-gray-400">{fmtTime(b.scheduled_time)}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Desktop: weekly grid ───────────────────────────────────────── */}
            {/* Day headers */}
            <div className="hidden md:grid border-b border-gray-200 bg-white" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
              <div /> {/* time spacer */}
              {Array.from({ length: 7 }, (_, i) => {
                const day       = addDays(weekStart, i);
                const dayStr    = format(day, 'yyyy-MM-dd');
                const isToday   = dayStr === todayStr;
                const isPast    = isBefore(startOfDay(day), startOfDay(new Date()));
                const isDayOff  = overrides.some(o => o.date === dayStr && !o.is_available);
                const isCustom  = overrides.some(o => o.date === dayStr && o.is_available);
                return (
                  <div key={i} className="py-2 text-center border-l border-gray-200">
                    <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${
                      isDayOff ? 'text-red-400' : isToday ? 'text-brand-500' : isPast ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {DAYS_SHORT[day.getDay()]}
                    </p>
                    <div className={`w-9 h-9 mx-auto flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                      isDayOff
                        ? 'bg-red-100 text-red-400'
                        : isToday
                        ? 'bg-brand-500 text-white shadow-sm'
                        : isPast
                        ? 'text-gray-300'
                        : 'text-gray-800 hover:bg-gray-100'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    {isDayOff && <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-0.5">Day Off</p>}
                    {isCustom && <p className="text-[10px] text-brand-500 font-bold uppercase tracking-wider mt-0.5">Diff Hours</p>}
                  </div>
                );
              })}
            </div>

            {/* Time grid (desktop only) */}
            <div className="hidden md:block flex-1 overflow-y-auto overflow-x-hidden">
              <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)' }}>

                {/* Time labels */}
                <div>
                  {calendarHours.map(hour => {
                    const [h] = hour.split(':').map(Number);
                    const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
                    return (
                      <div key={hour} className="h-[60px] flex items-start justify-end pr-3 pt-1.5">
                        <span className="text-[11px] text-gray-400 font-medium">{label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Day columns */}
                {Array.from({ length: 7 }, (_, i) => {
                  const day        = addDays(weekStart, i);
                  const isToday    = format(day, 'yyyy-MM-dd') === todayStr;
                  const isPast     = isBefore(startOfDay(day), startOfDay(new Date()));
                  const dateStr    = format(day, 'yyyy-MM-dd');
                  const dayAppts   = appointments.filter(a => a.scheduled_date === dateStr);
                  const isDayOff      = overrides.some(o => o.date === dateStr && !o.is_available);
                  const customOverride = overrides.find(o => o.date === dateStr && o.is_available);

                  return (
                    <div
                      key={i}
                      className={`border-l border-gray-200 relative ${
                        isToday ? 'bg-brand-50/40' : isPast ? 'bg-gray-50/60' : 'bg-white'
                      }`}
                    >
                      {/* Blocked day overlay */}
                      {isDayOff && (
                        <div
                          className="absolute inset-0 z-10 pointer-events-none"
                          style={{
                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.12), rgba(239,68,68,0.12) 6px, rgba(254,202,202,0.20) 6px, rgba(254,202,202,0.20) 12px)',
                            borderLeft: '3px solid rgba(252,165,165,0.7)',
                          }}
                        />
                      )}
                      {calendarHours.map(hour => {
                        const appt = dayAppts.find(a => a.scheduled_time === hour);
                        const blockKey = `${dateStr}|${hour}`;
                        const isRemoving = removingBlock === blockKey;
                        // For custom-hours days: is this slot outside the allowed window?
                        // Normalize to HH:MM (DB may return "09:00:00" with seconds)
                        const customStart = customOverride ? customOverride.start_time.slice(0, 5) : null;
                        const customEnd   = customOverride ? customOverride.end_time.slice(0, 5)   : null;
                        const isOutsideCustom = customOverride
                          ? (hour < customStart || hour >= customEnd)
                          : false;
                        return (
                          <div key={hour} className="h-[60px] border-b border-gray-200 relative">
                            {/* Custom hours: shade slots outside the available window (same style as day off) */}
                            {isOutsideCustom && (
                              <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.10), rgba(239,68,68,0.10) 6px, rgba(254,202,202,0.17) 6px, rgba(254,202,202,0.17) 12px)',
                                }}
                              />
                            )}
                            {appt && appt.status === 'external' && (
                              // Striped "outside block" — not a Tractify appointment
                              <div
                                className="absolute inset-x-1 inset-y-0.5 rounded-xl overflow-hidden cursor-pointer group"
                                style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 5px, #e5e7eb 5px, #e5e7eb 10px)',
                                  border: '1.5px dashed #d1d5db',
                                }}
                                onClick={() => setRemovingBlock(isRemoving ? null : blockKey)}
                              >
                                {isRemoving ? (
                                  <div className="absolute inset-0 bg-white/90 flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); removeBlock.mutate({ date: dateStr, time: hour }); }}
                                      disabled={removeBlock.isPending}
                                      className="text-[10px] font-bold bg-red-500 text-white px-2 py-1 rounded-lg hover:bg-red-600 disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRemovingBlock(null); }}
                                      className="text-[10px] text-gray-500 hover:text-gray-700 font-medium px-1"
                                    >
                                      Keep
                                    </button>
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex items-center px-2 gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Blocked</span>
                                    <X className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
                                  </div>
                                )}
                              </div>
                            )}
                            {appt && appt.status !== 'external' && appt.status !== 'cancelled' && (
                              // Normal Tractify appointment block
                              <div
                                className={`absolute inset-x-1 inset-y-0.5 rounded-xl ${(APPT_COLORS[appt.status] || APPT_COLORS.confirmed).block} px-2 py-1 overflow-hidden shadow-sm`}
                              >
                                <p className="text-xs font-bold truncate leading-tight">{appt.lead_name}</p>
                                <p className="text-[10px] opacity-80 truncate">{fmtTime(hour)} · {appt.niche_name}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ AVAILABILITY ════════════════ */}
        {tab === 'availability' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
            <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-10">

              {/* Weekly schedule */}
              <div>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Weekly Schedule</h2>
                    <p className="text-sm text-gray-400 mt-1">Your recurring hours — applies every week</p>
                  </div>
                  <button
                    onClick={() => saveAvailability.mutate()}
                    disabled={saveAvailability.isPending}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all shadow-sm ${
                      isDirty
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-brand-500 hover:bg-brand-600 text-white opacity-60 cursor-default'
                    }`}
                  >
                    {isDirty && <span className="w-2 h-2 rounded-full bg-white shrink-0" />}
                    {saveAvailability.isPending ? 'Saving…' : isDirty ? 'Save Changes' : 'Saved ✓'}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => {
                    const active = !!availability[idx];
                    const val    = availability[idx] || { start: '09:00', end: '17:00' };
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 md:px-5 py-3 md:py-4 border-b border-gray-50 last:border-b-0 transition-colors ${
                          active ? 'bg-brand-50/50' : ''
                        }`}
                      >
                        {/* Toggle + Day name row */}
                        <div className="flex items-center gap-3">
                          <Toggle
                            checked={active}
                            onChange={(checked) => {
                              if (checked) setAvailability(p => ({ ...p, [idx]: { start: '09:00', end: '17:00' } }));
                              else setAvailability(p => { const n = { ...p }; delete n[idx]; return n; });
                            }}
                          />
                          <span className={`text-sm font-semibold md:w-24 flex-1 ${active ? 'text-gray-900' : 'text-gray-300'}`}>
                            {day}
                          </span>
                          {/* Apply to all — mobile only (shown inline with toggle row) */}
                          {active && (
                            <button
                              type="button"
                              onClick={() => setAvailability(p => {
                                const updated = { ...p };
                                Object.keys(updated).forEach(k => { updated[k] = { start: availability[idx].start, end: availability[idx].end }; });
                                return updated;
                              })}
                              className="md:hidden text-xs text-brand-500 hover:text-brand-700 font-medium"
                            >
                              Apply to all
                            </button>
                          )}
                        </div>

                        {/* Time pickers */}
                        {active ? (
                          <div className="flex items-center gap-2 flex-1 pl-10 md:pl-0">
                            <TimeSelect
                              value={val.start}
                              onChange={v => setAvailability(p => ({ ...p, [idx]: { ...val, start: v } }))}
                            />
                            <span className="text-gray-400 text-sm">→</span>
                            <TimeSelect
                              value={val.end}
                              onChange={v => setAvailability(p => ({ ...p, [idx]: { ...val, end: v } }))}
                            />
                            <button
                              type="button"
                              onClick={() => setAvailability(p => {
                                const updated = { ...p };
                                Object.keys(updated).forEach(k => { updated[k] = { start: val.start, end: val.end }; });
                                return updated;
                              })}
                              className="hidden md:block text-xs text-brand-500 hover:text-brand-700 font-medium whitespace-nowrap ml-2"
                            >
                              Apply to all
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300 pl-10 md:pl-0">Not available</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Days Off & Special Hours */}
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Days Off & Special Hours</h2>
                  <p className="text-sm text-gray-400 mt-1">Take a specific day off or change your hours for one day — won't affect your regular schedule</p>
                </div>

                {/* Add form */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarPlus className="w-4 h-4 text-brand-500" />
                    <h3 className="text-sm font-semibold text-gray-800">Add a Day Off or Special Hours</h3>
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    {/* Month + Day picker (no year clutter) */}
                    <div>
                      <label className="label">Month</label>
                      <select
                        value={newOverride.month}
                        onChange={e => setNewOverride(p => ({ ...p, month: e.target.value, day: '' }))}
                        className="input"
                      >
                        <option value="">Month</option>
                        {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => {
                          const monthNum = i + 1;
                          if (monthNum < new Date().getMonth() + 1) return null;
                          return <option key={m} value={monthNum}>{m}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="label">Day</label>
                      <input
                        type="number"
                        min="1"
                        max={daysInSelectedMonth}
                        value={newOverride.day}
                        onChange={e => {
                          const v = e.target.value;
                          const n = parseInt(v);
                          if (v === '' || (n >= 1 && n <= daysInSelectedMonth)) {
                            setNewOverride(p => ({ ...p, day: v }));
                          }
                        }}
                        placeholder="Day"
                        disabled={!newOverride.month}
                        className="input w-24"
                      />
                    </div>
                    {/* Year pill selector — shows once month + day are picked */}
                    {overrideYearOptions.length > 0 && (
                      <div className="flex flex-col gap-1.5 pb-1">
                        <span className="text-xs font-medium text-gray-500">Year</span>
                        <div className="flex gap-1.5">
                          {overrideYearOptions.map(({ year, past, active }) => (
                            <button
                              key={year}
                              type="button"
                              onClick={() => setNewOverride(p => ({ ...p, year }))}
                              className={`px-3 py-1 rounded-lg text-sm font-semibold border transition-all ${
                                active
                                  ? 'bg-brand-500 text-white border-brand-500'
                                  : past
                                  ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed line-through'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-brand-600'
                              }`}
                            >
                              {year}
                            </button>
                          ))}
                        </div>
                        {computedOverrideDate && (
                          <p className="text-xs text-gray-400">
                            → {format(parseISO(computedOverrideDate), 'EEEE, MMMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="label">Type</label>
                      <select
                        value={newOverride.type}
                        onChange={e => setNewOverride(p => ({ ...p, type: e.target.value }))}
                        className="input"
                      >
                        <option value="block">Take a Day Off</option>
                        <option value="custom">Change My Hours That Day</option>
                      </select>
                    </div>
                    {newOverride.type === 'custom' && (
                      <>
                        <div>
                          <label className="label">From</label>
                          <TimeSelect
                            value={newOverride.start}
                            onChange={v => setNewOverride(p => ({ ...p, start: v }))}
                          />
                        </div>
                        <div>
                          <label className="label">To</label>
                          <TimeSelect
                            value={newOverride.end}
                            onChange={v => setNewOverride(p => ({ ...p, end: v }))}
                          />
                        </div>
                      </>
                    )}
                    <button onClick={handleAddOverride} disabled={addOverride.isPending} className="btn-primary">
                      {addOverride.isPending ? 'Saving…' : 'Add'}
                    </button>
                  </div>
                </div>

                {/* Override list */}
                {overrides.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 px-6 py-8 text-center">
                    <Ban className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Nothing here yet. Use the form above to take a day off or set different hours for a specific day.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm divide-y divide-gray-50">
                    {overrides.map(o => (
                      <div key={o.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${o.is_available ? 'bg-brand-50' : 'bg-red-50'}`}>
                            {o.is_available
                              ? <Clock className="w-4 h-4 text-brand-500" />
                              : <Ban className="w-4 h-4 text-red-400" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {format(parseISO(o.date), 'EEEE, MMMM d, yyyy')}
                            </p>
                            <p className="text-xs text-gray-400">
                              {o.is_available
                                ? `Custom hours: ${fmtTime(o.start_time)} – ${fmtTime(o.end_time)}`
                                : 'Blocked — no appointments'
                              }
                            </p>
                          </div>
                        </div>
                        {confirmDeleteOverrideId === o.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium">Remove this override?</span>
                            <button
                              onClick={() => { removeOverride.mutate(o.id); setConfirmDeleteOverrideId(null); }}
                              disabled={removeOverride.isPending}
                              className="text-xs font-bold bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-all"
                            >
                              Yes, remove
                            </button>
                            <button
                              onClick={() => setConfirmDeleteOverrideId(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteOverrideId(o.id)}
                            className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ FIRST-LOGIN ONBOARDING MODAL ════════════════ */}
        {showOnboardingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're almost live!</h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Complete 6 quick setup steps to activate all your booking channels. Most contractors finish in under 30 minutes and see their first job within 48 hours.
              </p>
              <div className="space-y-2 text-left mb-8">
                {ONBOARDING_STEPS.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-xl">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-medium text-gray-700">{s.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setShowOnboardingModal(false); setTab('setup'); }}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm text-base"
              >
                Start Setup →
              </button>
              <button
                onClick={() => setShowOnboardingModal(false)}
                className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600 py-2"
              >
                I'll do this later
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ SETUP CHECKLIST ════════════════ */}
        {tab === 'setup' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
            <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8">

              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Setup Checklist</h1>
                <p className="text-gray-400 text-sm mt-1">
                  Complete all 6 steps to activate your booking channels and start getting jobs.
                </p>
              </div>

              {/* Progress bar */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">{completedStepCount} of 6 steps complete</span>
                  {allStepsDone && (
                    <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">All done! 🎉</span>
                  )}
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-brand-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${(completedStepCount / 6) * 100}%` }}
                  />
                </div>
                {allStepsDone && (
                  <p className="text-sm text-gray-500 mt-3 text-center">
                    All channels are live. Jobs are on their way — check your calendar.
                  </p>
                )}
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {ONBOARDING_STEPS.map((step, i) => {
                  const done = !!onboardingSteps[step.key];
                  const isOpen = expandedStep === step.key;
                  return (
                    <div key={step.key} className={`bg-white rounded-2xl border transition-all shadow-sm ${done ? 'border-green-200' : 'border-gray-100'}`}>
                      {/* Step header */}
                      <button
                        onClick={() => setExpandedStep(isOpen ? null : step.key)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                          done ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {done ? <CheckCircle className="w-5 h-5" /> : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${done ? 'text-green-700' : 'text-gray-900'}`}>
                            <span className="mr-2">{step.icon}</span>{step.label}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-4">
                          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>

                          {/* Platform instructions */}
                          {step.instructions?.map(inst => (
                            <div key={inst.platform} className="bg-gray-50 rounded-xl px-4 py-3">
                              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{inst.platform}</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{inst.steps}</p>
                            </div>
                          ))}

                          {/* Copy text */}
                          {step.copyText && (
                            <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-brand-600 uppercase tracking-wide">Copy & paste</p>
                                <button
                                  onClick={() => { navigator.clipboard.writeText(step.copyText); toast.success('Copied!'); }}
                                  className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-white px-2 py-1 rounded-lg border border-brand-200 transition-all"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed break-words">{step.copyText}</p>
                            </div>
                          )}

                          {/* External link */}
                          {step.link && (
                            <a
                              href={step.link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
                            >
                              <ExternalLink className="w-4 h-4" /> {step.link.label}
                            </a>
                          )}

                          {/* Schedule tab shortcut */}
                          {step.action && (
                            <button
                              onClick={step.action.onClick}
                              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
                            >
                              {step.action.label}
                            </button>
                          )}

                          {/* Mark done */}
                          {!done && (
                            <button
                              onClick={() => markStep.mutate(step.key)}
                              disabled={markStep.isPending}
                              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm"
                            >
                              {markStep.isPending ? 'Saving…' : '✓ Mark as done'}
                            </button>
                          )}
                          {done && (
                            <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
                              <CheckCircle className="w-4 h-4" /> Completed
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ SETTINGS ════════════════ */}
        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
            <div className="max-w-xl mx-auto px-4 md:px-8 py-6 md:py-8">
              <h1 className="text-xl font-bold text-gray-900 mb-8">Settings</h1>

              <div className="space-y-6">

                {/* Profile */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2.5">
                    <User className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-gray-900">Profile</h3>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <label className="label">Full Name</label>
                      <input className="input" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Company Name</label>
                      <input className="input" value={profileForm.company_name} onChange={e => setProfileForm(p => ({ ...p, company_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input className="input" type="tel" value={profileForm.phone} placeholder="(555) 000-0000" onChange={e => setProfileForm(p => ({ ...p, phone: formatPhone(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" value={user.email} disabled />
                      <p className="text-xs text-gray-400 mt-1">Contact your admin to change your email.</p>
                    </div>
                    <button onClick={() => updateProfile.mutate(profileForm)} disabled={updateProfile.isPending} className="btn-primary">
                      {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
                    </button>
                  </div>
                </div>

                {/* Booking Preferences */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-gray-900">Booking Preferences</h3>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <label className="label">Service ZIP Codes</label>
                      <input
                        className="input"
                        value={zipInput}
                        onChange={e => setZipInput(e.target.value)}
                        placeholder="e.g. 98101, 98109, 98103"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Comma-separated list of ZIP codes you serve. Use * to serve all ZIP codes.
                      </p>
                    </div>
                    <div>
                      <label className="label">Service Radius (miles)</label>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        className="input"
                        value={prefForm.service_radius_miles}
                        onChange={e => setPrefForm(p => ({ ...p, service_radius_miles: e.target.value }))}
                        placeholder="e.g. 25"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        How far (in miles) from your listed zip codes you're willing to travel. Leave blank to only match exact zips.
                      </p>
                    </div>
                    <div>
                      <label className="label">Max Appointments Per Day</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        className="input"
                        value={prefForm.max_appointments_per_day}
                        onChange={e => setPrefForm(p => ({ ...p, max_appointments_per_day: e.target.value }))}
                        placeholder="e.g. 3 (leave blank for no limit)"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Tractify won't book more than this many appointments on any single day. Leave blank for no limit.
                      </p>
                    </div>
                    <button
                      onClick={() => updateProfile.mutate({
                        ...prefForm,
                        service_zip_codes: zipInput.split(',').map(z => z.trim()).filter(Boolean),
                      })}
                      disabled={updateProfile.isPending}
                      className="btn-primary"
                    >
                      {updateProfile.isPending ? 'Saving…' : 'Save Preferences'}
                    </button>
                  </div>
                </div>

                {/* Password */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-gray-900">Change Password</h3>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    {[
                      { label: 'Current Password', key: 'current' },
                      { label: 'New Password',     key: 'next'    },
                      { label: 'Confirm New Password', key: 'confirm' },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <label className="label">{label}</label>
                        <div className="relative">
                          <input
                            type={showPwField[key] ? 'text' : 'password'}
                            className="input pr-10"
                            value={pwForm[key]}
                            onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwField(s => ({ ...s, [key]: !s[key] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPwField[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={handleChangePassword} disabled={changePassword.isPending} className="btn-primary">
                      {changePassword.isPending ? 'Updating…' : 'Update Password'}
                    </button>
                  </div>
                </div>

                {/* Google Calendar — hidden until GOOGLE_CLIENT_ID/SECRET are set in Railway */}
                {false && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <LinkIcon className="w-4 h-4 text-brand-500" />
                      <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">Optional</span>
                  </div>
                  <div className="px-6 py-5">
                    <p className="text-sm text-gray-500 mb-1">
                      If you use Google Calendar, connect it here and your bookings will show up there automatically.
                    </p>
                    <p className="text-xs text-gray-400 mb-4">You don't need this for Tractify to work — it's just a bonus if you want it.</p>
                    <button onClick={connectGoogle} className="btn-secondary gap-2">
                      <LinkIcon className="w-4 h-4" />
                      Connect Google Calendar
                    </button>
                    {new URLSearchParams(window.location.search).get('gcal') === 'success' && (
                      <p className="text-green-600 text-sm mt-3 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4" /> Connected successfully!
                      </p>
                    )}
                  </div>
                </div>}

              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-50 shadow-lg">
        {NAV.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => {
              if (isDirty && tab === 'availability' && id !== 'availability') {
                toast('Don\'t forget to save your schedule!', { icon: '⚠️' });
              }
              setTab(id);
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-[11px] font-medium transition-all ${
              tab === id ? 'text-brand-500' : 'text-gray-400'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {badge ? (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold leading-none">
                  {badge}
                </span>
              ) : null}
            </div>
            {label}
          </button>
        ))}
        <button
          onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
          className="flex-1 flex flex-col items-center gap-0.5 py-3 text-[11px] font-medium text-gray-400 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </nav>
    </div>
  );
}
