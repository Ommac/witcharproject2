from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import re
import random
import string
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from lime import lime_tabular
import shap
import lime
import pickle
import os
import sys
import matplotlib
matplotlib.use("Agg")

sys.path.append(os.path.join(os.path.dirname(__file__)))
from scripts.feature_engineering import FeatureEngineering
from db import get_collections

# E.164: + followed by 1-15 digits (country code + number)
PHONE_REGEX = re.compile(r'^\+\d{7,15}$')


def _normalize_mobile(raw: Any) -> str:
    """
    Normalize a mobile / phone number input to a trimmed string.

    This is used across OTP flows so that we never rely on hardcoded
    numbers and always work with the user-provided value.
    """
    try:
        return str(raw or "").strip()
    except Exception:
        return ""

# In-memory OTP store (phone -> otp) for demo; use Redis/DB in production
_otp_store = {}


def _validate_phone(phone: str) -> bool:
    """Validate phone format (+countrycode, E.164)."""
    if not phone or not isinstance(phone, str):
        return False
    return bool(PHONE_REGEX.match(phone.strip()))


def _is_valid_mobile_number(phone: str) -> bool:
    """
    Validate a transaction mobile number.

    Requirements:
    - Prefer strict 10-digit format (e.g. "9876543210")
    - Remain backward compatible with existing E.164 callers
      by also accepting numbers that pass _validate_phone.
    """
    if not phone:
        return False
    phone = phone.strip()
    if phone.isdigit() and len(phone) == 10:
        return True
    # Backward compatibility: accept legacy E.164 numbers
    return _validate_phone(phone)


def _send_otp_twilio(phone: str, otp: str) -> bool:
    """Send OTP via Twilio. Returns True if sent, False otherwise."""
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_num = os.environ.get('TWILIO_PHONE_NUMBER')
    if not all([sid, token, from_num]):
        return False
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        client.messages.create(
            body=f"Your verification code is: {otp}. Valid for 10 minutes.",
            from_=from_num,
            to=phone
        )
        return True
    except Exception:
        return False


def _send_fraud_alert_twilio(phone: str, amount: float = 0) -> bool:
    """Send fraud alert via Twilio. Returns True if sent, False otherwise."""
    sid = os.environ.get('TWILIO_ACCOUNT_SID')
    token = os.environ.get('TWILIO_AUTH_TOKEN')
    from_num = os.environ.get('TWILIO_PHONE_NUMBER')
    if not all([sid, token, from_num]):
        return False
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        msg = f"Fraud alert: A transaction was blocked due to high fraud risk."
        if amount:
            msg = f"Fraud alert: A transaction of ₹{amount:.2f} was blocked due to high fraud risk."
        client.messages.create(body=msg, from_=from_num, to=phone)
        return True
    except Exception:
        return False


def _generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))


def behavior_analysis(user_id: Any, amount: float, db) -> Tuple[int, List[str]]:
    """
    Analyze a user's current transaction against their historical behavior.

    Returns:
        behavior_score: integer risk contribution
        behavior_reasons: list of human-readable reasons
    """
    # If no DB handle is available, safely skip behavior analysis
    if db is None:
        return 0, []

    try:
        user_id_str = str(user_id)
        if not user_id_str:
            return 0, []

        amount_val = float(amount or 0)

        # Fetch a small window of recent transactions for this user.
        # Projection keeps documents lightweight.
        cursor = (
            db.find(
                {"user_id": user_id_str},
                {"amount": 1, "timestamp": 1, "_id": 0},
            )
            .sort("timestamp", -1)
            .limit(50)
        )
        history = list(cursor)

        # Not enough history -> no behavior-based adjustment
        if len(history) < 3:
            return 0, []

        # Average historical transaction amount
        total_amount = 0.0
        count_amount = 0
        for doc in history:
            try:
                total_amount += float(doc.get("amount", 0) or 0)
                count_amount += 1
            except (TypeError, ValueError):
                continue

        if count_amount == 0:
            return 0, []

        avg_amount = total_amount / count_amount

        behavior_score = 0
        behavior_reasons: List[str] = []

        # Amount deviation rules
        if avg_amount > 0:
            ratio = amount_val / avg_amount
            if ratio > 15:
                behavior_score += 25
                behavior_reasons.append("Amount significantly higher than usual")
            elif ratio > 5:
                behavior_score += 10
                behavior_reasons.append("Amount significantly higher than usual")

        # Velocity check: transactions in the last 60 seconds
        cutoff = datetime.utcnow() - timedelta(seconds=30)
        recent_count = db.count_documents(
            {"user_id": user_id_str, "timestamp": {"$gte": cutoff}}
        )
        if len(history) >= 5 and recent_count > 5:
            behavior_score += 25
            behavior_reasons.append("Rapid transactions detected")

        return behavior_score, behavior_reasons
    except Exception:
        # Defensive: any failure in behavior analysis should not
        # impact the main prediction flow.
        return 0, []


