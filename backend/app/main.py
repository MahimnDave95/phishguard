# backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import joblib
import os

app = FastAPI(title="PhishGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Link(BaseModel):
    text: str
    href: str


class EmailData(BaseModel):
    sender: str
    subject: str
    body: str
    links: List[Link] = Field(default_factory=list)


class PredictionResponse(BaseModel):
    label: str
    score: float
    reasons: List[str]
    email: Optional[EmailData] = None
    ml_score: Optional[float] = None
    rule_score: Optional[float] = None


SUSPICIOUS_WORDS = [
    "verify your account",
    "account suspended",
    "login immediately",
    "urgent action",
    "reset your password",
    "unusual activity",
    "unauthorized login",
    "confirm your identity",
]

CREDENTIAL_WORDS = [
    "password",
    "otp",
    "pin",
    "security code",
    "login details",
]

PAYMENT_WORDS = [
    "invoice",
    "payment failed",
    "billing",
    "wire transfer",
    "bank account",
]

SHORTENERS = [
    "bit.ly",
    "tinyurl.com",
    "goo.gl",
    "t.co",
]


# ---------- RULE-BASED ENGINE ----------

def rule_based_score(email: EmailData):
    score = 0.0
    reasons: List[str] = []

    body_lower = email.body.lower()
    subject_lower = email.subject.lower()
    combined = subject_lower + " " + body_lower

    urgent_hits = sum(1 for w in SUSPICIOUS_WORDS if w in combined)
    if urgent_hits > 0:
        add = min(0.25, 0.05 * urgent_hits)
        score += add
        reasons.append(f"Urgent / phishing-like phrases detected ({urgent_hits}).")

    cred_hits = sum(1 for w in CREDENTIAL_WORDS if w in combined)
    if cred_hits > 0:
        add = min(0.2, 0.05 * cred_hits)
        score += add
        reasons.append(f"Mentions credentials or security details ({cred_hits}).")

    pay_hits = sum(1 for w in PAYMENT_WORDS if w in combined)
    if pay_hits > 0:
        add = min(0.2, 0.05 * pay_hits)
        score += add
        reasons.append(f"Mentions payment or invoice-related terms ({pay_hits}).")

    num_links = len(email.links)
    if num_links >= 3:
        add = min(0.2, 0.05 * num_links)
        score += add
        reasons.append(f"Contains many links ({num_links}).")

    suspicious_link_count = 0
    for link in email.links:
        url = link.href.lower()
        if any(s in url for s in SHORTENERS):
            suspicious_link_count += 1

    if suspicious_link_count > 0:
        add = min(0.2, 0.05 * suspicious_link_count)
        score += add
        reasons.append(f"Uses URL shorteners or suspicious domains ({suspicious_link_count}).")

    if len(email.body) > 600 and "dear" not in combined:
        score += 0.1
        reasons.append("Long email with generic tone (no 'dear ...').")

    score = max(0.0, min(1.0, score))

    if not reasons:
        reasons.append("No strong phishing indicators found by rule-based engine.")

    return score, reasons


# ---------- ML MODEL LOADING ----------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "phishing_model.pkl")
ml_model = None


@app.on_event("startup")
def load_model():
    global ml_model
    if os.path.exists(MODEL_PATH):
        ml_model = joblib.load(MODEL_PATH)
        print("Loaded ML phishing model from", MODEL_PATH)
    else:
        print("Warning: ML model file not found, rule-based only.")


def ml_score(email: EmailData) -> Optional[float]:
    """
    Returns probability email is phishing (between 0 and 1).
    If model not loaded, returns None.
    """
    if ml_model is None:
        return None

    text = (email.subject + " " + email.body).strip()
    if not text:
        return 0.0

    proba = ml_model.predict_proba([text])[0]  # [prob_safe, prob_phishing]
    return float(proba[1])


# ---------- API ENDPOINTS ----------

@app.get("/health")
async def health():
    return {"status": "ok", "ml_loaded": ml_model is not None}


@app.post("/predict", response_model=PredictionResponse)
async def predict(email: EmailData):
    """
    Hybrid phishing scoring: ML + rules.
    """
    # Rule-based
    rule_s, rule_reasons = rule_based_score(email)

    # ML-based
    ml_s = ml_score(email)

    # Combine
    if ml_s is None:
        final_score = rule_s
        combined_reasons = rule_reasons
        final_label = "phishing" if final_score >= 0.7 else "suspicious" if final_score >= 0.4 else "safe"
    else:
        final_score = 0.7 * ml_s + 0.3 * rule_s
        combined_reasons = list(rule_reasons)
        combined_reasons.append(f"ML model score: {ml_s:.2f}")
        final_label = "phishing" if final_score >= 0.7 else "suspicious" if final_score >= 0.4 else "safe"

    return PredictionResponse(
        label=final_label,
        score=final_score,
        reasons=combined_reasons,
        email=email,
        ml_score=ml_s,
        rule_score=rule_s
    )