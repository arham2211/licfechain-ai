## Frontend API and Screen Contract

Audience: Frontend engineers building a multi-disease clinical app with timelines, predictions, and AI recommendations.

Base URL: `http://localhost:8001/api/v1`

### Proposal Placeholder APIs (temporary adapters)

These are intentionally temporary until full OCR and dental backend modules are completed:
- `POST /proposal/ocr/ingest`
- `POST /proposal/dental/analyze`
- `GET /proposal/dental/progression/{patient_id}`

### User Roles & Access Control

The system has **three distinct user roles** with different permissions:

1. **Patient Role**
   - Can view: Own dashboard, lab reports, timeline, recommendations, predictions
   - Cannot: Upload lab results, view other patients, modify data
   - Access: All GET endpoints for own `patient_id` only

2. **Doctor Role**
   - Can view: Any patient's dashboard, lab reports, timeline, recommendations, predictions
   - Can create: Doctor visits, diagnoses, prescriptions
   - Cannot: Upload lab results (that's lab staff's job)
   - Access: All GET endpoints for any `patient_id`, POST/PUT for visits

3. **Lab Staff Role** (Lab Technician/Admin)
   - Can create: Lab reports, test results
   - Can update: Lab report status, upload PDFs
   - Can view: All lab reports and test results
   - Cannot: View patient dashboards, recommendations, or modify clinical data
   - Access: Lab-related POST/PUT endpoints, lab report GET endpoints

Backend now enforces authenticated access with JWT bearer tokens and role checks.

Auth endpoints:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Frontend should still keep role-based UI visibility and route guards for UX clarity.

Conventions
- All IDs are UUIDs.
- Timestamps are ISO 8601.
- Pagination where present uses `skip` (offset) and `limit` (page size).
- Disease-agnostic: never hardcode "diabetes"; always treat condition lists generically.
- Stages are strings (e.g., `Normal`, `Controlled`, `Mild`, `Severe`, `Cured`, etc.). Treat as labels, not fixed enum unless your UI maps them.


Roles & Access
- Patient: can only view their own data (use their `patient_id`).
- Doctor: can search/select any patient, then view the same pages using the selected `patient_id`.
- Backend endpoints are identical; the frontend controls access and scoping by `patient_id`.


---

## API Reference - Complete Endpoint Documentation

### Health Check

**GET** `/health`
- **Purpose**: System health status check
- **Response**: 
  ```json
  {
    "status": "healthy",
    "timestamp": "2025-01-15T10:30:00Z"
  }
  ```
- **Use Cases**: Frontend health monitoring, connection testing

---

### Patient Management

#### Create Patient
**POST** `/patients`
- **Purpose**: Register a new patient in the system
- **Access**: Admin/Registration staff
- **Request Body**:
  ```json
  {
    "first_name": "John",
    "last_name": "Doe",
    "cnic": "12345-1234567-1",
    "date_of_birth": "1990-01-15",
    "gender": "male",
    "phone": "+92-300-1234567",
    "email": "john.doe@example.com",
    "address": "123 Main St, City",
    "emergency_contact_name": "Jane Doe",
    "emergency_contact_phone": "+92-300-1234568"
  }
  ```
- **Response**: Patient object with `patient_id` (UUID)
- **Validation**: CNIC must be unique (400 if duplicate)

#### List Patients
**GET** `/patients?search={query}&skip={offset}&limit={page_size}`
- **Purpose**: Search and list patients with pagination
- **Query Parameters**:
  - `search` (optional): Search by name or CNIC
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of patient objects
- **Use Cases**: Patient search, patient list page

#### Get Patient Details
**GET** `/patients/{patient_id}`
- **Purpose**: Get detailed patient information
- **Response**: Complete patient object with all fields
- **Use Cases**: Patient detail page, profile view

#### Update Patient
**PUT** `/patients/{patient_id}`
- **Purpose**: Update patient information
- **Access**: Admin/Registration staff
- **Request Body**: Partial patient update (only include fields to update)
- **Response**: Updated patient object
- **Validation**: CNIC uniqueness checked if updating CNIC

#### Delete Patient
**DELETE** `/patients/{patient_id}`
- **Purpose**: Delete a patient record
- **Access**: Admin only (use with caution - cascades to related records)
- **Response**: `{"message": "Patient deleted successfully"}`

#### Create Family Relationship
**POST** `/patients/{patient_id}/family-relationships`
- **Purpose**: Link a patient to a family member
- **Request Body**:
  ```json
  {
    "relative_patient_id": "UUID-of-relative",
    "relationship_type": "parent|child|sibling|spouse|grandparent|grandchild|uncle|aunt|cousin",
    "is_blood_relative": true
  }
  ```
- **Response**: Family relationship object
- **Validation**: Both patients must exist; duplicate relationships return 409

#### Get Family Relationships
**GET** `/patients/{patient_id}/family-relationships`
- **Purpose**: Get all family relationships for a patient
- **Response**: Array of family relationship objects
- **Use Cases**: Family tree view, relationship management

