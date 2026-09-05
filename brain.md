# MedIntel — Patient Health Profile Brain

## 1. Core Objective

Convert the current "SIH HDIMS DEMO BAR" / demo patient interface into a real,
production-style Patient Health Profile.

The demo bar must NOT behave like a static showcase or mock/demo control.

The Patient Health Profile must load the actual authenticated patient's data
from the application's backend/database.

The UI should remain visually similar to the existing MedIntel design:
- Dark medical dashboard
- Modern rounded cards
- Cyan/blue accent colors
- Clear medical information hierarchy
- Responsive design
- Professional healthcare UX

---

# 2. Remove Demo Behavior

The following concepts must no longer be treated as demo-only functionality:

- "SIH HDIMS DEMO BAR"
- Hardcoded demo patient ID
- Hardcoded patient information
- Fake patient timeline
- Fake medical records
- Fake doctor access
- Fake QR sharing

If demo data is currently being used, replace it with real database-backed data.

Development/demo seed data may remain in the database for testing, but the frontend
must retrieve it through the same real API/database flow used for actual patients.

---

# 3. Patient Identity

Every patient must have a unique internal patient ID.

Example:

MI-PAT-100245

The patient profile should retrieve the patient using the authenticated user's
identity/session.

Do NOT identify patients only by their name.

Patient identity structure should support:

- patient_id
- full_name
- date_of_birth
- gender
- ABHA ID
- Aadhaar verification status
- blood_group
- phone
- email
- emergency_contact
- address
- profile_photo/avatar
- created_at
- updated_at

---

# 4. Patient Profile Header

The profile header should display:

[Patient Avatar]

Patient Name

Patient ID

Verification status

ABHA ID

Date of Birth

Gender

Age

Example UI:

Aarav Patel
MI-PAT-100245
Aadhaar Verified

ABHA: XXXXXXXX
DOB: 14 May 1990
Male
Age: 35

Do NOT hardcode these values.

They must come from the patient record.

---

# 5. Medical Summary

Display important medical information prominently.

Required fields:

### Blood Group
Example:
O+

### Allergies
Example:
Penicillin, Dust Mites

### Known Conditions
Example:
Hypertension

### Current Medications
Example:
Amlodipine 5mg

### Emergency Contact
Example:
+91 XXXXX XXXXX

### Address
Example:
Greater Noida, Uttar Pradesh

All values must be database-driven.

If a field is empty:

Display:

"Not provided"

Do not display undefined, null, or blank UI.

---

# 6. Patient Health Profile Navigation

Replace the current demo navigation with real application navigation.

Required sections:

1. Health Profile
2. Medical Reports
3. Generate QR
4. Doctor Portal
5. Full Health Journey

Each section must perform a real application action.

### Health Profile

Displays and allows editing of the patient's personal and medical profile.

### Medical Reports

Displays medical reports belonging to the authenticated patient.

Patients should be able to:

- Upload reports
- View reports
- Download reports
- Delete reports where permitted
- See report date
- See report type
- See doctor/hospital information
- See AI analysis status

### Generate QR

Generate a temporary QR-based access mechanism.

The QR must NOT expose the patient's entire database directly.

Instead:

QR -> temporary access token -> authorization endpoint -> authorized record access

The token should:

- Have an expiration time
- Be revocable
- Be associated with the patient
- Record access permissions
- Record creation time
- Record expiry time
- Be invalid after expiration

### Doctor Portal

Doctors should only see patient information after valid authorization.

Doctor access must be permission-based.

### Full Health Journey

Display the patient's longitudinal health timeline.

---

# 7. Longitudinal Health Timeline

The current:

"Longitudinal Health Timeline"

must become a real database-backed timeline.

Timeline events can include:

- Doctor consultation
- Medical report upload
- Diagnosis
- Prescription
- Lab test
- Imaging report
- Hospital visit
- Follow-up
- Referral
- Medication change
- Vaccination
- Emergency visit

Example:

2026-08-20
Blood Test

CBC + Lipid Profile

Doctor:
Dr. XYZ

Hospital:
ABC Hospital

Status:
Completed

---

# 8. Database Architecture

