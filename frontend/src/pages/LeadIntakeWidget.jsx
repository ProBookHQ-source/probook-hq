/**
 * Lead Intake Widget
 * ──────────────────
 * Embeddable on ANY website via iframe:
 *   <iframe src="https://yourdomain.com/get-quote" width="100%" height="600" frameborder="0"></iframe>
 *
 * Or drop it into your own React site as a component.
 */
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import { CheckCircle, Zap, ArrowRight } from 'lucide-react';

function formatPhone(val) {
  const digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

export default function LeadIntakeWidget() {
  const [submitted, setSubmitted] = useState(false);
  const [matched, setMatched] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState('');

  const { data: niches = [] } = useQuery({
    queryKey: ['niches'],
    queryFn: () => api.get('/leads/meta/niches').then(r => r.data),
  });

  const { register, handleSubmit, setValue, formState: { errors } } = useForm();

  const submitLead = useMutation({
    mutationFn: (data) => api.post('/leads', data),
    onSuccess: (res) => {
      setSubmitted(true);
      setMatched(res.data.matched);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Something went wrong. Please try again.'),
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center p-4">
        <div className="card max-w-md w-full text-center shadow-xl">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {matched ? "You're all set!" : "Request received!"}
          </h2>
          <p className="text-gray-500">
            {matched
              ? "We've matched you with a contractor. Check your email for a link to pick your appointment time."
              : "We received your request and will be in touch soon."}
          </p>
          {matched && (
            <div className="mt-4 p-3 bg-brand-50 rounded-xl text-sm text-brand-700 font-medium">
              📧 Check your inbox — booking link on its way!
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-500 rounded-2xl shadow-lg mb-3">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Get a Free Quote</h1>
          <p className="text-gray-500 mt-2">We'll match you with the right contractor and schedule your appointment automatically.</p>
        </div>

        <div className="card shadow-xl">
          <form onSubmit={handleSubmit(d => submitLead.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Your Name *</label>
                <input
                  {...register('name', { required: 'Name is required' })}
                  className="input"
                  placeholder="Jane Smith"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">Email *</label>
                <input
                  {...register('email', {
                    required: 'Email is required',
                    pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' }
                  })}
                  type="email"
                  className="input"
                  placeholder="jane@example.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={phoneDisplay}
                  onChange={e => {
                    const formatted = formatPhone(e.target.value);
                    setPhoneDisplay(formatted);
                    setValue('phone', formatted);
                  }}
                  className="input"
                  placeholder="(555) 000-0000"
                />
              </div>

              <div>
                <label className="label">Service Type *</label>
                <select
                  {...register('niche_id', { required: 'Please select a service' })}
                  className="input"
                >
                  <option value="" disabled>Select a service...</option>
                  {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                {errors.niche_id && <p className="text-red-500 text-xs mt-1">{errors.niche_id.message}</p>}
              </div>

              <div>
                <label className="label">Zip Code *</label>
                <input
                  {...register('zip_code', {
                    required: 'Zip code is required',
                    pattern: { value: /^\d{5}(-\d{4})?$/, message: 'Invalid zip code' }
                  })}
                  className="input"
                  placeholder="10001"
                  maxLength={10}
                />
                {errors.zip_code && <p className="text-red-500 text-xs mt-1">{errors.zip_code.message}</p>}
              </div>

              <div className="col-span-2">
                <label className="label">Describe Your Project</label>
                <textarea
                  {...register('description')}
                  className="input resize-none"
                  rows={3}
                  placeholder="Tell us what needs to be done..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitLead.isPending}
              className="btn-primary w-full justify-center py-3 text-base mt-2"
            >
              <ArrowRight className="w-5 h-5" />
              {submitLead.isPending ? 'Submitting...' : 'Get Matched Now — It\'s Free'}
            </button>

            <p className="text-center text-xs text-gray-400">
              No spam. We'll only contact you about your project.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
