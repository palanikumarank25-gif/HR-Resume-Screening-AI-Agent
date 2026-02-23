# HR Resume Screening Agentic AI 🤖

An **Agentic AI workflow built in n8n** that automates HR resume screening:

- Reads resumes
- Matches them against a Job Description (JD)
- Shortlists / rejects candidates
- Stores results in a database
- Sends personalised emails to candidates

---

## ✨ Key Features

- 📄 **resume parsing** (PDF/Doc → structured text)
- 🧠 **AI scoring** against JD (skills, experience, relevance)
- ✅ **Shortlisted vs Rejected decision logic**
- 🗄️ **Stores candidates in a PostgerSql database**
- 📬 **Sends custom emails** to:
  - Shortlisted candidates
  - Rejected candidates (with polite message)
- 📊 **Transparent logs** of every AI decision

---

## 🏗️ Tech Stack

- **n8n** (workflow automation)
- **LLM** (OpenAI)
- **PostgreSQL** (candidate database)
- **Gmail** (email notifications)

---

## 🧩 Workflow Overview

High‑level flow:

1. **Resume Submitted / Collected**  
   - HR uploads candidate resume details into a **Form**.

2. **Extract Resume Content**  
   - Node reads the resume text (name, email, phone, skills, experience).

3. **Resume Tidy / Normalisation**  
   - Cleans up the raw text for the AI model.

4. **Workflow Configuration**  
   - HR defines:
     - Target **Job Role**
     - Required **skills**
     - Min / Max **years of experience**
     - Other rules (must‑have keywords, etc.)

5. **AI Scoring – JD Match**  
   - LLM evaluates candidate vs JD.  
   - Returns structured JSON:
     - `matchScore` (0–100)
     - `matchReason`
     - extracted `skills`
     - `recommendation` (Shortlist / Reject)

6. **Decision Node – Shortlist Logic**  
   - If `matchScore` above threshold → **Shortlisted path**  
   - Else → **Rejected path**

7. **Store in Database / Sheet**  
   - Saves candidate record with:
     - `candidate_name`
     - `email`
     - `phone`
     - `years_of_experience`
     - `skills`
     - `matchScore`
     - `matchReason`
     - `status` (Shortlisted / Rejected)

8. **Send Emails**  
   - **Shortlisted Email**: congratulates candidate + next steps.  
   - **Rejected Email**: polite thanks + optional feedback.

---

## 🚀 Getting Started

### 1. Prerequisites

- n8n (cloud)
- API key for your LLM (OpenAI / Gemini)
- Gmail credentials (for sending emails)
- Database storage

---

### 2. Import the Workflow

1. Download the file:  
   **`Agentic AI HR-Resume Screening workflow.json`** (in this repo).
2. In n8n, go to **Workflows → Import from file**.
3. Select the JSON file and import.

---

### 3. Configure Credentials in n8n

In the workflow:

- Set your **AI credential** (OpenAI / Gemini).
- Set **Gmail**.
- Set **PostgerSql Database** credential.
- Update any environment variables if used.

---

### 4. Customise for Your JD

In the **Workflow Configuration** node, edit:

- Job title
- Required skills
- Experience range
- Shortlisting threshold (e.g. `matchScore >= 70`)

---

## 🧠 AI Prompt Logic (Summary)

The AI model is prompted to:

1. Read candidate details (skills, experience, etc.).
2. Compare them with the job requirements.
3. Return **STRICT JSON** with:
   - `matchScore`
   - `matchReason`
   - `skills`
   - `recommendation`

This JSON is then parsed and used for decision‑making in n8n.

---

