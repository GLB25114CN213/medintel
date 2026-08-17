/**
 * MedIntel AI - System Constants & Configuration
 */

export const API_BASE = import.meta.env.VITE_API_URL || "";

export const SAMPLE_REPORTS = [
  {
    id: "sample_cbc",
    title: "Complete Blood Count (CBC) Sample",
    category: "Hematology",
    description: "Sample report with Mild Anemia & Low Hemoglobin",
    file: new File(
      [
        `PATIENT LABORATORY REPORT
Facility: Apex Diagnostics Lab
Patient: Ayanshi Sharma | Age: 28 | Gender: Female
Date: 15-Jan-2026

TEST NAME                 RESULT    UNIT        REFERENCE RANGE    STATUS
-------------------------------------------------------------------------
Hemoglobin (Hb)           9.2       g/dL        12.0 - 15.5        LOW
Total WBC Count           7,400     /uL         4,000 - 11,000     NORMAL
RBC Count                 3.8       million/uL  4.0 - 5.2          LOW
Packed Cell Volume (PCV)  31.5      %           36.0 - 46.0        LOW
MCV                       72.4      fL          80.0 - 100.0       LOW
MCH                       23.1      pg          27.0 - 33.0        LOW
MCHC                      30.2      g/dL        32.0 - 36.0        LOW
Platelet Count            245,000   /uL         150,000 - 450,000  NORMAL
C-Reactive Protein (CRP)  4.8       mg/L        < 5.0              NORMAL`
      ],
      "Sample_CBC_Anemia_Report.txt",
      { type: "text/plain" }
    )
  },
  {
    id: "sample_lipid",
    title: "Lipid Profile Sample",
    category: "Cardiology / Biochemistry",
    description: "Sample report showing Elevated Cholesterol & Triglycerides",
    file: new File(
      [
        `PATIENT LABORATORY REPORT
Facility: Metro Heart & Vascular Care
Patient: Rajesh Kumar | Age: 45 | Gender: Male
Date: 22-Feb-2026

TEST NAME                 RESULT    UNIT        REFERENCE RANGE    STATUS
-------------------------------------------------------------------------
Total Cholesterol         248       mg/dL       < 200              HIGH
Triglycerides             215       mg/dL       < 150              HIGH
HDL (Good Cholesterol)    38        mg/dL       > 40               LOW
LDL (Bad Cholesterol)     162       mg/dL       < 100              HIGH
VLDL                      43        mg/dL       < 30               HIGH
Cholesterol/HDL Ratio     6.5       ratio       < 4.5              HIGH`
      ],
      "Sample_Lipid_Profile.txt",
      { type: "text/plain" }
    )
  },
  {
    id: "sample_lft",
    title: "Liver Function Test (LFT) Sample",
    category: "Hepatology / Gastroenterology",
    description: "Sample report with Mildly Elevated SGPT/ALT",
    file: new File(
      [
        `PATIENT LABORATORY REPORT
Facility: Sunrise Clinical Labs
Patient: David Miller | Age: 36 | Gender: Male
Date: 10-Mar-2026

TEST NAME                 RESULT    UNIT        REFERENCE RANGE    STATUS
-------------------------------------------------------------------------
Serum Bilirubin (Total)   0.9       mg/dL       0.2 - 1.2          NORMAL
SGOT / AST                38        U/L         10 - 40            NORMAL
SGPT / ALT                68        U/L         7 - 56             HIGH
Alkaline Phosphatase      85        U/L         44 - 147           NORMAL
Total Protein             7.1       g/dL        6.0 - 8.3          NORMAL
Serum Albumin             4.2       g/dL        3.5 - 5.2          NORMAL`
      ],
      "Sample_LFT_Report.txt",
      { type: "text/plain" }
    )
  }
];

export const NAV_ITEMS = [
  { id: "analyze", label: "Analyze Report", icon: "FileText" },
  { id: "history", label: "Report History", icon: "History" },
  { id: "chat", label: "AI Health Assistant", icon: "MessageSquare" }
];