app = Flask(__name__)
# Enable CORS so the React dashboard (different origin) can call /predict
CORS(app)


def _predict_proba_safe(X):
    """Wrapper so LIME never receives NaN from model (synthetic samples can cause NaN)."""
    proba = model.predict_proba(X)
    if not np.isfinite(proba).all():
        proba = np.nan_to_num(proba, nan=0.5, posinf=1.0, neginf=0.0)
    return proba

# Load model
with open('models/fraud_detection_xgb_model.pkl', 'rb') as f:
    model = pickle.load(f)

# Rule-based risk boost: allowlists for "common" device and browser
COMMON_DEVICES = {'device_1', 'd1', 'mobile'}
COMMON_BROWSERS = {'chrome', 'safari'}
TYPICAL_COUNTRIES = {'india', 'in'}


def _rule_boost(row) -> int:
    """Compute rule-based risk boost (0 or more) from raw row fields."""
    boost = 0
    # +25 if device_id is new or unusual (not in allowlist)
    try:
        dev = str(row.get('device_id', '')).strip()
        if dev not in COMMON_DEVICES:
            boost += 25
    except (TypeError, AttributeError):
        boost += 25
    # +20 if country is outside India baseline
    try:
        country = str(row.get('country', '')).strip().lower()
        if country not in TYPICAL_COUNTRIES:
            boost += 20
    except (TypeError, AttributeError):
        boost += 20
    # +15 if purchase_value > 5000
    try:
        pv = float(row.get('purchase_value', 0))
        if pv > 5000:
            boost += 15
    except (TypeError, ValueError):
        pass
    # +30 if purchase_time within 2 minutes of signup_time
    try:
        pt = row.get('purchase_time')
        st = row.get('signup_time')
        if pd.notna(pt) and pd.notna(st):
            delta = (pt - st).total_seconds()
            if 0 <= delta <= 120:
                boost += 30
    except (TypeError, AttributeError):
        pass
    # +15 if browser is not Chrome or Safari
    try:
        browser = str(row.get('browser', '')).strip().lower()
        if browser not in COMMON_BROWSERS:
            boost += 15
    except (TypeError, AttributeError):
        boost += 15
    return boost

@app.route('/')
def home():
    return ("Welcome to ML based fraud detction")