#### Get Family Disease History
**GET** `/patients/{patient_id}/family-disease-history`
- **Purpose**: Get comprehensive disease history from family members
- **Response**:
  ```json
  {
    "patient_id": "...",
    "patient_name": "...",
    "total_relatives_with_diseases": 3,
    "family_disease_history": [
      {
        "relative_patient_id": "...",
        "relative_name": "...",
        "relationship_type": "parent",
        "date_of_birth": "1960-01-01",
        "gender": "male",
        "total_diseases": 2,
        "disease_names": ["diabetes", "hypertension"],
        "diseases": [
          {
            "disease_name": "diabetes",
            "assessed_date": "2020-05-15",
            "progression_stage": "Controlled",
            "notes": "..."
          }
        ]
      }
    ]
  }
  ```
- **Use Cases**: Risk assessment, family history analysis

#### Get Complete Family Tree
**GET** `/patients/{patient_id}/complete-family-tree`
- **Purpose**: Get full family tree with relationships and disease history
- **Response**: Complete tree structure with patient, relatives, and disease information
- **Use Cases**: Family tree visualization, comprehensive family view

---

### Doctor Management

#### Create Doctor
**POST** `/doctors`
- **Purpose**: Register a new doctor in the system
- **Access**: Admin/HR staff
- **Request Body**:
  ```json
  {
    "name": "Dr. Sarah Ahmed",
    "license_number": "PMDC-12345",
    "specialization": "Cardiology",
    "phone": "+92-300-1234567",
    "email": "sarah.ahmed@hospital.com",
    "qualifications": "MBBS, FCPS",
    "years_of_experience": 10
  }
  ```
- **Response**: Doctor object with `doctor_id` (UUID)
- **Validation**: License number must be unique (400 if duplicate)

#### List Doctors
**GET** `/doctors?search={query}&specialization={spec}&skip={offset}&limit={page_size}`
- **Purpose**: Search and list doctors with filters
- **Query Parameters**:
  - `search` (optional): Search by name or specialization
  - `specialization` (optional): Filter by specialization
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of doctor objects
- **Use Cases**: Doctor directory, doctor selection in visit forms

#### Get Doctor Details
**GET** `/doctors/{doctor_id}`
- **Purpose**: Get detailed doctor information
- **Response**: Complete doctor object
- **Use Cases**: Doctor profile, visit history by doctor

#### Update Doctor
**PUT** `/doctors/{doctor_id}`
- **Purpose**: Update doctor information
- **Access**: Admin/HR staff
- **Request Body**: Partial doctor update
- **Response**: Updated doctor object

#### Delete Doctor
**DELETE** `/doctors/{doctor_id}`
- **Purpose**: Remove a doctor from the system
- **Access**: Admin only
- **Response**: `{"message": "Doctor deleted successfully"}`

#### Get Specializations List
**GET** `/doctors/specializations/list`
- **Purpose**: Get all unique specializations in the system
- **Response**: `{"specializations": ["Cardiology", "Endocrinology", ...]}`
- **Use Cases**: Filter dropdowns, specialization selection

---

### Visit Management (Doctor Visits, Notes, Diagnoses, Prescriptions)

#### Create Visit
**POST** `/visits`
- **Purpose**: Create a new doctor visit record
- **Access**: Doctor role
- **Request Body**:
  ```json
  {
    "patient_id": "UUID-of-patient",
    "doctor_id": "UUID-of-doctor",
    "visit_date": "2025-01-15T10:30:00",
    "visit_type": "consultation|follow_up|routine_checkup|lab_review|emergency",
    "chief_complaint": "Patient complains of chest pain",
    "doctor_notes": "Detailed clinical notes...",
    "vital_signs": {
      "temperature": 98.6,
      "blood_pressure_systolic": 120,
      "blood_pressure_diastolic": 80,
      "heart_rate": 72,
      "respiratory_rate": 18
    }
  }
  ```
- **Response**: Visit object with `visit_id` (UUID)
- **Validation**: Patient and doctor must exist
- **Use Cases**: New visit form, visit creation workflow

#### List Visits
**GET** `/visits?patient_id={uuid}&doctor_id={uuid}&visit_type={type}&start_date={date}&end_date={date}&skip={offset}&limit={page_size}`
- **Purpose**: Get filtered list of visits
- **Query Parameters**:
  - `patient_id` (optional): Filter by patient
  - `doctor_id` (optional): Filter by doctor
  - `visit_type` (optional): Filter by visit type
  - `start_date` (optional): Filter visits from this date
  - `end_date` (optional): Filter visits until this date
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of visit objects (ordered by date, newest first)
- **Use Cases**: Visit history, visit list page, patient visit timeline

#### Get Visit Details
**GET** `/visits/{visit_id}`
- **Purpose**: Get complete visit information
- **Response**: Visit object with all fields
- **Use Cases**: Visit detail page, visit review

#### Update Visit
**PUT** `/visits/{visit_id}`
- **Purpose**: Update visit information (e.g., add notes, update vital signs)
- **Access**: Doctor role (typically the same doctor who created it)
- **Request Body**: Partial visit update
  ```json
  {
    "doctor_notes": "Updated notes after lab review",
    "vital_signs": {
      "blood_pressure_systolic": 130
    }
  }
  ```
- **Response**: Updated visit object
- **Use Cases**: Edit visit, add follow-up notes

#### Delete Visit
**DELETE** `/visits/{visit_id}`
- **Purpose**: Delete a visit record
- **Access**: Admin/Doctor role
- **Response**: `{"message": "Visit deleted successfully"}`
- **Note**: This may cascade delete related symptoms, diagnoses, and prescriptions

