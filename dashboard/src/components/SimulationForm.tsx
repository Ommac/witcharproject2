import { useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { predict, verifyOtp, mergeTransactionRows, type TransactionInput, type TransactionRow } from '../api/predict';

type SimulationFormProps = {
  onSuccess: (rows: TransactionRow[]) => void;
  loading: boolean;
  error: string | null;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
};

const defaultValues: TransactionInput = {
  user_id: 1,
  signup_time: '2023-01-01 00:00:00',
  purchase_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
  purchase_value: 99.99,
  device_id: 'device_1',
  source: 'SEO',
  browser: 'Chrome',
  sex: 'M',
  age: 30,
  ip_address: 732758368,
  country: 'India',
  phone_number: '',
};

export function SimulationForm({ onSuccess, loading, error, setLoading, setError }: SimulationFormProps) {
  const [form, setForm] = useState<TransactionInput>(defaultValues);
  const [otpRow, setOtpRow] = useState<TransactionRow | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof TransactionInput>(key: K, value: TransactionInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const payload: TransactionInput[] = [{ ...form }];
        const res = await predict(payload);
        const rows = mergeTransactionRows(payload, res);
        onSuccess(rows);
        const verifRow = rows.find((r) => r.decision === 'VERIFY' && (r.otp_sent || r.demo_otp) && r.phone_number);
        if (verifRow) {
          setOtpRow(verifRow);
          setOtpInput('');
          setOtpError(null);
        }
        setForm((prev) => ({
          ...prev,
          purchase_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
    },
    [form, onSuccess, setError, setLoading]
  );

  const handleVerifyOtp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!otpRow?.phone_number || !otpInput.trim()) return;
      setOtpError(null);
      setOtpVerifying(true);
      try {
        await verifyOtp(otpRow.phone_number, otpInput.trim());
        setOtpRow(null);
        setOtpInput('');
      } catch (err) {
        setOtpError(err instanceof Error ? err.message : 'Verification failed');
      } finally {
        setOtpVerifying(false);
      }
    },
    [otpRow, otpInput]
  );

  return (
    <form className="sim-form" onSubmit={handleSubmit}>
      <div className="sim-form__grid">
        <label>
          <span>User ID</span>
          <input
            type="number"
            value={form.user_id}
            onChange={(e) => update('user_id', Number(e.target.value))}
            min={1}
          />
        </label>
        <label>
          <span>Signup time</span>
          <input
            type="text"
            value={form.signup_time}
            onChange={(e) => update('signup_time', e.target.value)}
            placeholder="YYYY-MM-DD HH:MM:SS"
          />
        </label>
        <label>
          <span>Purchase time</span>
          <input
            type="text"
            value={form.purchase_time}
            onChange={(e) => update('purchase_time', e.target.value)}
            placeholder="YYYY-MM-DD HH:MM:SS"
          />
        </label>
        <label>
          <span>Amount (₹)</span>
          <input
            type="number"
            step={0.01}
            value={form.purchase_value}
            onChange={(e) => update('purchase_value', Number(e.target.value))}
          />
        </label>
        <label>
          <span>Device ID</span>
          <input
            value={form.device_id}
            onChange={(e) => update('device_id', e.target.value)}
            placeholder="device_1"
          />
        </label>
        <label>
          <span>Source</span>
          <select value={form.source} onChange={(e) => update('source', e.target.value)}>
            <option value="SEO">SEO</option>
            <option value="Direct">Direct</option>
            <option value="Ads">Ads</option>
          </select>
        </label>
        <label>
          <span>Browser</span>
          <select value={form.browser} onChange={(e) => update('browser', e.target.value)}>
            <option value="Chrome">Chrome</option>
            <option value="Firefox">Firefox</option>
            <option value="Safari">Safari</option>
          </select>
        </label>
        <label>
          <span>Sex</span>
          <select value={form.sex} onChange={(e) => update('sex', e.target.value)}>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
        <label>
          <span>Age</span>
          <input
            type="number"
            value={form.age}
            onChange={(e) => update('age', Number(e.target.value))}
            min={1}
            max={120}
          />
        </label>
        <label>
          <span>IP (numeric)</span>
          <input
            type="number"
            value={form.ip_address}
            onChange={(e) => update('ip_address', Number(e.target.value))}
          />
        </label>
        <label>
          <span>Country</span>
          <input
            value={form.country}
            onChange={(e) => update('country', e.target.value)}
            placeholder="India"
          />
        </label>
        <label>
          <span>Mobile Number</span>
          <input
            type="tel"
            value={form.phone_number ?? ''}
            onChange={(e) => update('phone_number', e.target.value)}
            placeholder="+1234567890"
          />
        </label>
      </div>
      {error && <p className="sim-form__error">{error}</p>}
      <button type="submit" className="sim-form__submit" disabled={loading}>
        {loading ? 'Submitting…' : (
          <>
            <Send size={18} />
            Simulate transaction
          </>
        )}
      </button>
      {otpRow && (
        <div className="otp-overlay" role="dialog" aria-modal="true" aria-labelledby="otp-title">
          <div className="otp-popup">
            <h3 id="otp-title">Verify OTP</h3>
            <p className="otp-popup__msg">
              {otpRow.demo_otp
                ? `Demo mode: OTP is ${otpRow.demo_otp}. Enter it below to verify.`
                : `OTP sent to ${otpRow.phone_number}. Enter the code below.`}
            </p>
            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="otp-popup__input"
                autoFocus
              />
              {otpError && <p className="otp-popup__error">{otpError}</p>}
              <div className="otp-popup__actions">
                <button type="button" onClick={() => setOtpRow(null)} disabled={otpVerifying}>
                  Cancel
                </button>
                <button type="submit" disabled={otpVerifying || otpInput.length < 6}>
                  {otpVerifying ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`
        .sim-form__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .sim-form label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--color-text-muted);
        }
        .sim-form input, .sim-form select {
          padding: 0.5rem 0.6rem;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          font-size: 0.875rem;
          transition: border-color var(--transition-fast);
        }
        .sim-form input:focus, .sim-form select:focus {
          outline: none;
          border-color: var(--color-approved);
        }
        .sim-form__error {
          margin: 0 0 1rem 0;
          color: var(--color-block);
          font-size: 0.875rem;
        }
        .sim-form__submit {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          background: var(--color-approved);
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: opacity var(--transition-fast), background-color var(--transition-fast);
        }
        .sim-form__submit:hover:not(:disabled) {
          opacity: 0.9;
        }
        .sim-form__submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .otp-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .otp-popup {
          background: var(--color-bg-card);
          border-radius: var(--card-radius);
          padding: 1.5rem;
          max-width: 360px;
          width: 90%;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .otp-popup h3 { margin: 0 0 0.75rem; font-size: 1.125rem; }
        .otp-popup__msg { margin: 0 0 1rem; color: var(--color-text-muted); font-size: 0.875rem; }
        .otp-popup__input {
          width: 100%;
          padding: 0.75rem;
          font-size: 1.25rem;
          text-align: center;
          letter-spacing: 0.5em;
          margin-bottom: 1rem;
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }
        .otp-popup__error { margin: -0.5rem 0 0.75rem; color: var(--color-block); font-size: 0.8125rem; }
        .otp-popup__actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
        }
        .otp-popup__actions button {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--color-border);
          background: var(--color-bg);
        }
        .otp-popup__actions button[type="submit"] {
          background: var(--color-approved);
          color: white;
          border-color: var(--color-approved);
        }
        .otp-popup__actions button:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </form>
  );
}
