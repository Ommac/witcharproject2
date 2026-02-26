import React, { useState } from "react";

export interface PaymentFormValues {
  userId: string;
  amount: string;
  location: string;
  device: string;
  browser: string;
  source: string;
  age: string;
  ipAddress: string;
  mobileNumber: string;
}

interface PaymentFormProps {
  onSubmit: (values: PaymentFormValues) => Promise<void> | void;
  disabled: boolean;
}

const defaultValues: PaymentFormValues = {
  userId: "",
  amount: "",
  location: "india",
  device: "mobile",
  browser: "",
  source: "",
  age: "",
  ipAddress: "",
  mobileNumber: ""
};

const PaymentForm: React.FC<PaymentFormProps> = ({ onSubmit, disabled }) => {
  const [values, setValues] = useState<PaymentFormValues>(defaultValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "upi" | "netbanking">("card");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name } = e.target;
    let { value } = e.target;

    if (name === "mobileNumber") {
      // Numeric-only, max 10 digits
      value = value.replace(/\D/g, "").slice(0, 10);
    }

    setValues((prev) => ({ ...prev, [name]: value }));
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { userId, amount, location, device, mobileNumber } = values;

    if (!userId.trim() || !amount.trim() || !location || !device || !mobileNumber.trim()) {
      setValidationError("Please fill in all required fields before submitting.");
      return;
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError("Amount must be a number greater than 0.");
      return;
    }

    const digitsOnly = mobileNumber.replace(/\D/g, "");
    if (digitsOnly.length !== 10) {
      setValidationError("Mobile number must be exactly 10 digits.");
      return;
    }

    await onSubmit(values);

    // Reset form after successful submission attempt; any backend
    // errors will be communicated via parent component.
    setValues(defaultValues);
  };

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h1 className="card-title card-title--secure">
        <span className="title-lock" aria-hidden="true">🔒</span>
        Secure Payment
      </h1>
      <p className="card-subtitle">
        All transactions are protected by AI fraud detection.
      </p>

      <section className="payment-method" aria-label="Payment Method">
        <p className="payment-method__title">Payment Method</p>
        <div className="payment-method__options" role="radiogroup" aria-label="Payment Method">
          <label className="method-option">
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === "card"}
              onChange={() => setPaymentMethod("card")}
              disabled={disabled}
            />
            <span>Card</span>
          </label>
          <label className="method-option">
            <input
              type="radio"
              name="paymentMethod"
              value="upi"
              checked={paymentMethod === "upi"}
              onChange={() => setPaymentMethod("upi")}
              disabled={disabled}
            />
            <span>UPI</span>
          </label>
          <label className="method-option">
            <input
              type="radio"
              name="paymentMethod"
              value="netbanking"
              checked={paymentMethod === "netbanking"}
              onChange={() => setPaymentMethod("netbanking")}
              disabled={disabled}
            />
            <span>Net Banking</span>
          </label>
        </div>
      </section>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">User ID</span>
          <input
            type="text"
            name="userId"
            value={values.userId}
            onChange={handleChange}
            className="field-input"
            placeholder="e.g. user_123"
            disabled={disabled}
          />
        </label>

        <label className="field">
          <span className="field-label">Amount (USD)</span>
          <input
            type="number"
            name="amount"
            value={values.amount}
            onChange={handleChange}
            className="field-input"
            placeholder="e.g. 150"
            min={0}
            step="0.01"
            disabled={disabled}
          />
        </label>

        <label className="field">
          <span className="field-label">Location</span>
          <select
            name="location"
            value={values.location}
            onChange={handleChange}
            className="field-input"
            disabled={disabled}
          >
            <option value="india">India</option>
            <option value="us">USA</option>
            <option value="russia">Russia</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Device</span>
          <select
            name="device"
            value={values.device}
            onChange={handleChange}
            className="field-input"
            disabled={disabled}
          >
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Mobile Number</span>
          <input
            type="tel"
            name="mobileNumber"
            value={values.mobileNumber}
            onChange={handleChange}
            className="field-input"
            placeholder="10-digit mobile number"
            disabled={disabled}
            inputMode="numeric"
            pattern="\d{10}"
          />
          <span className="field-help">We use this number for security verification.</span>
        </label>
      </div>

      <details className="advanced">
        <summary className="advanced-summary">
          <span>Security &amp; Device Details</span>
          <span className="advanced-chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="advanced-grid">
          <label className="field">
            <span className="field-label">Browser</span>
            <select
              name="browser"
              value={values.browser}
              onChange={handleChange}
              className="field-input"
              disabled={disabled}
            >
              <option value="">Select browser</option>
              <option value="chrome">Chrome</option>
              <option value="safari">Safari</option>
              <option value="firefox">Firefox</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Source</span>
            <select
              name="source"
              value={values.source}
              onChange={handleChange}
              className="field-input"
              disabled={disabled}
            >
              <option value="">Select source</option>
              <option value="direct">Direct</option>
              <option value="seo">SEO</option>
              <option value="ads">Ads</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Age</span>
            <input
              type="number"
              name="age"
              value={values.age}
              onChange={handleChange}
              className="field-input"
              placeholder="e.g. 32"
              min={0}
              disabled={disabled}
            />
          </label>

          <label className="field">
            <span className="field-label">IP Address</span>
            <input
              type="text"
              name="ipAddress"
              value={values.ipAddress}
              onChange={handleChange}
              className="field-input"
              placeholder="e.g. 203.0.113.42"
              disabled={disabled}
            />
          </label>
        </div>
      </details>

      {validationError && (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        className="primary-button"
        disabled={disabled}
      >
        {disabled ? (
          <span className="button-inline">
            <span className="spinner" aria-hidden="true" />
            Analyzing payment…
          </span>
        ) : (
          <span className="button-inline">
            <span aria-hidden="true">🔒</span>
            Pay Securely
          </span>
        )}
      </button>

      <div className="trust-indicators" aria-label="Trust indicators">
        <p className="trust-note">🔒 Bank-grade encryption</p>
        <p className="trust-note">🛡 AI fraud protection</p>
        <p className="trust-note">⚡ Real-time risk monitoring</p>
      </div>
    </form>
  );
};

export default PaymentForm;

