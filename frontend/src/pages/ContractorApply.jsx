import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle, ChevronDown, Eye, EyeOff } from 'lucide-react';
import api from '../api/client';
import { formatPhone } from '../utils/formatPhone';

export default function ContractorApply() {
  const navigate = useNavigate();
  const [niches,  setNiches]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [errors,  setErrors]  = useState({});
  const [showPw, setShowPw]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form,    setForm]    = useState({
    name: '', email: '', password: '', confirm: '',
    phone: '', company_name: '', niche_id: '',
    service_zip_codes: '', service_radius_miles: '25',
  });

  useEffect(() => {
    api.get('/niches').then(r => setNiches(r.data)).catch(() => {});
  }, []);

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  function validate() {
    const e = {};
    if (!form.name.trim())              e.name = 'Required';
    if (!form.email.trim())             e.email = 'Required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email';
    if (!form.password)                 e.password = 'Required';
    else if (form.password.length < 8) e.password = 'Must be at least 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    if (!form.niche_id)                 e.niche_id = 'Required';
    if (!form.service_zip_codes.trim()) e.service_zip_codes = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/auth/contractor/apply', {
        name:                 form.name.trim(),
        email:                form.email.trim().toLowerCase(),
        password:             form.password,
        phone:                form.phone.trim() || undefined,
        company_name:         form.company_name.trim() || undefined,
        niche_id:             form.niche_id,
        service_zip_codes:    form.service_zip_codes.trim(),
        service_radius_miles: parseInt(form.service_radius_miles) || 25,
      });
      setDone(true);
    } catch (err) {
      setErrors({ submit: err.response?.data?.error || 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  const bg = 'min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4 w-full max-w-full overflow-x-hidden';

  if (done) {
    return (
      <div className={bg}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src="/probook-icon-128.png" alt="ProAppt" className="w-14 h-14 rounded-2xl shadow-lg mb-4 mx-auto" />
            <h1 className="text-2xl font-bold text-gray-900">ProAppt</h1>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Application submitted!</h2>
            <p className="text-gray-500 mb-6">
              We'll review your application and get back to you within <strong>1–2 business days</strong>. Check your email for a confirmation.
            </p>
            <Link to="/login" className="text-brand-500 text-sm font-semibold hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const inputCls = (key) => `w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all outline-none
    ${errors[key] ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100'}`;

  const field = (label, key, type = 'text', placeholder = '', hint = '') => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className={inputCls(key)}
      />
      {hint && !errors[key] && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  const pwField = (label, key, show, setShow, hint = '') => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          placeholder="••••••••"
          className={inputCls(key) + ' pr-10'}
        />
        <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && !errors[key] && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className={bg}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/probook-icon-128.png" alt="ProAppt" className="w-14 h-14 rounded-2xl shadow-lg mb-4 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900">ProAppt</h1>
          <p className="text-gray-500 text-sm mt-1">Apply to join the contractor network</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Account info */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Account Info</p>
              <div className="space-y-4">
                {field('Full Name', 'name', 'text', 'Jane Smith')}
                {field('Email Address', 'email', 'email', 'jane@smithroofing.com')}
                {pwField('Password', 'password', showPw, setShowPw, 'Set a password — you\'ll use this to log in if your application is approved. At least 8 characters.')}
                {pwField('Confirm Password', 'confirm', showConfirm, setShowConfirm)}
              </div>
            </div>

            {/* Business info */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Business Info</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', formatPhone(e.target.value))}
                    placeholder="(555) 000-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm transition-all outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                {field('Company Name', 'company_name', 'text', 'Smith Roofing LLC')}

                {/* Niche */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Service Type</label>
                  <div className="relative">
                    <select
                      value={form.niche_id}
                      onChange={e => set('niche_id', e.target.value)}
                      className={`w-full appearance-none px-3.5 py-2.5 rounded-xl border text-sm transition-all outline-none pr-9
                        ${errors.niche_id ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100'}`}
                    >
                      <option value="">Select a service type…</option>
                      {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {errors.niche_id && <p className="text-xs text-red-500 mt-1">{errors.niche_id}</p>}
                </div>
              </div>
            </div>

            {/* Service area */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Service Area</p>
              <div className="space-y-4">
                {field('ZIP Codes You Serve', 'service_zip_codes', 'text', '98101, 98102, 98103', 'Comma-separated. We\'ll match you with homeowners in these areas.')}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Service Radius (miles)</label>
                  <div className="relative">
                    <select
                      value={form.service_radius_miles}
                      onChange={e => set('service_radius_miles', e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 pr-9"
                    >
                      {[10, 15, 25, 35, 50].map(r => (
                        <option key={r} value={r}>{r} miles</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">We'll also match you with homeowners within this radius of your ZIP codes.</p>
                </div>
              </div>
            </div>

            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-bold rounded-xl transition-all mt-2"
            >
              {loading ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-500 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by ProAppt — Lead Generation & Scheduling
        </p>
      </div>
    </div>
  );
}
