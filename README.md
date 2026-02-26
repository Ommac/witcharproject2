🚀 Real-Time Payment Fraud Detection System

A real-time fraud detection system that analyzes online payment transactions and determines whether to approve, verify, or block them based on intelligent risk assessment.

The system combines machine learning, rule-based detection, behavioral analysis, trust scoring, and velocity monitoring to prevent fraudulent transactions while minimizing false positives.

🎯 Project Objective

This system evaluates each transaction and makes a decision to:

✅ Approve legitimate payments
🔐 Request OTP verification for suspicious activity
⛔ Block high-risk fraudulent transactions

🧠 Key Features
✔ Real-Time Risk Scoring

ML-based fraud probability scoring

Rule-based fraud pattern detection

Behavioral anomaly detection

Velocity (rapid transaction) monitoring

✔ Trust-Based Decision Engine

Cold-start handling for first-time users

Trust scoring based on user history

Reduced friction for trusted users

✔ Fraud Protection Mechanisms

Blocks automated rapid transaction attacks

Detects suspicious devices & locations

Prevents card testing and bot attacks

✔ OTP Verification System

Medium-risk transactions require OTP verification

Failed verification flags fraud attempts

✔ Monitoring Dashboard

Live transaction monitoring

Risk distribution analytics

Fraud insights & detection trends

🏗 System Architecture

1️⃣ User submits payment
2️⃣ Backend computes ML risk score
3️⃣ Behavior & velocity checks applied
4️⃣ Trust score adjusts risk
5️⃣ Decision: Approve / OTP / Block
6️⃣ Transaction stored & displayed on dashboard

⚙️ Decision Logic Overview
Risk Level	Action
Low Risk	Approve
Medium Risk	OTP Verification
High Risk	Block

🚨 Velocity and contextual fraud rules can override decisions for security.

🛠 Tech Stack
Backend

Python

Flask

MongoDB

XGBoost (Machine Learning Model)

Frontend

React

TypeScript

Dashboard Analytics UI

Services

Twilio OTP Verification

🔐 Fraud Detection Intelligence

The system detects fraud using:

✔ Machine learning probability scoring
✔ Behavioral spending analysis
✔ Velocity detection (rapid attempts)
✔ Device & location risk analysis
✔ Trust-based risk reduction

🧪 Test Scenarios Covered

The system has been tested against:

First-time users

Trusted user transactions

High-value purchases

New device detection

Foreign location risks

Rapid transaction attacks

OTP verification failures

🚀 How to Run the Project
▶ Backend Setup
cd flask-app
pip install -r requirements.txt
python serve_model.py
▶ Payment Page (User Interface)
cd payment-page
npm install
npm run dev
▶ Fraud Monitoring Dashboard
cd dashboard
npm install
npm run dev
📊 Example Fraud Protection Flow

✔ Normal transaction → Approved
✔ Suspicious transaction → OTP verification
✔ Rapid automated attempts → Blocked
✔ Trusted users → Reduced friction

📌 Real-World Applications

Online payment gateways

Banking fraud prevention systems

E-commerce transaction monitoring

Fintech risk management platforms

👨‍💻 Team

Om Pise
Chetan Swami
Arfat Patel
Sneha Rani