---

### Visit Symptoms Management

#### Add Symptom to Visit
**POST** `/visits/{visit_id}/symptoms`
- **Purpose**: Record a symptom observed during the visit
- **Access**: Doctor role
- **Request Body**:
  ```json
  {
    "symptom_name": "chest pain",
    "severity": 7,
    "duration_days": 3,
    "notes": "Pain worsens with exertion"
  }
  ```
- **Response**: Symptom object with `id` (UUID)
- **Use Cases**: Symptom recording during visit, clinical documentation

#### Get Visit Symptoms
**GET** `/visits/{visit_id}/symptoms`
- **Purpose**: Get all symptoms recorded for a visit
- **Response**: Array of symptom objects
- **Use Cases**: Visit detail view, symptom history

---

### Visit Diagnoses Management

#### Add Diagnosis to Visit
**POST** `/visits/{visit_id}/diagnoses`
- **Purpose**: Record a diagnosis made during the visit
- **Access**: Doctor role
- **Request Body**:
  ```json
  {
    "disease_name": "hypertension",
    "diagnosis_date": "2025-01-15T10:30:00",
    "confidence_score": 0.85,
    "ml_model_used": "xgboost-diabetes-v1",
    "status": "suspected|confirmed",
    "notes": "Based on BP readings and patient history"
  }
  ```
- **Response**: Diagnosis object with `diagnosis_id` (UUID)
- **Use Cases**: Diagnosis recording, clinical decision support

#### Get Visit Diagnoses
**GET** `/visits/{visit_id}/diagnoses`
- **Purpose**: Get all diagnoses for a visit
- **Response**: Array of diagnosis objects
- **Use Cases**: Visit summary, diagnosis history

---

### Visit Prescriptions Management

#### Add Prescription to Visit
**POST** `/visits/{visit_id}/prescriptions`
- **Purpose**: Prescribe medication during a visit
- **Access**: Doctor role
- **Request Body**:
  ```json
  {
    "medication_name": "Metformin",
    "dosage": "500mg",
    "frequency": "Twice daily",
    "duration_days": 30,
    "instructions": "Take with meals, monitor blood sugar"
  }
  ```
- **Response**: Prescription object with `prescription_id` (UUID)
- **Use Cases**: Prescription management, medication history

#### Get Visit Prescriptions
**GET** `/visits/{visit_id}/prescriptions`
- **Purpose**: Get all prescriptions for a visit
- **Response**: Array of prescription objects
- **Use Cases**: Prescription list, medication review

---

### Lab Management

#### Create Lab Facility
**POST** `/labs`
- **Purpose**: Register a new lab facility
- **Access**: Admin/Lab staff
- **Request Body**:
  ```json
  {
    "lab_name": "City Diagnostics",
    "lab_location": "Downtown Medical Center",
    "accreditation_number": "ACC-12345",
    "phone": "+92-300-1234567",
    "email": "contact@citydx.com"
  }
  ```
- **Response**: Lab object with `lab_id` (UUID)

#### List Labs
**GET** `/labs?search={query}&skip={offset}&limit={page_size}`
- **Purpose**: Search and list lab facilities
- **Query Parameters**:
  - `search` (optional): Search by lab name or location
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of lab objects

#### Get Lab Details
**GET** `/labs/{lab_id}`
- **Purpose**: Get lab facility information
- **Response**: Lab object

#### Update Lab
**PUT** `/labs/{lab_id}`
- **Purpose**: Update lab facility information
- **Access**: Admin/Lab staff
- **Request Body**: Partial lab update
- **Response**: Updated lab object

#### Delete Lab
**DELETE** `/labs/{lab_id}`
- **Purpose**: Remove a lab facility
- **Access**: Admin only
- **Response**: `{"message": "Lab deleted successfully"}`

---

### Lab Reports Management

#### Create Lab Report
**POST** `/labs/reports`
- **Purpose**: Create a new lab report (before test results are added)
- **Access**: Lab staff role
- **Request Body**:
  ```json
  {
    "patient_id": "UUID-of-patient",
    "lab_id": "UUID-of-lab",
    "visit_id": "UUID-of-visit-or-null",
    "report_date": "2025-01-15T10:00:00",
    "report_type": "biochemistry|hematology|radiology|pathology",
    "status": "pending|completed",
    "pdf_url": null
  }
  ```
- **Response**: Lab report object with `report_id` (UUID)
- **Validation**: Patient and lab must exist; visit_id optional but must exist if provided

#### List Lab Reports
**GET** `/labs/reports?patient_id={uuid}&lab_id={uuid}&report_type={type}&status={status}&start_date={date}&end_date={date}&skip={offset}&limit={page_size}`
- **Purpose**: Get filtered list of lab reports
- **Query Parameters**:
  - `patient_id` (optional): Filter by patient
  - `lab_id` (optional): Filter by lab facility
  - `report_type` (optional): Filter by report type
  - `status` (optional): Filter by status (`pending` or `completed`)
  - `start_date` (optional): Filter from this date
  - `end_date` (optional): Filter until this date
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of lab report objects (ordered by date, newest first)
- **Use Cases**: Lab reports list, patient lab history, pending reports dashboard

