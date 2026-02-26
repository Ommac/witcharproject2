import React, { useState } from "react";
import PaymentForm, { PaymentFormValues } from "./components/PaymentForm";
import ResultBanner, { DecisionType } from "./components/ResultBanner";

interface ApiSuccessResponse {
  decision: string;
  risk_score: number;
  behavior_reasons: string[];
}

const App: React.FC = () => {
  const [decision, setDecision] = useState<DecisionType>(null);
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [behaviorReasons, setBehaviorReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpMobile, setOtpMobile] = useState<string | null>(null);

  const handleSubmit = async (values: PaymentFormValues) => {
    setLoading(true);
    setErrorMessage(null);
    setDecision(null);
    setRiskScore(null);
    setBehaviorReasons([]);
    setOtpRequired(false);
    setOtpInput("");
    setOtpError(null);
    setOtpMobile(null);

    const payload: Record<string, unknown> = {
      user_id: values.userId.trim(),
      amount: Number(values.amount),
      location: values.location,
      device: values.device
    };

    if (values.mobileNumber.trim()) {
      payload.mobileNumber = values.mobileNumber.replace(/\D/g, "");
    }

    if (values.browser.trim()) {
      payload.browser = values.browser.trim();
    }
    if (values.source.trim()) {
      payload.source = values.source.trim();
    }
    if (values.ipAddress.trim()) {
      payload.ip_address = values.ipAddress.trim();
    }

    try {
      const response = await fetch("http://localhost:5000/transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("Unexpected response from server.");
      }

      if (!response.ok) {
        const message =
          (data as any)?.error ||
          `Payment failed with status ${response.status}.`;
        throw new Error(message);
      }

      const body = data as ApiSuccessResponse;
      const rawDecision = (body.decision || "").toString().toUpperCase();
      const isApprove = rawDecision === "APPROVE" || rawDecision === "APPROVED";
      const isOtp = rawDecision === "OTP" || rawDecision === "VERIFY";

      const normalizedDecision: DecisionType = isApprove
        ? "APPROVE"
        : isOtp
        ? "OTP"
        : "BLOCK";

      setDecision(normalizedDecision);
      const score = typeof body.risk_score === "number" ? body.risk_score : null;
      setRiskScore(score);
      setBehaviorReasons(body.behavior_reasons ?? []);

      if (normalizedDecision === "OTP") {
        setOtpRequired(true);
        setOtpMobile(values.mobileNumber.replace(/\D/g, ""));
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpMobile || !otpInput.trim()) return;
    setOtpError(null);
    setOtpSubmitting(true);
    try {
      const res = await fetch("http://localhost:5000/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobileNumber: otpMobile,
          otp: otpInput.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as any).error || "OTP verification failed.");
      }
      const valid = Boolean((data as any).valid);
      if (valid) {
        setDecision("APPROVE");
        setOtpRequired(false);
        setOtpMobile(null);
        setOtpInput("");
      } else {
        setOtpError((data as any).error || "Invalid or expired OTP.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OTP verification failed.";
      setOtpError(message);
    } finally {
      setOtpSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="layout">
        <section className="left">
          <PaymentForm onSubmit={handleSubmit} disabled={loading} />
        </section>
        <section className="right">
          <ResultBanner
            decision={decision}
            riskScore={riskScore}
            behaviorReasons={behaviorReasons}
            errorMessage={errorMessage}
            loading={loading}
          />
          {!decision && !errorMessage && !loading && (
            <p className="hint">
              Submit a payment on the left to see the fraud decision here.
            </p>
          )}
        </section>
      </div>
      {otpRequired && (
        <div className="otp-overlay" role="dialog" aria-modal="true">
          <div className="otp-modal">
            <h2 className="otp-title">Verify OTP</h2>
            <p className="otp-text">
              OTP sent to {maskMobile(otpMobile)}. Enter the 6-digit code to continue.
            </p>
            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="otp-input"
                placeholder="Enter 6-digit OTP"
                value={otpInput}
                onChange={(e) =>
                  setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                autoFocus
              />
              {otpError && <p className="otp-error">{otpError}</p>}
              <div className="otp-actions">
                <button
                  type="button"
                  className="otp-button otp-button--secondary"
                  onClick={() => {
                    setOtpRequired(false);
                    setOtpMobile(null);
                    setOtpInput("");
                    setOtpError(null);
                  }}
                  disabled={otpSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="otp-button otp-button--primary"
                  disabled={otpSubmitting || otpInput.length < 6}
                >
                  {otpSubmitting ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function maskMobile(mobile: string | null): string {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (digits.length < 4) return "your mobile number";
  return `****${digits.slice(-4)}`;
}

export default App;

