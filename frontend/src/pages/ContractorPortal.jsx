import { useState, useEffect } from 'react';
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
  ChevronLeft, ChevronRight, Phone, Mail,
  Link as LinkIcon, Settings, Lock, User, Ban, CalendarPlus, Trash2,
  Home, Plus, X,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 7; // 7 AM – 7 PM
  return `${String(h).padStart(2, '0')}:00`;
});
const TIME_OPTIONS = Array.from({ length: 26 }, (_, i) => {
  const h = Math.floor(i / 2) + 6;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
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

// ── Appointment Card ──────────────────────────────────────────────────────────
function AppointmentCard({ appt, confirmCancelId, setConfirmCancelId, cancelAppt, completeAppt }) {
  const colors = APPT_COLORS[appt.status] || APPT_COLORS.confirmed;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start justify-between gap-4 hover:shadow-sm transition-shadow">
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
          <span className={`text-xs font-semibold uppercase tracking-widest ${colors.label}`}>
            {appt.status}
          </span>
        </div>
        <p className="font-semibold text-gray-900 text-base leading-snug">{appt.lead_name}</p>
        <p className="text-sm text-gray-400 mb-3">{appt.niche_name}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-400">
          {appt.lead_phone && (
            <a href={`tel:${appt.lead_phone}`} className="flex items-center gap-1 hover:text-brand-500 transition-colors">
              <Phone className="w-3 h-3" />{appt.lead_phone}
            </a>
          )}
          {appt.lead_email && (
            <a href={`mailto:${appt.lead_email}`} className="flex items-center gap-1 hover:text-brand-500 transition-colors">
              <Mail className="w-3 h-3" />{appt.lead_email}
            </a>
          )}
        </div>
        {appt.lead_description && (
          <p className="text-xs text-gray-400 mt-2 leading-relaxed line-clamp-2 italic">
            "{appt.lead_description}"
          </p>
        )}
      </div>

      {/* Actions */}
      {appt.status === 'confirmed' && (
        <div className="flex flex-col gap-2 shrink-0 pt-1">
          <button
            onClick={() => completeAppt.mutate(appt.id)}
            disabled={completeAppt.isPending}
            className="flex items-center gap-1.5 text-xs font-medium text-green-600 hover:bg-green-50 px-3 py-2 rounded-xl border border-green-100 transition-all disabled:opacity-40"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Complete
          </button>
          {confirmCancelId === appt.id ? (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => cancelAppt.mutate(appt.id)}
                disabled={cancelAppt.isPending}
                className="text-xs font-medium bg-red-500 text-white px-3 py-2 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {cancelAppt.isPending ? '…' : 'Confirm Cancel'}
              </button>
              <button
                onClick={() => setConfirmCancelId(null)}
                className="text-xs text-gray-400 hover:text-gray-600 text-center py-1"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancelId(appt.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-100 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
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
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    company_name: user.company_name || '',
  });

  const from     = format(weekStart, 'yyyy-MM-dd');
  const to       = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments', user.id, from, to],
    queryFn: () => api.get(`/bookings/contractor/${user.id}?from=${from}&to=${to}`).then(r => r.data),
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
  const overridesTo   = format(addDays(new Date(), 90), 'yyyy-MM-dd');

  const { data: overrides = [] } = useQuery({
    queryKey: ['overrides', user.id],
    queryFn: () => api.get(`/availability/${user.id}/overrides?from=${overridesFrom}&to=${overridesTo}`).then(r => r.data),
  });

  const [newOverride, setNewOverride] = useState({ date: '', type: 'block', start: '09:00', end: '17:00' });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveAvailability = useMutation({
    mutationFn: () => {
      const payload = Object.entries(availability).map(([day, val]) => ({
        day_of_week: Number(day),
        start_time: val.start,
        end_time: val.end,
      }));
      return api.put(`/availability/${user.id}/slots`, payload);
    },
    onSuccess: () => { toast.success('Schedule saved!'); qc.invalidateQueries(['slots']); },
    onError: () => toast.error('Failed to save'),
  });

  const addOverride = useMutation({
    mutationFn: (data) => api.post(`/availability/${user.id}/overrides`, data),
    onSuccess: () => {
      toast.success('Date override saved!');
      qc.invalidateQueries(['overrides']);
      setNewOverride({ date: '', type: 'block', start: '09:00', end: '17:00' });
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
    if (!newOverride.date) return toast.error('Please select a date');
    if (newOverride.type === 'block') {
      addOverride.mutate({ date: newOverride.date, is_available: false });
    } else {
      if (newOverride.start >= newOverride.end) return toast.error('End time must be after start time');
      addOverride.mutate({ date: newOverride.date, is_available: true, start_time: newOverride.start, end_time: newOverride.end });
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
  const todayAppts = appointments
    .filter(a => a.scheduled_date === todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  const upcomingAppts = appointments
    .filter(a => a.scheduled_date > todayStr && a.status !== 'cancelled')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_time.localeCompare(b.scheduled_time));

  const confirmedCount  = appointments.filter(a => a.status === 'confirmed').length;
  const completedCount  = appointments.filter(a => a.status === 'completed').length;
  const todayCount      = appointments.filter(a => a.scheduled_date === todayStr && a.status === 'confirmed').length;

  // ── Sidebar nav items ──────────────────────────────────────────────────────
  const NAV = [
    { id: 'home',         label: 'Home',         icon: Home },
    { id: 'calendar',     label: 'Calendar',     icon: Calendar },
    { id: 'availability', label: 'Availability', icon: Clock },
    { id: 'settings',     label: 'Settings',     icon: Settings },
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
          {NAV.map(({ id, label, icon: Icon }) => (
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
              {label}
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
                  { label: "Today's Jobs",  value: todayCount,     color: 'text-brand-600', bg: 'bg-brand-50' },
                  { label: 'This Week',     value: confirmedCount, color: 'text-blue-600',  bg: 'bg-blue-50'  },
                  { label: 'Completed',     value: completedCount, color: 'text-green-600', bg: 'bg-green-50' },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`${bg} rounded-2xl px-5 py-4`}>
                    <p className={`text-3xl font-bold ${color} leading-tight`}>{value}</p>
                    <p className="text-sm text-gray-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Today */}
              <div className="mb-8">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Today</h2>
                {todayAppts.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 px-6 py-10 text-center">
                    <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
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
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-3">Coming Up</h2>
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
                className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-4 py-1.5 hover:bg-gray-50 transition-all"
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
                className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  showBlockForm
                    ? 'bg-gray-100 text-gray-700 border-gray-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
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
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Block an outside appointment</p>
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
                        <select
                          value={blockForm.start_time}
                          onChange={e => setBlockForm(p => ({ ...p, start_time: e.target.value }))}
                          className="input"
                        >
                          {TIME_OPTIONS.map(h => <option key={h} value={h}>{fmtTime(h)}</option>)}
                        </select>
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
            <div className="border-b border-gray-100 grid bg-white" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
              <div /> {/* time spacer */}
              {Array.from({ length: 7 }, (_, i) => {
                const day = addDays(weekStart, i);
                const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                const isPast  = isBefore(startOfDay(day), startOfDay(new Date()));
                return (
                  <div key={i} className="py-3 text-center border-l border-gray-100">
                    <p className={`text-xs font-medium uppercase tracking-wider mb-1.5 ${
                      isToday ? 'text-brand-500' : isPast ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {DAYS_SHORT[day.getDay()]}
                    </p>
                    <div className={`w-9 h-9 mx-auto flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                      isToday
                        ? 'bg-brand-500 text-white shadow-sm'
                        : isPast
                        ? 'text-gray-300'
                        : 'text-gray-800 hover:bg-gray-100'
                    }`}>
                      {format(day, 'd')}
                    </div>
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
                  const day     = addDays(weekStart, i);
                  const isToday = format(day, 'yyyy-MM-dd') === todayStr;
                  const isPast  = isBefore(startOfDay(day), startOfDay(new Date()));
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayAppts = appointments.filter(a => a.scheduled_date === dateStr);

                  return (
                    <div
                      key={i}
                      className={`border-l border-gray-100 relative ${
                        isToday ? 'bg-brand-50/40' : isPast ? 'bg-gray-50/60' : 'bg-white'
                      }`}
                    >
                      {HOURS.map(hour => {
                        const appt = dayAppts.find(a => a.scheduled_time === hour);
                        const blockKey = `${dateStr}|${hour}`;
                        const isRemoving = removingBlock === blockKey;
                        return (
                          <div key={hour} className="h-[60px] border-b border-gray-50 relative">
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
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Outside Appt</span>
                                    <X className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
                                  </div>
                                )}
                              </div>
                            )}
                            {appt && appt.status !== 'external' && (
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
                            <select
                              value={val.start}
                              onChange={e => setAvailability(p => ({ ...p, [idx]: { ...val, start: e.target.value } }))}
                              className="input py-1.5 text-sm w-auto"
                            >
                              {TIME_OPTIONS.map(h => <option key={h}>{h}</option>)}
                            </select>
                            <span className="text-gray-400 text-sm">→</span>
                            <select
                              value={val.end}
                              onChange={e => setAvailability(p => ({ ...p, [idx]: { ...val, end: e.target.value } }))}
                              className="input py-1.5 text-sm w-auto"
                            >
                              {TIME_OPTIONS.map(h => <option key={h}>{h}</option>)}
                            </select>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">Not available</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Date overrides */}
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Date Overrides</h2>
                  <p className="text-sm text-gray-400 mt-1">Block specific days off or set custom hours — overrides your weekly schedule</p>
                </div>

                {/* Add form */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarPlus className="w-4 h-4 text-brand-500" />
                    <h3 className="text-sm font-semibold text-gray-800">Add an Override</h3>
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="label">Date</label>
                      <input
                        type="date"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        value={newOverride.date}
                        onChange={e => setNewOverride(p => ({ ...p, date: e.target.value }))}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Type</label>
                      <select
                        value={newOverride.type}
                        onChange={e => setNewOverride(p => ({ ...p, type: e.target.value }))}
                        className="input"
                      >
                        <option value="block">Block day off</option>
                        <option value="custom">Custom hours</option>
                      </select>
                    </div>
                    {newOverride.type === 'custom' && (
                      <>
                        <div>
                          <label className="label">From</label>
                          <select value={newOverride.start} onChange={e => setNewOverride(p => ({ ...p, start: e.target.value }))} className="input py-1.5 w-auto">
                            {TIME_OPTIONS.map(h => <option key={h}>{h}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">To</label>
                          <select value={newOverride.end} onChange={e => setNewOverride(p => ({ ...p, end: e.target.value }))} className="input py-1.5 w-auto">
                            {TIME_OPTIONS.map(h => <option key={h}>{h}</option>)}
                          </select>
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
                    <p className="text-sm text-gray-400">No overrides set. Add one above to block a day or set custom hours.</p>
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
                        <button
                          onClick={() => removeOverride.mutate(o.id)}
                          disabled={removeOverride.isPending}
                          className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
                  <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2.5">
                    <LinkIcon className="w-4 h-4 text-brand-500" />
                    <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                  </div>
                  <div className="px-6 py-5">
                    <p className="text-sm text-gray-500 mb-4">
                      Connect your Google Calendar and new bookings will be added automatically.
                    </p>
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