#### Get Lab Report Details
**GET** `/labs/reports/{report_id}`
- **Purpose**: Get complete lab report information
- **Response**: Lab report object
- **Use Cases**: Lab report detail page, report review

#### Update Lab Report
**PUT** `/labs/reports/{report_id}`
- **Purpose**: Update lab report (typically to mark as completed or add PDF URL)
- **Access**: Lab staff role
- **Request Body**:
  ```json
  {
    "status": "completed",
    "pdf_url": "https://storage.example.com/reports/abc123.pdf"
  }
  ```
- **Response**: Updated lab report object
- **Use Cases**: Mark report complete, upload PDF

#### Delete Lab Report
**DELETE** `/labs/reports/{report_id}`
- **Purpose**: Delete a lab report
- **Access**: Admin/Lab staff
- **Response**: `{"message": "Lab report deleted successfully"}`
- **Note**: May cascade delete related test results

---

### Lab Test Results Management

#### Add Test Result to Report
**POST** `/labs/reports/{report_id}/test-results`
- **Purpose**: Add an individual test result to a lab report
- **Access**: Lab staff role
- **Request Body**:
  ```json
  {
    "test_name": "hba1c",
    "test_value": 7.8,
    "unit": "%",
    "reference_range_min": 4.0,
    "reference_range_max": 5.6,
    "is_abnormal": true
  }
  ```
- **Response**: Test result object
- **Use Cases**: Lab data entry, test result upload
- **Note**: Call this endpoint multiple times to add multiple test results to the same report

#### Get Test Results for Report
**GET** `/labs/reports/{report_id}/test-results`
- **Purpose**: Get all test results for a specific lab report
- **Response**: Array of test result objects
- **Use Cases**: Lab report detail view, test results display

#### Get Abnormal Test Results
**GET** `/labs/test-results/abnormal?patient_id={uuid}&test_name={name}&skip={offset}&limit={page_size}`
- **Purpose**: Get all abnormal test results (across all patients or filtered)
- **Query Parameters**:
  - `patient_id` (optional): Filter by patient
  - `test_name` (optional): Filter by test name
  - `skip` (default: 0): Pagination offset
  - `limit` (default: 100, max: 1000): Page size
- **Response**: Array of abnormal test result objects
- **Use Cases**: Quality control dashboard, abnormal results alert, patient alerts

---

### ML Inference & Diagnosis

#### Get Model Information
**GET** `/ml/models/info`
- **Purpose**: Get information about loaded ML models
- **Response**:
  ```json
  {
    "models_loaded": {
      "diagnosis": true,
      "progression": true
    },
    "model_versions": {
      "diagnosis": "xgboost-v1",
      "progression": "lstm-v1"
    }
  }
  ```
- **Use Cases**: System status, model availability check

#### Predict Diagnosis (Direct)
**POST** `/ml/diagnosis/predict`
- **Purpose**: Predict diagnosis from lab test data (without patient context)
- **Request Body**:
  ```json
  {
    "fasting_glucose": 120,
    "hba1c": 7.5,
    "hdl": 45,
    "ldl": 120,
    "triglycerides": 150,
    "total_cholesterol": 200,
    "creatinine": 1.0,
    "bmi": 28,
    "systolic_bp": 130,
    "diastolic_bp": 85
  }
  ```
- **Response**:
  ```json
  {
    "prediction": "diabetic",
    "confidence": 0.85,
    "model_used": "xgboost-diabetes-v1",
    "timestamp": "2025-01-15T10:30:00Z"
  }
  ```
- **Use Cases**: Standalone diagnosis prediction, testing

#### Predict Diagnosis for Patient
**POST** `/ml/diagnosis/patient/{patient_id}`
- **Purpose**: Predict diagnosis using patient's latest lab results
- **Response**: Same as above, but uses patient's most recent lab data
- **Use Cases**: Patient diagnosis prediction, clinical decision support

#### Batch Diagnosis Prediction
**POST** `/ml/diagnosis/batch`
- **Purpose**: Predict diagnosis for multiple lab test sets
- **Request Body**:
  ```json
  {
    "patient_id": "UUID",
    "lab_test_results": [
      { "fasting_glucose": 120, "hba1c": 7.5, ... },
      { "fasting_glucose": 110, "hba1c": 7.0, ... }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "patient_id": "...",
    "predictions": [
      { "prediction": "diabetic", "confidence": 0.85, ... },
      { "prediction": "pre-diabetic", "confidence": 0.72, ... }
    ],
    "batch_timestamp": "2025-01-15T10:30:00Z"
  }
  ```
- **Use Cases**: Batch processing, historical analysis

#### Predict Progression (Direct)
**POST** `/ml/progression/predict`
- **Purpose**: Predict disease progression from visit sequence
- **Request Body**:
  ```json
  {
    "visit_sequence": [
      { "visit_date": "2024-01-15", "hba1c": 6.5, "bp": 120 },
      { "visit_date": "2024-04-15", "hba1c": 7.0, "bp": 125 },
      { "visit_date": "2024-07-15", "hba1c": 7.5, "bp": 130 }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "predicted_stage": "worsening",
    "confidence": 0.78,
    "model_used": "lstm-progression-v1",
    "timestamp": "2025-01-15T10:30:00Z"
  }
  ```
- **Use Cases**: Standalone progression prediction

