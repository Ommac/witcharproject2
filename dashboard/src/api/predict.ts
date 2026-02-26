const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type TransactionInput = {
  user_id: number;
  signup_time: string;
  purchase_time: string;
  purchase_value: number;
  device_id: string;
  source: string;
  browser: string;
  sex: string;
  age: number;
  ip_address: number;
  country: string;
  phone_number?: string;
};

export type Decision = 'APPROVED' | 'VERIFY' | 'BLOCK';

export type PredictResponse = {
  Detection: string[];
  risk_score: number[];
  decision: Decision[];
  alert_message: string[];
  otp_sent?: boolean[];
  fraud_alert_sent?: boolean[];
  demo_otp?: (string | null)[];
  SHAP_Explanation?: string;
  LIME_Explanation?: string;
};

export type TransactionRow = TransactionInput & {
  id: string;
  risk_score?: number;
  decision?: Decision;
  alert_message?: string;
  Detection?: string;
  otp_sent?: boolean;
  fraud_alert_sent?: boolean;
  demo_otp?: string | null;
};

export async function predict(transactions: TransactionInput[]): Promise<PredictResponse> {
  const res = await fetch(`${API_BASE}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transactions),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Prediction failed');
  }
  return res.json() as Promise<PredictResponse>;
}

export type VerifyOtpResponse = { valid: boolean; error?: string };

export async function verifyOtp(phoneNumber: string, otp: string): Promise<VerifyOtpResponse> {
  const res = await fetch(`${API_BASE}/api/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, otp }),
  });
  const data = (await res.json()) as VerifyOtpResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Verification failed');
  }
  return data;
}

export function mergeTransactionRows(
  inputs: TransactionInput[],
  response: PredictResponse
): TransactionRow[] {
  return inputs.map((input, i) => ({
    ...input,
    id: crypto.randomUUID(),
    risk_score: response.risk_score[i],
    decision: response.decision[i],
    alert_message: response.alert_message[i],
    Detection: response.Detection[i],
    otp_sent: response.otp_sent?.[i],
    fraud_alert_sent: response.fraud_alert_sent?.[i],
    demo_otp: response.demo_otp?.[i] ?? undefined,
  }));
}