Use the existing project's database technology.

Do NOT introduce a new database technology unless required.

Suggested logical entities:

## patients

- id
- patient_id
- user_id
- full_name
- dob
- gender
- abha_id
- aadhaar_verified
- blood_group
- phone
- email
- emergency_contact
- address
- profile_photo
- created_at
- updated_at

## allergies

- id
- patient_id
- allergy_name
- severity
- reaction

## conditions

- id
- patient_id
- condition_name
- diagnosis_date
- status

## medications

- id
- patient_id
- medicine_name
- dosage
- frequency
- start_date
- end_date
- status

## medical_reports

- id
- patient_id
- report_type
- file_name
- file_url
- report_date
- uploaded_at
- doctor_name
- hospital_name
- ai_analysis
- status

## health_timeline

- id
- patient_id
- event_type
- title
- description
- event_date
- related_report_id
- created_at

## access_tokens

- id
- patient_id
- token
- expires_at
- revoked_at
- created_at
- permissions

---

# 9. AWS Integration

AWS is already connected to MedIntel.

Use AWS for medical document storage according to the existing architecture.

Medical reports should NOT be stored as public files.

Use:

Patient
   ↓
Backend
   ↓
Authorization
   ↓
AWS S3
   ↓
Private medical report

Use temporary/pre-signed access URLs when appropriate.

Never expose:

- AWS access keys
- AWS secret keys
- Private S3 credentials
- Internal infrastructure credentials

in frontend code.

Never make the medical-record S3 bucket public.

---

# 10. API Architecture

The frontend must communicate with the backend/API.

Example endpoints:

GET
/api/patients/me

GET
/api/patients/:patientId

PUT
/api/patients/:patientId

GET
/api/patients/:patientId/reports

POST
/api/patients/:patientId/reports

DELETE
/api/patients/:patientId/reports/:reportId

GET
/api/patients/:patientId/timeline

POST
/api/patients/:patientId/access-token

POST
/api/access-token/revoke

GET
/api/doctor/patients/:patientId

Use the project's existing routing and API conventions instead of blindly
creating duplicate systems.

---

# 11. Authentication

A patient must only be able to access their own profile.

Never trust a patient_id supplied by the frontend as proof of authorization.

Bad:

GET /api/patients/MI-PAT-100245

and blindly return the record.

Correct:

Authenticated user
       ↓
Backend authentication
       ↓
Find associated patient
       ↓
Authorization check
       ↓
Return patient data

The backend must enforce ownership.

---

# 12. Doctor Authorization

Doctor access must be explicitly authorized.

Possible flow:

Patient
   ↓
Generate QR
   ↓
Temporary access token
   ↓
Doctor scans QR
   ↓
Doctor authentication
   ↓
Validate token
   ↓
Check expiry
   ↓
Check permissions
   ↓
Grant temporary access
   ↓
Display authorized records

The doctor should NOT automatically receive unrestricted access to the patient's
entire medical history.

---

# 13. QR Security

Never encode the complete medical record inside the QR code.

Do NOT generate QR containing:

- Name
- ABHA
- Medical history
- Reports
- Phone number
- Address
- Medical conditions

Instead encode a secure temporary token or URL containing a non-sensitive identifier.

Example:

https://medintel.app/access/<temporary-token>

The token should expire automatically.

---

# 14. Medical Report Upload Flow

When a patient uploads a report:

Patient
   ↓
Frontend
   ↓
Backend authentication
   ↓
Validate file
   ↓
Generate secure storage path
   ↓
Upload to private S3 bucket
   ↓
Save metadata in database
   ↓
Create timeline event
   ↓
Optional AI analysis
   ↓
Display report in Medical Reports

Validate:

- File type
- File size
- Authentication
- Patient ownership

Supported formats can include:

- PDF
- JPG
- JPEG
- PNG

Do not allow arbitrary executable files.

---

# 15. AI Medical Report Analysis

If MedIntel's AI analysis is enabled:

Report
   ↓
Secure file retrieval
   ↓
Text/image extraction
   ↓
AI analysis
   ↓
Structured medical findings
   ↓