#### Predict Progression for Patient
**POST** `/ml/progression/patient/{patient_id}`
- **Purpose**: Predict progression using patient's visit history
- **Response**: Same as above, but uses patient's visit sequence
- **Use Cases**: Patient progression prediction, treatment planning

#### ML Health Check
**GET** `/ml/health`
- **Purpose**: Check if ML inference service is healthy
- **Response**:
  ```json
  {
    "status": "healthy",
    "models_loaded": {
      "diagnosis": true,
      "progression": true
    },
    "timestamp": "2025-01-15T10:30:00Z"
  }
  ```
- **Use Cases**: Service monitoring, health checks

---

### Page: Patient Dashboard
Purpose
- High-level snapshot for the logged-in patient: recent activity, disease risks, upcoming concerns.

Data Sources
- POST `/reports/patient/{patient_id}/predict-progression?months_ahead=6` → overview of risk per disease (multi-condition).
- GET `/reports/patient/{patient_id}/recommendations` → AI recommendations that include future predictions and latest labs.
- Optional: show a small “Latest labs” snippet from the most recent report.

UI Notes
- Show “Overall trajectory” and risk distribution.
- List top conditions by risk level; link to Timeline, Labs, Recommendations.
- Patient sees only their own `patient_id` context.


### Page: Doctor Dashboard
Purpose
- High-level snapshot for a clinician across patients: search/select a patient, view risks and recent activity.

Data Sources
- GET `/patients?search=…&skip=0&limit=20` → search patients.
- After selection (doctor chooses a `patient_id`):
  - POST `/reports/patient/{patient_id}/predict-progression?months_ahead=6` → patient risk overview.
  - GET `/reports/patient/{patient_id}/recommendations` → AI recommendations for that patient.

UI Notes
- Patient selector (search + recent patients).
- Mirror the Patient Dashboard widgets once a patient is selected.


---

### Page: Lab Staff Dashboard
Purpose
- Overview for lab technicians: pending reports, recent uploads, abnormal results requiring attention.

Data Sources
- GET `/labs/reports?status=pending&skip=0&limit=20` → pending reports awaiting test results.
- GET `/labs/reports?status=completed&skip=0&limit=10` → recently completed reports.
- GET `/labs/test-results/abnormal?skip=0&limit=20` → abnormal test results across all patients (for quality control).

UI Notes
- Show pending reports count and list (link to upload form).
- Show recent completed reports.
- Optional: abnormal results alert (for quality review).
- Quick actions: "Create New Report", "Upload Results", "View All Reports".


---

### Page: Patients List
Purpose
- Search/browse patients.

Data Sources
- GET `/patients?search=…&skip=0&limit=20`
  - Returns a list of patients (name, age, gender, last_visit_date, etc.).
  - If search is unsupported in backend, keep the query param but degrade gracefully.

UI Notes
- Display name, age, gender, and a “View” link to Patient Detail.
- Add search debounce and empty state.


---

### Page: Patient Detail
Purpose
- Patient profile header with key actions.

Data Sources
- GET `/patients/{patient_id}` for demographics.
- Optionally show quick status via POST `/reports/patient/{patient_id}/predict-progression`.

UI Notes
- Header includes name, age, gender, last visit date.
- Tabs: Timeline, Labs, Family, Recommendations, Visits.

---

### Page: Visit Management (Doctor Role)
Purpose
- Create and manage doctor visits with clinical notes, diagnoses, and prescriptions.

Data Sources
- GET `/visits?patient_id={patient_id}&skip=0&limit=20` → list visits for a patient
- GET `/visits/{visit_id}` → get visit details
- POST `/visits` → create new visit
- PUT `/visits/{visit_id}` → update visit (add notes, update vital signs)
- GET `/visits/{visit_id}/symptoms` → get symptoms for visit
- POST `/visits/{visit_id}/symptoms` → add symptom
- GET `/visits/{visit_id}/diagnoses` → get diagnoses for visit
- POST `/visits/{visit_id}/diagnoses` → add diagnosis
- GET `/visits/{visit_id}/prescriptions` → get prescriptions for visit
- POST `/visits/{visit_id}/prescriptions` → add prescription

Visit Creation Workflow
1. **Create Visit**: POST `/visits` with patient_id, doctor_id, visit_date, visit_type, chief_complaint, doctor_notes, vital_signs
2. **Add Symptoms** (optional): POST `/visits/{visit_id}/symptoms` for each symptom
3. **Add Diagnoses** (optional): POST `/visits/{visit_id}/diagnoses` for each diagnosis
4. **Add Prescriptions** (optional): POST `/visits/{visit_id}/prescriptions` for each medication

UI Notes
- Visit form with tabs/sections: Basic Info, Symptoms, Diagnoses, Prescriptions
- Show visit history timeline for patient
- Allow editing visit notes after creation
- Link visits to lab reports (via visit_id in lab report)
- Display vital signs in formatted cards
- Show doctor notes in expandable sections


---

### Page: Timeline (Per Disease) — Graph View
Purpose
- Visualize disease progression over time for a selected condition.

Data Sources
- GET `/reports/patient/{patient_id}/progression-timeline?disease_name={name}&months_back=12`
  - Query: `disease_name` (required), `months_back` optional
  - Output: array of points (date, progression_stage, notes, confidence_score)

Graphing
- X-axis: `date`
- Y-axis: categorical `progression_stage` (map to order in UI)
- Optional tooltips for `confidence_score` and `notes`