@app.route('/predict', methods=['POST'])
def detect():
    try:
        json_data = request.get_json()

        # Extract mobile number per row (optional); drop from df so it doesn't enter model pipeline.
        # Support multiple field names for backward compatibility.
        phone_numbers: List[str] = []
        for row in json_data:
            raw_phone = (
                row.get('mobileNumber')
                or row.get('mobile_number')
                or row.get('phone_number')
                or ''
            )
            phone_numbers.append(_normalize_mobile(raw_phone))
            # Remove from model features
            row.pop('mobileNumber', None)
            row.pop('mobile_number', None)
            row.pop('phone_number', None)
        df = pd.DataFrame(json_data)

        df['signup_time'] = pd.to_datetime(df['signup_time'])
        df['purchase_time'] = pd.to_datetime(df['purchase_time'])
      
        # Feature Engineering
        fg = FeatureEngineering(df)
        featured_df = fg.preprocess()
        if len(featured_df) > 0:
            # Ensure no NaN for model (inference-safe)
            featured_df = featured_df.fillna(0)
            # Make detection
            result = model.predict(featured_df.values).tolist()
            detection_results = ["Fraud" if res == 1 else "Not Fraud" for res in result]

            # ML risk score (0-100) from fraud probability
            proba = model.predict_proba(featured_df.values)
            fraud_proba = proba[:, 1] if proba.ndim > 1 else proba
            ml_risk_scores = [min(100, max(0, round(float(p) * 100))) for p in fraud_proba]

            # Rule-based boost and final risk score per row (using raw df)
            _ALERT_APPROVED = "Transaction approved. Low risk."
            _ALERT_VERIFY = "Additional verification required."
            _ALERT_BLOCK = "Transaction blocked due to high fraud risk."
            risk_scores = []
            decisions = []
            alert_messages = []
            otp_sent_list = []
            fraud_alert_sent_list = []
            demo_otp_list = []
            behavior_scores: List[int] = []
            behavior_reasons_list: List[List[str]] = []
            stored_statuses: List[str] = []
            stored_decisions: List[str] = []

            # Obtain transactions collection once for behavior analysis and logging
            try:
                collections = get_collections()
                transactions_col = collections["transactions"]
            except Exception:
                collections = None  # type: ignore[assignment]
                transactions_col = None

            for i in range(len(df)):
                row = df.iloc[i]
                boost = _rule_boost(row)

                # Personalized behavior analysis based on historical patterns
                behavior_score, behavior_reasons = behavior_analysis(
                    user_id=row.get("user_id"),
                    amount=row.get("purchase_value", 0),
                    db=transactions_col,
                )
                behavior_scores.append(behavior_score)
                behavior_reasons_list.append(behavior_reasons)

                final_score = min(100, ml_risk_scores[i] + boost + behavior_score)
                risk_scores.append(final_score)

                phone = phone_numbers[i]
                has_valid_mobile = _is_valid_mobile_number(phone)

                api_decision: str
                stored_status: str
                stored_decision: str
                otp_sent = False
                demo_otp = None
                fraud_sent = False

                # LOW RISK: allow, no OTP
                if final_score < 40:
                    api_decision = "APPROVED"
                    stored_status = "APPROVED"
                    stored_decision = "ALLOW"
                    alert_messages.append(_ALERT_APPROVED)
                    otp_sent = False
                    fraud_sent = False

                # MEDIUM RISK band
                elif final_score <= 74:
                    # If no valid mobile number, treat as HIGH RISK safety block
                    if not has_valid_mobile:
                        api_decision = "BLOCK"
                        stored_status = "BLOCKED"
                        stored_decision = "FRAUD_BLOCKED"
                        alert_messages.append(_ALERT_BLOCK)
                        fraud_sent = False
                        if _validate_phone(phone):
                            try:
                                pv = float(df.iloc[i].get('purchase_value', 0))
                            except (TypeError, ValueError):
                                pv = 0.0
                            fraud_sent = _send_fraud_alert_twilio(phone, pv)
                    else:
                        # Medium risk with valid mobile -> OTP flow
                        api_decision = "VERIFY"
                        stored_status = "OTP_PENDING"
                        stored_decision = "VERIFY_OTP"
                        alert_messages.append(_ALERT_VERIFY)
                        otp = _generate_otp()
                        _otp_store[phone] = otp
                        otp_sent = _send_otp_twilio(phone, otp)
                        if not otp_sent:
                            # Demo / fallback: surface OTP in API response
                            demo_otp = otp

                # HIGH RISK: always blocked, no OTP
                else:
                    api_decision = "BLOCK"
                    stored_status = "BLOCKED"
                    stored_decision = "FRAUD_BLOCKED"
                    alert_messages.append(_ALERT_BLOCK)
                    fraud_sent = False
                    if _validate_phone(phone):
                        try:
                            pv = float(df.iloc[i].get('purchase_value', 0))
                        except (TypeError, ValueError):
                            pv = 0.0
                        fraud_sent = _send_fraud_alert_twilio(phone, pv)

                decisions.append(api_decision)
                stored_statuses.append(stored_status)
                stored_decisions.append(stored_decision)
                otp_sent_list.append(otp_sent)
                fraud_alert_sent_list.append(fraud_sent)
                demo_otp_list.append(demo_otp)

            # Persist every evaluated transaction to MongoDB.
            # This runs after all decisions are computed so it does not
            # interfere with the core ML logic or response shape.
            try:
                if collections is None:
                    collections = get_collections()
                tx_col = collections["transactions"]
                docs = []
                for i in range(len(df)):
                    raw = df.iloc[i]
                    risk_score = risk_scores[i]
                    behavior_score = behavior_scores[i]
                    behavior_reasons = behavior_reasons_list[i]
                    stored_status = stored_statuses[i]
                    stored_decision = stored_decisions[i]
                    phone = phone_numbers[i]

                    docs.append(
                        {
                            "user_id": str(raw.get("user_id", "")),
                            "amount": float(raw.get("purchase_value", 0) or 0),
                            "location": str(raw.get("country", "")),
                            "device": str(raw.get("device_id", "")),
                            "mobile_number": phone or None,
                            "risk_score": float(risk_score),
                            "decision": stored_decision,
                            "status": stored_status,
                            "behavior_score": int(behavior_score),
                            "behavior_reasons": behavior_reasons,
                            "timestamp": datetime.utcnow(),
                        }
                    )

                if docs:
                    tx_col.insert_many(docs, ordered=False)
            except Exception:
                # Database failures must not break the prediction API.
                pass

            # SHAP Explanation (plot object is not JSON-serializable; use placeholder in response)
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(featured_df)
            shap.summary_plot(shap_values, featured_df, plot_type="bar")
            shap_summary = "SHAP bar plot generated (matplotlib object not included in JSON)"

            # LIME Explanation (can fail on single-row or synthetic NaN; fallback to placeholder)
            try:
                lime_explainer = lime_tabular.LimeTabularExplainer(featured_df.values, feature_names=featured_df.columns)
                lime_exp = lime_explainer.explain_instance(featured_df.iloc[0].values, _predict_proba_safe, num_features=5)
                lime_explanation = lime_exp.as_html()
            except (ValueError, Exception):
                lime_explanation = "LIME explanation unavailable for this request."

            payload = {
                'Detection': detection_results,
                'ml_risk_score': ml_risk_scores,
                'risk_score': risk_scores,
                'decision': decisions,
                'alert_message': alert_messages,
                'otp_sent': otp_sent_list,
                'fraud_alert_sent': fraud_alert_sent_list,
                'SHAP_Explanation': shap_summary,
                'LIME_Explanation': lime_explanation
            }
            if any(d is not None for d in demo_otp_list):
                payload['demo_otp'] = demo_otp_list
            return jsonify(payload)
        else:
            return jsonify({'error': 'No data provided for detection'}), 400

    except KeyError as ke:
        return jsonify({'error': f"Missing key in the input data: {ke}"}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/predict', methods=['POST'])
def api_detect():
    """
    API-prefixed alias for the prediction endpoint so that frontend clients
    using /api/predict keep working. Delegates to the core detect handler.
    """
    return detect()


@app.route('/verify-otp', methods=['POST'])
def verify_otp():
    """Verify OTP for a phone number and update transaction status."""
    try:
        data = request.get_json()
        raw_phone = (
            data.get('mobileNumber')
            or data.get('mobile_number')
            or data.get('phone_number')
            or ''
        )
        phone = _normalize_mobile(raw_phone)
        otp = (data.get('otp') or '').strip()
        if not phone or not otp:
            return jsonify({'valid': False, 'error': 'mobile number and otp are required'}), 400
        if not _is_valid_mobile_number(phone):
            return jsonify({'valid': False, 'error': 'Invalid mobile number format'}), 400
        stored = _otp_store.get(phone)
        if stored and stored == otp:
            del _otp_store[phone]
            # Mark any pending transactions for this mobile as approved/allowed
            try:
                collections = get_collections()
                tx_col = collections["transactions"]
                tx_col.update_many(
                    {"mobile_number": phone, "status": "OTP_PENDING"},
                    {"$set": {"status": "APPROVED", "decision": "ALLOW"}},
                )
            except Exception:
                # OTP verification should not fail due to DB issues
                pass
            return jsonify({'valid': True})

        # Failed or expired OTP: mark pending transactions as failed verification
        try:
            if phone in _otp_store:
                del _otp_store[phone]
            collections = get_collections()
            tx_col = collections["transactions"]
            tx_col.update_many(
                {"mobile_number": phone, "status": "OTP_PENDING"},
                {"$set": {"status": "FAILED_VERIFICATION", "decision": "FRAUD_BLOCKED"}},
            )
        except Exception:
            pass
        return jsonify({'valid': False, 'error': 'Invalid or expired OTP'})
    except Exception as e:
        return jsonify({'valid': False, 'error': str(e)}), 400


@app.route('/api/verify-otp', methods=['POST'])
def api_verify_otp():
    """API-prefixed alias for OTP verification."""
    return verify_otp()


def _serialize_mongo_document(doc: Any) -> Dict[str, Any]:
    """
    Convert a MongoDB document into a JSON-serializable dict.

    Production-safety requirements:
    - Never throw exceptions
    - Convert ObjectId to string
    - Convert datetime values to ISO strings (timestamp only if it's a datetime)
    - Convert unknown / non-JSON values into safe string representations
    - Missing/null fields must not crash serialization
    """

    def _json_safe(value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value

        # ObjectId / Decimal128 (optional at type-check time)
        try:
            from bson import ObjectId  # type: ignore

            if isinstance(value, ObjectId):
                return str(value)
        except Exception:
            pass

        try:
            from bson.decimal128 import Decimal128  # type: ignore

            if isinstance(value, Decimal128):
                # Keep numeric-like values JSON friendly
                return float(value.to_decimal())
        except Exception:
            pass

        # Datetime / pandas Timestamp
        if isinstance(value, datetime):
            return value.isoformat()

        try:
            import pandas as _pd  # type: ignore

            if isinstance(value, _pd.Timestamp):
                return value.to_pydatetime().isoformat()
        except Exception:
            pass

        # Numpy scalar types
        try:
            import numpy as _np  # type: ignore

            if isinstance(value, _np.generic):
                return value.item()
        except Exception:
            pass

        if isinstance(value, (list, tuple, set)):
            return [_json_safe(v) for v in value]

        if isinstance(value, dict):
            out: Dict[str, Any] = {}
            for k, v in value.items():
                try:
                    out[str(k)] = _json_safe(v)
                except Exception:
                    out[str(k)] = str(v)
            return out

        try:
            return str(value)
        except Exception:
            return "<unserializable>"

    try:
        raw = dict(doc or {})
    except Exception:
        return {}

    out: Dict[str, Any] = {}
    for key, value in raw.items():
        try:
            if key == "_id":
                out["_id"] = str(value) if value is not None else None
            elif key == "timestamp":
                # Requirement: only convert timestamp if it's a datetime; otherwise leave unchanged
                out["timestamp"] = value.isoformat() if isinstance(value, datetime) else _json_safe(value)
            elif key == "behavior_reasons":
                if value is None:
                    out["behavior_reasons"] = []
                elif isinstance(value, (list, tuple, set)):
                    out["behavior_reasons"] = [str(v) for v in value]
                else:
                    out["behavior_reasons"] = [str(value)]
            else:
                out[key] = _json_safe(value)
        except Exception:
            out[key] = None

    # Ensure the main known fields are present if they exist, without throwing
    # (No-op unless keys are already in the document)
    for k in (
        "_id",
        "timestamp",
        "user_id",
        "amount",
        "location",
        "device",
        "risk_score",
        "behavior_score",
        "behavior_reasons",
        "status",
        "decision",
    ):
        if k in out:
            continue
        if k in raw:
            try:
                out[k] = _json_safe(raw.get(k))
            except Exception:
                out[k] = None

    return out


def _payment_ml_risk_score(amount: float, location: str, device: str) -> float:
    """
    Lightweight ML-style risk score for the payment API.

    This intentionally avoids the heavy feature-engineering + SHAP/LIME stack
    used by `/predict` to keep latency low for the payment flow.
    """
    try:
        amt = float(amount or 0.0)
    except (TypeError, ValueError):
        amt = 0.0

    base = 10.0

    # Amount contribution: simple non-linear scaling
    if amt <= 0:
        base += 0.0
    elif amt < 100:
        base += 5.0
    elif amt < 500:
        base += 15.0
    elif amt < 2000:
        base += 30.0
    elif amt < 5000:
        base += 45.0
    else:
        # Highest tier: slightly reduced to avoid over-penalizing
        # legitimate large purchases while keeping them in OTP range.
        base += 40.0

    # Simple device/location heuristics inspired by the rules in _rule_boost
    try:
        dev = (device or "").strip().lower()
    except Exception:
        dev = ""
    try:
        loc = (location or "").strip().lower()
    except Exception:
        loc = ""

    if dev and dev not in COMMON_DEVICES:
        base += 10.0

    if loc and loc not in TYPICAL_COUNTRIES:
        base += 10.0

    return float(max(0.0, min(100.0, base)))


def _velocity_detection(user_id: Any, db) -> Tuple[int, List[str]]:
    """
    Lightweight velocity detector used by the payment API.

    Returns:
        velocity_score: integer risk contribution
        velocity_reasons: list of human-readable reasons
    """
    if db is None:
        return 0, []

    try:
        user_id_str = str(user_id)
        if not user_id_str:
            return 0, []

        now = datetime.utcnow()

        # Count transactions in a short sliding window
        short_cutoff = now - timedelta(seconds=30)
        short_count = db.count_documents(
            {"user_id": user_id_str, "timestamp": {"$gte": short_cutoff}}
        )

        score = 0
        reasons: List[str] = []

        if short_count >= 5:
            score += 25
            reasons.append("Very high transaction velocity in last 30 seconds")
        elif short_count >= 3:
            score += 15
            reasons.append("High transaction velocity in last 30 seconds")

        return score, reasons
    except Exception:
        return 0, []


def _fetch_user_history_snapshot(user_id: Any, db, limit: int = 20) -> Dict[str, Any]:
    """
    Fetch recent user history used for trust scoring decisions.

    Returns:
        {
            "transaction_count": int,
            "fraud_count": int,
            "known_devices": list[str]
        }
    """
    if db is None:
        return {
            "transaction_count": 0,
            "fraud_count": 0,
            "known_devices": [],
        }

    try:
        user_id_str = str(user_id or "")
        if not user_id_str:
            return {
                "transaction_count": 0,
                "fraud_count": 0,
                "known_devices": [],
            }

        cursor = (
            db.find(
                {"user_id": user_id_str},
                {"device": 1, "status": 1, "decision": 1, "timestamp": 1, "_id": 0},
            )
            .sort("timestamp", -1)
            .limit(int(limit))
        )
        history = list(cursor)

        known_devices = set()
        fraud_count = 0
        for item in history:
            device = str(item.get("device", "") or "").strip().lower()
            if device:
                known_devices.add(device)

            status_upper = str(item.get("status", "") or "").strip().upper()
            decision_upper = str(item.get("decision", "") or "").strip().upper()
            if (
                status_upper in {"BLOCKED", "FAILED_VERIFICATION"}
                or decision_upper == "FRAUD_BLOCKED"
            ):
                fraud_count += 1

        return {
            "transaction_count": len(history),
            "fraud_count": int(fraud_count),
            "known_devices": sorted(list(known_devices)),
        }
    except Exception:
        return {
            "transaction_count": 0,
            "fraud_count": 0,
            "known_devices": [],
        }


def _count_recent_transactions_30s(user_id: Any, db) -> int:
    """Count user transactions in the last 30 seconds for strict velocity overrides."""
    if db is None:
        return 0
    try:
        user_id_str = str(user_id or "")
        if not user_id_str:
            return 0
        cutoff = datetime.utcnow() - timedelta(seconds=30)
        count = db.count_documents({"user_id": user_id_str, "timestamp": {"$gte": cutoff}})
        return int(count)
    except Exception:
        return 0


def _calculate_trust_score(
    transaction_count: int,
    fraud_count: int,
    known_devices: List[str],
    current_device: str,
) -> int:
    """
    Calculate trust score (0-40) based on user history and device consistency.
    """
    score = 0

    tx_count = int(transaction_count or 0)
    if tx_count >= 3:
        score += 10
    if tx_count >= 10:
        score += 10

    known = {str(dev or "").strip().lower() for dev in (known_devices or []) if str(dev or "").strip()}
    curr = str(current_device or "").strip().lower()
    if curr and curr in known:
        score += 10

    if int(fraud_count or 0) == 0:
        score += 10

    return int(max(0, min(40, score)))


def _velocity_decision_override(recent_count: int) -> Tuple[Optional[str], Optional[str]]:
    """Apply strict velocity decision overrides independent of trust adjustments."""
    count = int(recent_count or 0)
    if count >= 5:
        return "BLOCK", "Rapid automated transactions detected"
    if count >= 3:
        return "OTP", "Suspicious rapid transactions"
    return None, None


def _contextual_fraud_override(location: str, amount: float, device: str) -> Optional[str]:
    """
    Return a blocking reason when strong contextual fraud indicators are detected.
    """
    loc = str(location or "").strip().lower()
    dev = str(device or "").strip().lower()

    if loc not in TYPICAL_COUNTRIES and float(amount or 0) > 20000:
        return "High-value transaction from foreign location"

    suspicious_device_markers = ("emulator", "suspicious")
    if dev in {"unknown", "clearly_unknown", "clearly unknown"}:
        return "Transaction blocked from clearly unknown device"
    if any(marker in dev for marker in suspicious_device_markers):
        return "Transaction blocked from suspicious device"

    return None


def _decision_from_score(risk_score: float) -> str:
    """
    Map final risk score to decision for the payment API.
    """
    try:
        score = float(risk_score)
    except (TypeError, ValueError):
        score = 0.0

    if score < 35.0:
        return "APPROVE"
    if score < 70.0:
        return "OTP"
    return "BLOCK"


@app.route('/transaction', methods=['POST'])
def create_transaction():
    """
    Real-time payment endpoint.

    TASK 1: Accept and validate JSON:
    {
        "user_id": "string",
        "amount": number,
        "location": "string",
        "device": "string"
    }

    TASK 2–4:
    - Run ML-style risk scoring, velocity detection, behavior analysis
    - Compute final decision
    - Store transaction in MongoDB
    - Return compact response:
      {
          "decision": "APPROVE" | "OTP" | "BLOCK",
          "risk_score": number,
          "behavior_reasons": []
      }
    """
    try:
        data = request.get_json(force=True, silent=False) or {}
    except Exception:
        return jsonify({"error": "Invalid or missing JSON payload"}), 400

    # TASK 1: basic validation
    required_fields = ["user_id", "amount", "location", "device"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return (
            jsonify(
                {
                    "error": "Missing required fields",
                    "missing": missing,
                }
            ),
            400,
        )

    user_id_raw = data.get("user_id")
    location_raw = data.get("location")
    device_raw = data.get("device")

    try:
        amount_raw = data.get("amount")
        amount_val = float(amount_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Field 'amount' must be a valid number"}), 400

    if amount_val < 0:
        return jsonify({"error": "Field 'amount' must be non-negative"}), 400

    # Defensive string coercion & normalization
    user_id = str(user_id_raw)
    location = str(location_raw or "").strip().lower()
    device = str(device_raw or "").strip().lower()

    # Optional inputs with safe defaults
    browser_raw = data.get("browser")
    source_raw = data.get("source")
    age_raw = data.get("age")
    ip_raw = data.get("ip_address")
    signup_time_raw = data.get("signup_time")
    mobile_raw = (
        data.get("mobileNumber")
        or data.get("mobile_number")
        or data.get("phone_number")
        or ""
    )
    mobile_number = _normalize_mobile(mobile_raw)
    has_valid_mobile = _is_valid_mobile_number(mobile_number)

    # PART 2 – safe defaults
    browser = "unknown"
    if browser_raw not in (None, ""):
        try:
            browser = str(browser_raw).strip().lower() or "unknown"
        except Exception:
            browser = "unknown"

    source = "direct"
    if source_raw not in (None, ""):
        try:
            source = str(source_raw).strip().lower() or "direct"
        except Exception:
            source = "direct"

    age = None
    if age_raw not in (None, ""):
        try:
            age_int = int(age_raw)
            age = age_int if age_int >= 0 else None
        except (TypeError, ValueError):
            age = None

    ip_address = None
    if ip_raw not in (None, ""):
        try:
            ip_candidate = str(ip_raw).strip()
            ip_address = ip_candidate or None
        except Exception:
            ip_address = None

    # signup_time and purchase_time are stored as ISO strings in the document
    signup_time_str = None
    if signup_time_raw not in (None, ""):
        try:
            signup_dt = datetime.fromisoformat(str(signup_time_raw))
            signup_time_str = signup_dt.isoformat()
        except Exception:
            signup_time_str = None

    purchase_time_str = datetime.utcnow().isoformat()

    # Obtain DB handle once; DB issues are surfaced as 500 errors so the
    # calling payment UI knows persistence failed.
    try:
        collections = get_collections()
        tx_col = collections["transactions"]
    except Exception as exc:
        return jsonify({"error": f"Database unavailable: {exc}"}), 500

    # TASK 2: fraud analysis components
    ml_risk = _payment_ml_risk_score(amount_val, location, device)
    behavior_score, behavior_reasons = behavior_analysis(
        user_id=user_id,
        amount=amount_val,
        db=tx_col,
    )
    velocity_score, velocity_reasons = _velocity_detection(user_id=user_id, db=tx_col)

    combined_behavior_score = max(0, int(behavior_score) + int(velocity_score))
    combined_reasons: List[str] = []
    if behavior_reasons:
        combined_reasons.extend(behavior_reasons)
    if velocity_reasons:
        combined_reasons.extend(velocity_reasons)

    final_risk_score = float(max(0.0, min(100.0, ml_risk + combined_behavior_score)))

    # Step 1: user history snapshot for trust model inputs
    history_snapshot = _fetch_user_history_snapshot(user_id=user_id, db=tx_col, limit=20)
    transaction_count = int(history_snapshot.get("transaction_count", 0) or 0)
    fraud_count = int(history_snapshot.get("fraud_count", 0) or 0)
    known_devices = history_snapshot.get("known_devices", []) or []

    # Step 4: strict velocity override (must execute before trust and thresholds)
    recent_count_30s = _count_recent_transactions_30s(user_id=user_id, db=tx_col)
    current_window_count = int(recent_count_30s) + 1
    forced_decision, velocity_override_reason = _velocity_decision_override(current_window_count)

    decision_reasons: List[str] = list(combined_reasons)
    if velocity_override_reason:
        decision_reasons.append(velocity_override_reason)

    # Step 2: trust score derived from user history
    trust_score = _calculate_trust_score(
        transaction_count=transaction_count,
        fraud_count=fraud_count,
        known_devices=known_devices,
        current_device=device,
    )

    # Step 5: trust-adjusted risk (skip adjustment when strict velocity block/OTP override applies)
    if forced_decision in {"BLOCK", "OTP"}:
        adjusted_risk = float(final_risk_score)
    else:
        adjusted_risk = float(max(0.0, final_risk_score - trust_score))

    # Step 3: cold start for first-time users
    cold_start_decision: Optional[str] = None
    if transaction_count == 0 and forced_decision is None:
        if amount_val <= 3000:
            cold_start_decision = "APPROVE"
            decision_reasons.append("First-time user low-value transaction")
        else:
            cold_start_decision = "OTP"
            decision_reasons.append("First-time user high-value transaction requires verification")

    # Step 6: contextual fraud block overrides
    contextual_block_reason = _contextual_fraud_override(
        location=location,
        amount=amount_val,
        device=device,
    )

    # Step 7: final decision resolution with override precedence
    if forced_decision == "BLOCK":
        api_decision = "BLOCK"
    elif contextual_block_reason:
        api_decision = "BLOCK"
        decision_reasons.append(contextual_block_reason)
    elif forced_decision == "OTP":
        api_decision = "OTP"
    elif cold_start_decision is not None:
        api_decision = cold_start_decision
    else:
        api_decision = _decision_from_score(adjusted_risk)

    # Keep reasons compact and deterministic
    if decision_reasons:
        seen = set()
        decision_reasons = [
            reason
            for reason in decision_reasons
            if not (reason in seen or seen.add(reason))
        ]

    # Map API decision + mobile presence into stored status/decision
    if api_decision == "APPROVE":
        stored_status = "APPROVED"
        stored_decision = "ALLOW"
    elif api_decision == "OTP":
        if has_valid_mobile:
            stored_status = "OTP_PENDING"
            stored_decision = "VERIFY_OTP"
        else:
            # Safety: medium risk without a valid mobile is treated as high risk
            api_decision = "BLOCK"
            stored_status = "BLOCKED"
            stored_decision = "FRAUD_BLOCKED"
    else:  # "BLOCK"
        stored_status = "BLOCKED"
        stored_decision = "FRAUD_BLOCKED"

    # Ensure behavior_score and behavior_reasons have consistent safe values
    safe_behavior_score = int(combined_behavior_score) if combined_behavior_score is not None else 0
    safe_behavior_reasons: List[str] = []
    if decision_reasons:
        safe_behavior_reasons = [str(reason) for reason in decision_reasons]

    doc: Dict[str, Any] = {
        "user_id": user_id,
        "amount": float(amount_val),
        "location": location,
        "device": device,
        "signup_time": signup_time_str,
        "purchase_time": purchase_time_str,
        "browser": browser,
        "source": source,
        "age": age,
        "ip_address": ip_address,
        "mobile_number": mobile_number or None,
        "risk_score": float(final_risk_score),
        "adjusted_risk": float(adjusted_risk),
        "trust_score": int(trust_score),
        "behavior_score": safe_behavior_score,
        "behavior_reasons": safe_behavior_reasons,
        "decision": stored_decision,
        "status": stored_status,
        "timestamp": datetime.utcnow(),
    }

    try:
        result = tx_col.insert_one(doc)
        created = tx_col.find_one({"_id": result.inserted_id})
    except Exception as exc:
        # If we cannot safely store the transaction, surface a 500 so
        # the caller knows the operation did not complete.
        return jsonify({"error": f"Failed to store transaction: {exc}"}), 500

    # TASK 4: response to payment page (minimal, dashboard reads from GET /transactions)
    response_body = {
        "decision": api_decision,
        "risk_score": final_risk_score,
        "adjusted_risk": float(adjusted_risk),
        "trust_score": int(trust_score),
        "reasons": decision_reasons,
        "behavior_reasons": decision_reasons,
    }
    return jsonify(response_body), 201


@app.route('/transactions', methods=['GET'])
def list_transactions():
    """
    Return the latest 10 transactions sorted by timestamp (descending).
    """
    try:
        collections = get_collections()
        cursor = (
            collections["transactions"]
            .find()
            .sort("timestamp", -1)
            .limit(10)
        )
        items = []
        for doc in cursor:
            try:
                items.append(_serialize_mongo_document(doc))
            except Exception:
                # Extremely defensive: never fail the whole endpoint due to one bad record.
                items.append({})
        return jsonify(items)
    except Exception as exc:  # pragma: no cover - defensive
        return jsonify({"error": str(exc)}), 500


@app.route('/transactions/stats', methods=['GET'])
def transaction_stats():
    """
    Return full-collection transaction summary statistics.

    This endpoint intentionally aggregates across the entire transactions
    collection so dashboard summary cards can grow beyond the latest 10 rows.
    """
    try:
        collections = get_collections()
        tx_col = collections["transactions"]

        pipeline = [
            {
                "$project": {
                    "status_upper": {"$toUpper": {"$ifNull": ["$status", ""]}},
                    "decision_upper": {"$toUpper": {"$ifNull": ["$decision", ""]}},
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "approved": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$or": [
                                        {"$eq": ["$status_upper", "APPROVED"]},
                                        {"$eq": ["$decision_upper", "ALLOW"]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                    "otp": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$or": [
                                        {"$eq": ["$status_upper", "OTP_PENDING"]},
                                        {"$eq": ["$decision_upper", "VERIFY_OTP"]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                    "blocked": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$or": [
                                        {"$eq": ["$status_upper", "BLOCKED"]},
                                        {"$eq": ["$decision_upper", "FRAUD_BLOCKED"]},
                                        {"$eq": ["$status_upper", "FAILED_VERIFICATION"]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                }
            },
        ]

        result = list(tx_col.aggregate(pipeline))
        stats = result[0] if result else {"total": 0, "approved": 0, "otp": 0, "blocked": 0}

        return jsonify(
            {
                "total": int(stats.get("total", 0) or 0),
                "approved": int(stats.get("approved", 0) or 0),
                "otp": int(stats.get("otp", 0) or 0),
                "blocked": int(stats.get("blocked", 0) or 0),
            }
        )
    except Exception as exc:  # pragma: no cover - defensive
        return jsonify({"error": str(exc)}), 500


@app.route('/fraud-logs', methods=['GET'])
def list_fraud_logs():
    """
    Return the latest fraud alerts from the fraud_logs collection.
    """
    try:
        collections = get_collections()
        cursor = (
            collections["fraud_logs"]
            .find()
            .sort("timestamp", -1)
            .limit(10)
        )
        items = [_serialize_mongo_document(doc) for doc in cursor]
        return jsonify(items)
    except Exception as exc:  # pragma: no cover - defensive
        return jsonify({"error": str(exc)}), 500


@app.route('/test-db', methods=['GET'])
def test_db():
    """
    Simple database health check.

    Inserts a lightweight test record and returns a success message if
    the operation completes.
    """
    try:
        collections = get_collections()
        test_doc = {
            "message": "test",
            "timestamp": datetime.utcnow(),
        }
        collections["fraud_logs"].insert_one(test_doc)
        return jsonify({"status": "ok", "message": "Test record inserted"})
    except Exception as exc:  # pragma: no cover - defensive
        return jsonify({"status": "error", "error": str(exc)}), 500


if __name__ == "__main__":
    print("Starting Fraud Detection API with MongoDB-backed endpoints...")
    app.run(host="127.0.0.1", port=5000, debug=True)