Store analysis
   ↓
Display to patient

AI output must clearly distinguish:

- Extracted findings
- Possible abnormalities
- Reference ranges where available
- Important observations
- Suggested follow-up

Do not present AI output as a definitive medical diagnosis.

---

# 16. Loading States

Never show an empty profile while data is loading.

Use skeleton/loading states.

Example:

Loading patient profile...

Loading medical reports...

Loading health timeline...

---

# 17. Error Handling

If the API fails:

Show:

"Unable to load your health profile. Please try again."

Do not expose:

- Stack traces
- Database errors
- AWS errors
- Internal API errors
- Credentials
- SQL errors

Provide a retry button.

---

# 18. Empty States

If the patient has no medical reports:

"No medical reports yet."

Button:

"Upload Report"

If there are no allergies:

"No known allergies recorded"

If there are no conditions:

"No medical conditions recorded"

If there is no timeline:

"No health events recorded yet."

---

# 19. Editing Profile

Patient should be able to edit appropriate personal information.

Example:

Edit Profile

Fields:

- Name where permitted
- Phone
- Email
- Emergency contact
- Address
- Blood group
- Allergies
- Other profile information

Sensitive identity information such as ABHA/Aadhaar should not be casually editable.

Changes should be validated server-side.

---

# 20. Audit Logging

Important actions should be recorded.

Examples:

- Patient profile updated
- Report uploaded
- Report viewed
- Report deleted
- QR generated
- QR revoked
- Doctor accessed patient record

Example:

Patient MI-PAT-100245
Doctor access
2026-09-05 10:30
Purpose: Consultation
Access: Medical Reports + Timeline

---

# 21. UI Rules

Keep the current MedIntel visual language.

Use:

- Dark navy background
- Cyan/blue primary accents
- Green for verified/success states
- Red/orange for important medical warnings
- Rounded cards
- Clear typography
- Responsive layout
- Accessible contrast

Do NOT redesign the entire application unnecessarily.

Improve the existing UI instead of replacing working components.

---

# 22. Demo Data Rule

There must be NO frontend code like:

const patient = {
    name: "Aarav Patel",
    patientId: "MI-PAT-100245",
    bloodGroup: "O+"
};

Do not hardcode patient information into React/HTML/JS components.

Instead:

const patient = await getCurrentPatient();

The exact implementation must follow the existing project's framework.

---

# 23. Architecture Principle

The frontend is a VIEW.

The backend is the AUTHORITY.

The database is the SOURCE OF TRUTH.

AWS S3 is the PRIVATE DOCUMENT STORAGE layer.

AI is an ANALYSIS layer.

QR is an AUTHORIZATION mechanism.

Never allow the frontend to become the source of truth.

---

# 24. Implementation Instructions

Before modifying anything:

1. Inspect the existing project structure.
2. Identify the frontend framework.
3. Identify the backend.
4. Identify the database.
5. Identify existing authentication.
6. Identify existing AWS/S3 integration.
7. Identify existing patient/report models.
8. Identify existing APIs.
9. Reuse existing components wherever possible.
10. Do not duplicate existing functionality.

Then implement the Patient Health Profile incrementally.

Priority:

PHASE 1
Real patient data retrieval

PHASE 2
Real profile editing

PHASE 3
Real medical report storage using AWS

PHASE 4
Real longitudinal timeline

PHASE 5
Secure QR authorization

PHASE 6
Doctor portal authorization

PHASE 7
Audit logging

---

# 25. Critical Requirement

The final MedIntel Patient Health Profile should feel like a real healthcare
information system, not a hackathon demo.

Replace:

DEMO BAR
↓
AUTHENTICATED PATIENT PROFILE

Replace:

HARDCODED DATA
↓
DATABASE DATA

Replace:

FAKE REPORTS
↓
REAL AWS-BACKED REPORT STORAGE

Replace:

FAKE QR
↓
TEMPORARY AUTHORIZED ACCESS

Replace:

STATIC TIMELINE
↓
LONGITUDINAL DATABASE-BACKED HEALTH TIMELINE

The existing visual design should be preserved wherever practical while making
the underlying functionality real.