UI Notes
- Include a disease selector fed by unique diseases (see Recommendations page source).
- Empty state when no data found.


---

### Page: Labs
Purpose
- Show latest lab results and abnormal flags.

Data Sources
- GET `/labs/reports?skip=0&limit=50` (list) — ensure routes are ordered so `/reports` comes before `/{lab_id}`.
- GET `/labs/reports/{report_id}` (details)
- GET `/labs/reports/{report_id}/results` or included inline depending on backend model

UI Notes
- Group results by visit/report date.
- Highlight `is_abnormal: true` with clear chips/badges.
- Provide filters (date range, test type).


---

### Page: Lab Upload Portal (Lab Staff Role Only)
Purpose
- Allow authorized lab users to create lab reports and upload individual test results.

Access & Roles
- Only lab users (or staff role) create/update; doctors/patients are read-only.

Workflow
1) Create or select a Lab
   - POST `/labs`
     - Body (LabCreate):
       ```json
       {
         "lab_name": "City Diagnostics",
         "lab_location": "Downtown",
         "accreditation_number": "ACC-1234",
         "phone": "+1-555-777-1111",
         "email": "contact@citydx.example"
       }
       ```
     - Response includes `lab_id`.
   - Or list/search labs: GET `/labs?search=city&skip=0&limit=20`

2) Create a Lab Report
   - POST `/labs/reports`
     - Body (LabReportCreate):
       ```json
       {
         "patient_id": "UUID-of-patient",
         "lab_id": "UUID-of-lab",
         "visit_id": "UUID-of-visit-or-null",
         "report_date": "2025-11-08T10:00:00",
         "report_type": "biochemistry",
         "status": "pending",
         "pdf_url": null
       }
       ```
     - Notes:
       - `status`: `pending` | `completed`
       - `visit_id` optional; if present, must exist.
       - `report_type` is a free string; UI can offer presets.

3) Upload Test Results (one per call)
   - POST `/labs/reports/{report_id}/test-results`
     - Body (LabTestResultCreate):
       ```json
       {
         "test_name": "hba1c",
         "test_value": 7.8,
         "unit": "%",
         "reference_range_min": 4.0,
         "reference_range_max": 5.6,
         "is_abnormal": true
       }
       ```
     - Repeat for each test result belonging to the report.

4) Mark Report Completed (optional step when done)
   - PUT `/labs/reports/{report_id}`
     - Body (LabReportUpdate):
       ```json
       {
         "status": "completed",
         "pdf_url": "https://files.example/reports/abc123.pdf"
       }
       ```

Validation & UX
- Validate `patient_id`, `lab_id`, and optional `visit_id` before allowing submit.
- Support draft mode: create report in `pending`, allow result additions, then switch to `completed`.
- Provide success toasts and deep-links to the created report.

Batch Upload
- Current API accepts one test result per request; for CSV uploads, parse client-side and POST results in a loop with progress feedback.


---

### Page: Family History
Purpose
- Visualize family tree and disease history.

Data Sources
- GET `/patients/{patient_id}/complete-family-tree`
  - Returns relatives with relationship type and disease histories.

UI Notes
- Render tree; annotate nodes with known diseases.
- Spouses are not blood relatives; risk logic excludes them (see Risk Assessment).


---

### Page: Progression Report (Comprehensive)
Purpose
- Detailed disease progression report with all relevant data aggregated.

Data Sources
- GET `/reports/patient/{patient_id}/progression-report?disease_name={name}&months_back=12`
  - Query: `disease_name` (required), `months_back` optional (default: 12)
  - Returns comprehensive report with progression data, lab results, visit history
  - Output includes: current stage, progression history, lab trends, visit summary

UI Notes
- Show comprehensive view of disease progression
- Include charts for lab values over time
- Link to detailed timeline and recommendations

---

### Page: Risk Assessment (Genetic/Family)
Purpose
- Show genetic risk based on ancestors/blood relatives only.

Data Sources
- GET `/reports/patient/{patient_id}/risk-assessment`
  - Takes only `patient_id`
  - Excludes spouse and descendants; considers ancestors and blood relatives
  - Output:
    ```json
    {
      "status": "positive",
      "message": "Found 2 disease(s) in 3 ancestor(s)/blood relative(s)",
      "ancestors_count": 5,
      "ancestors_with_diseases_count": 3,
      "unique_diseases": ["diabetes","hypertension"],
      "total_disease_records": 4,
      "relatives_with_diseases": [
        {
          "relative_id": "…",
          "relative_name": "…",
          "relationship_type": "parent",
          "diseases": [ { "disease_name":"…","assessed_date":"…","progression_stage":"…","source":"disease_progression" } ]
        }
      ],
      "assessment_date": "…"
    }
    ```

UI Notes
- Show summary banner and a breakdown list of relatives/diseases.
- Link to Family History for context.

---

### Page: Family History Summary
Purpose
- Quick summary of family disease history for a specific disease (alternative to complete family tree).

Data Sources
- GET `/reports/patient/{patient_id}/family-history?disease_name={name}`
  - Query: `disease_name` (required)
  - Returns summary of family disease history for the specified disease
  - More concise than complete-family-tree endpoint

UI Notes
- Show summary view of family diseases for a specific condition
- Link to complete family tree for detailed view
- Disease selector required


