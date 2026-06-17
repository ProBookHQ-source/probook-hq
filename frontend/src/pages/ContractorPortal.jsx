import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format, addDays, startOfWeek, parseISO,
  isBefore, startOfDay, startOfMonth, endOfMonth, addMonths,
  getDaysInMonth, getDay,
} from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  Calendar, Clock, CheckCircle, XCircle, LogOut, Zap,
  ChevronLeft, ChevronRight, ChevronDown, Phone, Mail,
  Link as LinkIcon, Settings, Lock, User, Ban, CalendarPlus, Trash2,
  Home, Plus, X,
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
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-brand-300 hover:bg-gray-50 transition-all focus:outline-none focus:ring-2 focus:ring-brand-300 w-[110px]"
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
          <p className="font-bold text-gray-900 text-lg leading-snug">{appt.lead_name}</p>
          <p className="text-sm text-gray-400 mb-3">{appt.niche_name}</p>
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
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    company_name: user.company_name || '',
  });
  const [prefForm, setPrefForm] = useState({
    service_radius_miles: '',
    max_appointments_per_day: '',
  });

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
    onSuccess: (data) => {
      setProfileForm({
        name: data.name || '',
        phone: data.phone || '',
        company_name: data.company_name || '',
      });
      setPrefForm({
        service_radius_miles: data.service_radius_miles ?? '',
        max_appointments_per_day: data.max_appointments_per_day ?? '',
      });
    },
  });

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
    setAvailability(map);
  }, [slots]);

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
    onSuccess: () => { toast.success('Schedule saved!'); qc.invalidateQueries(['slots']); },
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

  // ── Sidebar nav items ──────────────────────────────────────────────────────
  const NAV = [
    { id: 'home',         label: 'Home',        icon: Home,     badge: todayCount || null },
    { id: 'calendar',     label: 'Calendar',    icon: Calendar, badge: null },
    { id: 'availability', label: 'My Schedule', icon: Clock,    badge: null },
    { id: 'settings',     label: 'Settings',    icon: Settings, badge: null },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col shrink-0 shadow-sm">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-500 rounded-xl flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-base tracking-tight">ProBook</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
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
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-8">

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
                    <p className="text-2xl font-bold mb-0.5">{nextJob.lead_name}</p>
                    <p className="text-brand-200 text-sm mb-4">{fmtTime(nextJob.scheduled_time)} · {nextJob.niche_name}</p>
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

            {/* Calendar toolbar */}
            <div className="border-b border-gray-100 px-6 py-3 flex items-center gap-4 bg-white">
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
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-5">
                <div className="flex items-start gap-6">

                  {/* Mini month calendar */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 shrink-0 w-64">
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => setBlockMonth(m => addMonths(m, -1))}
                        disabled={isBefore(addMonths(blockMonth, 1), startOfMonth(new Date()))}
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
                        const ds = format(new Date(blockMonth.getFullYear(), blockMonth.getMonth(), dayNum), 'yyyy-MM-dd');
                        const isPast   = isBefore(startOfDay(new Date(ds)), startOfDay(new Date()));
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

            {/* Day headers */}
            <div className="border-b border-gray-200 grid bg-white" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
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

            {/* Time grid */}
            <div className="flex-1 overflow-y-auto">
              <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)' }}>

                {/* Time labels */}
                <div>
                  {HOURS.map(hour => {
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
                      {HOURS.map(hour => {
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
                              // Striped "outside block" — not a ProBook appointment
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
                              // Normal ProBook appointment block
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
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-8 py-8 space-y-10">

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
                    className="btn-primary shrink-0"
                  >
                    {saveAvailability.isPending ? 'Saving…' : 'Save Schedule'}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, idx) => {
                    const active = !!availability[idx];
                    const val    = availability[idx] || { start: '09:00', end: '17:00' };
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-b-0 transition-colors ${
                          active ? 'bg-brand-50/50' : ''
                        }`}
                      >
                        {/* Toggle */}
                        <Toggle
                          checked={active}
                          onChange={(checked) => {
                            if (checked) setAvailability(p => ({ ...p, [idx]: { start: '09:00', end: '17:00' } }));
                            else setAvailability(p => { const n = { ...p }; delete n[idx]; return n; });
                          }}
                        />

                        {/* Day name */}
                        <span className={`text-sm font-semibold w-24 ${active ? 'text-gray-900' : 'text-gray-300'}`}>
                          {day}
                        </span>

                        {/* Time pickers */}
                        {active ? (
                          <div className="flex items-center gap-3 flex-1">
                            <TimeSelect
                              value={val.start}
                              onChange={v => setAvailability(p => ({ ...p, [idx]: { ...val, start: v } }))}
                            />
                            <span className="text-gray-400 text-sm">→</span>
                            <TimeSelect
                              value={val.end}
                              onChange={v => setAvailability(p => ({ ...p, [idx]: { ...val, end: v } }))}
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">Not available</span>
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
                        {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Day</label>
                      <select
                        value={newOverride.day}
                        onChange={e => setNewOverride(p => ({ ...p, day: e.target.value }))}
                        className="input"
                        disabled={!newOverride.month}
                      >
                        <option value="">Day</option>
                        {Array.from({ length: daysInSelectedMonth }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                      </select>
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

        {/* ════════════════ SETTINGS ════════════════ */}
        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto px-8 py-8">
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
                      <input className="input" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} />
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
                        ProBook won't book more than this many appointments on any single day. Leave blank for no limit.
                      </p>
                    </div>
                    <button
                      onClick={() => updateProfile.mutate(prefForm)}
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
                    <div>
                      <label className="label">Current Password</label>
                      <input type="password" className="input" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">New Password</label>
                      <input type="password" className="input" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Confirm New Password</label>
                      <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
                    </div>
                    <button onClick={handleChangePassword} disabled={changePassword.isPending} className="btn-primary">
                      {changePassword.isPending ? 'Updating…' : 'Update Password'}
                    </button>
                  </div>
                </div>

                {/* Google Calendar */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                    <p className="text-xs text-gray-400 mb-4">You don't need this for ProBook to work — it's just a bonus if you want it.</p>
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
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
