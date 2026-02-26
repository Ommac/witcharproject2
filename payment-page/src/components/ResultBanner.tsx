import React from "react";

export type DecisionType = "APPROVE" | "OTP" | "BLOCK" | null;

interface ResultBannerProps {
  decision: DecisionType;
  riskScore: number | null;
  behaviorReasons: string[];
  errorMessage: string | null;
  loading: boolean;
}

const ResultBanner: React.FC<ResultBannerProps> = ({
  decision,
  riskScore,
  behaviorReasons,
  errorMessage,
  loading
}) => {
  if (loading) {
    return (
      <div className="banner banner-info">
        <p className="banner-title">
          <span className="spinner" aria-hidden="true" />
          Processing payment&hellip;
        </p>
        <p className="banner-text">Running fraud checks in real time.</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="banner banner-error">
        <p className="banner-title">Something went wrong</p>
        <p className="banner-text">{errorMessage}</p>
      </div>
    );
  }

  if (!decision) {
    return null;
  }

  let bannerClass = "banner-info";
  let title = "";
  let description = "";
  let icon = "ℹ";

  if (decision === "APPROVE") {
    bannerClass = "banner-success";
    title = "Payment Successful";
    description = "This transaction matches your normal activity.";
    icon = "✔";
  } else if (decision === "OTP") {
    bannerClass = "banner-warning";
    title = "Verification Required";
    description = "We detected unusual activity and sent an OTP.";
    icon = "⚠";
  } else {
    bannerClass = "banner-error";
    title = "Payment Blocked";
    description = "This transaction was blocked for your security.";
    icon = "⛔";
  }

  const mappedReasons = mapUserFriendlyReasons(behaviorReasons);
  const shouldShowReasons = decision !== "APPROVE" && mappedReasons.length > 0;

  return (
    <div className={`banner banner--decision ${bannerClass}`}>
      <p className="banner-kicker">{decision === "APPROVE" ? "APPROVED" : decision === "OTP" ? "OTP" : "BLOCKED"}</p>
      <p className="banner-title">
        <span className="banner-icon" aria-hidden="true">{icon}</span>
        {title}
      </p>
      <p className="banner-text">
        {description}{" "}
        {riskScore !== null && (
          <span className="banner-score">Risk score: {riskScore.toFixed(1)}</span>
        )}
      </p>
      {shouldShowReasons && (
        <ul className="banner-reasons">
          {mappedReasons.map((reason, idx) => (
            <li key={idx}>{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

function mapUserFriendlyReasons(reasons: string[]): string[] {
  const list = Array.isArray(reasons) ? reasons.filter(Boolean).map(String) : [];
  const out: string[] = [];

  for (const r of list) {
    const lower = r.toLowerCase();
    if (lower.includes("amount")) {
      out.push("Unusual transaction amount");
      continue;
    }
    if (lower.includes("rapid") || lower.includes("velocity")) {
      out.push("Rapid transactions detected");
      continue;
    }
    if (lower.includes("device")) {
      out.push("New device detected");
      continue;
    }
    if (lower.includes("country") || lower.includes("location")) {
      out.push("Unusual location detected");
      continue;
    }
    // Fallback: make it readable but simple
    out.push(r.replace(/\s+/g, " ").trim());
  }

  // Dedupe while preserving order
  const seen = new Set<string>();
  return out.filter((item) => {
    if (!item) return false;
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export default ResultBanner;