---

### Page: Predictions (Multi-Condition)
Purpose
- Forecast patient’s future progression across all known conditions.

Data Sources
- POST `/reports/patient/{patient_id}/predict-progression?months_ahead=6`
  - Takes only `patient_id` and optional `months_ahead`
  - Auto-discovers all conditions; uses ML if possible, falls back to rule-based
  - See Dashboard section for response shape.

UI Notes
- Table of conditions with current vs predicted stage and risk level.
- Show confidence and “prediction_basis” (ML vs rule-based).
- CTA to Recommendations.


---

### Page: Recommendations (AI-powered)
Purpose
- Provide actionable, personalized recommendations using Gemini LLM.

Data Sources
- GET `/reports/patient/{patient_id}/recommendations`
  - Takes only `patient_id`
  - Internally aggregates:
    - All diseases and recent progressions (last 3 months)
    - Latest lab tests (latest visit)
    - Future predictions via the endpoint above for each disease
  - Output:
    ```json
    {
      "patient_id": "…",
      "patient_name": "…",
      "conditions_identified": ["diabetes","hypertension"],
      "current_stages": { "diabetes":"Controlled","hypertension":"Mild" },
      "future_predictions": {
        "diabetes": { "predicted_stage":"worsening","confidence_score":0.68, "months_ahead":6 }
      },
      "has_recent_data": true,
      "has_lab_tests": true,
      "recommendations": [
        "…actionable guidance based on future predictions and labs…"
      ],
      "generated_at": "…"
    }
    ```

UI Notes
- Show disease-aware recommendation bullet points.
- Handle empty data cases:
  - If no recent data and no labs in 3 months → warn about potential treatment abandonment.
  - If cured/normal detected → provide maintenance/general guidance.


---

### Page: ML Diagnosis (Optional)
Purpose
- On-demand diagnosis predictions from latest data or batch processing.

Data Sources
- POST `/ml/diagnosis/patient/{patient_id}`
- POST `/ml/diagnosis/batch`
  - See backend schemas for `DiagnosisRequest` and `BatchDiagnosisRequest`.

UI Notes
- Prefer showing confidence and thresholds.
- Store responses to allow comparisons over time.


---

### Error States & UX
- 404 “No data found”: show helpful empty states with guidance to change filters.
- 422/UUID parse errors: validate and format IDs client-side.
- 500: Show retry CTA and minimal error details.


---

### Performance & Caching Hints
- Debounce search and timeline filter changes.
- Cache per-patient recommendations and predictions for session to reduce load.
- Lazy-load lab results; paginate large lists.


---

### Multi-Disease Design Checklist
- Disease selector wherever disease-specific views exist (Timeline).
- Reuse prediction and recommendation objects for any disease label.
- Avoid hardcoded enums; map stages to presentation in the UI.


---

### Quick Reference (Endpoints by Role)

**Health Check:**
- GET `/health` - System health status

**Patient & Doctor Roles:**

- **Patients**
  - POST `/patients` - Create patient
  - GET `/patients` - List patients (optional `search`, `skip`, `limit`)
  - GET `/patients/{patient_id}` - Get patient details
  - PUT `/patients/{patient_id}` - Update patient
  - DELETE `/patients/{patient_id}` - Delete patient
  - POST `/patients/{patient_id}/family-relationships` - Add family relationship
  - GET `/patients/{patient_id}/family-relationships` - Get family relationships
  - GET `/patients/{patient_id}/family-disease-history` - Get family disease history
  - GET `/patients/{patient_id}/complete-family-tree` - Get complete family tree

- **Doctors**
  - GET `/doctors` - List doctors (optional `search`, `specialization`, `skip`, `limit`)
  - GET `/doctors/{doctor_id}` - Get doctor details
  - GET `/doctors/specializations/list` - Get all specializations

- **Visits** (Doctor Role - Create/Update)
  - POST `/visits` - Create visit
  - GET `/visits` - List visits (filter by `patient_id`, `doctor_id`, `visit_type`, `start_date`, `end_date`)
  - GET `/visits/{visit_id}` - Get visit details
  - PUT `/visits/{visit_id}` - Update visit
  - DELETE `/visits/{visit_id}` - Delete visit
  - POST `/visits/{visit_id}/symptoms` - Add symptom
  - GET `/visits/{visit_id}/symptoms` - Get visit symptoms
  - POST `/visits/{visit_id}/diagnoses` - Add diagnosis
  - GET `/visits/{visit_id}/diagnoses` - Get visit diagnoses
  - POST `/visits/{visit_id}/prescriptions` - Add prescription
  - GET `/visits/{visit_id}/prescriptions` - Get visit prescriptions

- **Labs** (Read-only for Patients/Doctors)
  - GET `/labs` - List labs (optional `search`)
  - GET `/labs/{lab_id}` - Get lab details
  - GET `/labs/reports` - List lab reports (filter by `patient_id`, `lab_id`, `report_type`, `status`, `start_date`, `end_date`)
  - GET `/labs/reports/{report_id}` - Get lab report details
  - GET `/labs/reports/{report_id}/test-results` - Get test results for report
  - GET `/labs/test-results/abnormal` - Get abnormal test results

- **Reports & Predictions**
  - GET `/reports/patient/{patient_id}/progression-report?disease_name=&months_back=` - Get comprehensive progression report
  - GET `/reports/patient/{patient_id}/progression-timeline?disease_name=&months_back=` - Get progression timeline (categorical stages)
  - GET `/reports/patient/{patient_id}/lab-measurements-timeline?test_name=&months_back=` - Get numerical lab measurements over time (for graphs with spikes)
  - GET `/reports/patient/{patient_id}/risk-assessment` - Get genetic/family risk assessment
  - GET `/reports/patient/{patient_id}/family-history?disease_name={name}` - Get family history summary for specific disease
  - POST `/reports/patient/{patient_id}/predict-progression?months_ahead=` - Predict future progression
  - GET `/reports/patient/{patient_id}/recommendations` - Get AI recommendations

- **ML Inference** (Optional)
  - GET `/ml/models/info` - Get model information
  - POST `/ml/diagnosis/predict` - Predict diagnosis from lab data
  - POST `/ml/diagnosis/patient/{patient_id}` - Predict diagnosis for patient
  - POST `/ml/diagnosis/batch` - Batch diagnosis prediction
  - POST `/ml/progression/predict` - Predict progression from visit sequence
  - POST `/ml/progression/patient/{patient_id}` - Predict progression for patient
  - GET `/ml/health` - ML service health check

**Lab Staff Role:**

- **Labs** (Create/Update)
  - POST `/labs` - Create lab facility
  - GET `/labs` - List labs (optional `search`)
  - GET `/labs/{lab_id}` - Get lab details
  - PUT `/labs/{lab_id}` - Update lab
  - DELETE `/labs/{lab_id}` - Delete lab

- **Lab Reports** (Create/Update)
  - POST `/labs/reports` - Create lab report
  - GET `/labs/reports` - List lab reports (with filters)
  - GET `/labs/reports/{report_id}` - Get lab report details
  - PUT `/labs/reports/{report_id}` - Update lab report (status, PDF URL)
  - DELETE `/labs/reports/{report_id}` - Delete lab report

- **Test Results** (Create/View)
  - POST `/labs/reports/{report_id}/test-results` - Add test result
  - GET `/labs/reports/{report_id}/test-results` - Get test results for report
  - GET `/labs/test-results/abnormal` - Get abnormal test results

**Admin Role:**
- All endpoints above, plus:
  - POST `/doctors` - Create doctor
  - PUT `/doctors/{doctor_id}` - Update doctor
  - DELETE `/doctors/{doctor_id}` - Delete doctor
  - DELETE `/patients/{patient_id}` - Delete patient
  - DELETE `/labs/{lab_id}` - Delete lab


---

### Sample cURL Examples

**Create a Visit:**
```bash
curl -X POST "http://localhost:8001/api/v1/visits" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "uuid-here",
    "doctor_id": "uuid-here",
    "visit_date": "2025-01-15T10:30:00",
    "visit_type": "consultation",
    "chief_complaint": "Patient complains of chest pain",
    "doctor_notes": "Detailed clinical notes...",
    "vital_signs": {
      "temperature": 98.6,
      "blood_pressure_systolic": 120,
      "blood_pressure_diastolic": 80
    }
  }'
```

**Add Prescription to Visit:**
```bash
curl -X POST "http://localhost:8001/api/v1/visits/{visit_id}/prescriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "medication_name": "Metformin",
    "dosage": "500mg",
    "frequency": "Twice daily",
    "duration_days": 30,
    "instructions": "Take with meals"
  }'
```

**Create Lab Report:**
```bash
curl -X POST "http://localhost:8001/api/v1/labs/reports" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "uuid-here",
    "lab_id": "uuid-here",
    "visit_id": "uuid-here",
    "report_date": "2025-01-15T10:00:00",
    "report_type": "biochemistry",
    "status": "pending"
  }'
```

**Add Test Result:**
```bash
curl -X POST "http://localhost:8001/api/v1/labs/reports/{report_id}/test-results" \
  -H "Content-Type: application/json" \
  -d '{
    "test_name": "hba1c",
    "test_value": 7.8,
    "unit": "%",
    "reference_range_min": 4.0,
    "reference_range_max": 5.6,
    "is_abnormal": true
  }'
```

**Predict Future Progression (all conditions):**
```bash
curl -X POST \
  "http://localhost:8001/api/v1/reports/patient/{patient_id}/predict-progression?months_ahead=6" \
  -H "accept: application/json"
```

**Get Recommendations:**
```bash
curl -X GET \
  "http://localhost:8001/api/v1/reports/patient/{patient_id}/recommendations" \
  -H "accept: application/json"
```

**Get Progression Timeline:**
```bash
curl -X GET \
  "http://localhost:8001/api/v1/reports/patient/{patient_id}/progression-timeline?disease_name=hypertension&months_back=12" \
  -H "accept: application/json"
```

**Get Lab Measurements Timeline (for numerical graphs):**
```bash
curl -X GET \
  "http://localhost:8001/api/v1/reports/patient/{patient_id}/lab-measurements-timeline?test_name=hba1c&months_back=12" \
  -H "accept: application/json"
```

**List Visits for Patient:**
```bash
curl -X GET \
  "http://localhost:8001/api/v1/visits?patient_id={patient_id}&skip=0&limit=20" \
  -H "accept: application/json"
```


