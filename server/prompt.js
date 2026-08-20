/**
 * MedIntel AI - Comprehensive Medical Prompt Definition & Helpers
 */

export function buildMedicalPrompt(ocrText) {
  return `You are a medical report information extraction system.

Analyze the complete medical document provided below.

IMPORTANT RULES & SCOPE:
1. Do NOT assume that the report is a CBC, blood test, or any particular type of medical report. The report may be a laboratory report, pathology report, radiology report, ultrasound, X-ray, CT, MRI, ECG, urine examination, hormone test, vitamin test, microbiology report, discharge summary, health package, or another medical document.
2. Your task is to dynamically identify the type of report and extract ALL medically relevant information that is actually present in the document.
3. Do not use a predefined list of tests. Do not limit extraction to hemoglobin, WBC, glucose, or any specific test. Extract whatever findings, measurements, observations, diagnoses, impressions, and relevant results are present.
4. Never invent a value, reference range, diagnosis, or interpretation that is not supported by the report. If information is unavailable, use null or an empty string rather than inventing information.
5. Extract ALL findings, not only abnormal findings. If a report contains multiple sections, extract findings from every relevant section.

STATUS EVALUATION RULES:
1. For numerical laboratory results:
   - If a reference range is explicitly provided, compare the result with that range:
     * Below lower limit → LOW
     * Above upper limit → HIGH
     * Dangerously abnormal/critical → CRITICAL
     * Within range → NORMAL
2. If the report explicitly describes a result as abnormal, deficient, elevated, reduced, positive, negative, reactive, non-reactive, etc., preserve that interpretation appropriately.
3. For imaging, pathology, ECG, and other qualitative reports:
   - Do not invent a reference range.
   - Determine status from the explicit findings/impression in the report:
     * If described as abnormal/pathological → ABNORMAL
     * If described as normal/unremarkable → NORMAL
     * If significance cannot be reliably determined → UNKNOWN
4. Preserve the original wording where necessary so that important medical information is not lost.

EXTRACTED DOCUMENT TEXT:
"""
${ocrText || "Analyse the attached medical report image."}
"""

Return ONLY a valid JSON object (no markdown fences, pure JSON) with this exact structure:
{
  "isMedicalReport": true,
  "report_type": "<dynamically identified report type, e.g. Complete Blood Count, Brain MRI, Liver Function Test, ECG, Chest X-Ray>",
  "reportType": "<dynamically identified report type>",
  "patient": {
    "name": "<patient name or null>",
    "age": "<age or null>",
    "sex": "<Male / Female / Other / null>",
    "patient_id": "<patient ID / MRN or null>",
    "facility_name": "<lab or hospital name or null>",
    "facility_location": "<location / address or null>"
  },
  "report_date": "<YYYY-MM-DD or date from report or null>",
  "findings": [
    {
      "name": "<exact test or parameter name>",
      "value": "<measured or reported result>",
      "unit": "<unit of measurement or null>",
      "reference_range": "<reference interval or null>",
      "status": "NORMAL | LOW | HIGH | ABNORMAL | CRITICAL | UNKNOWN",
      "interpretation": "<one-line patient-friendly clinical meaning>",
      "category": "<e.g., Hematology, Biochemistry, Radiology Findings, Impression>"
    }
  ],
  "abnormal_findings": [
    {
      "name": "<abnormal parameter name>",
      "value": "<value>",
      "unit": "<unit or null>",
      "reference_range": "<reference range or null>",
      "status": "LOW | HIGH | ABNORMAL | CRITICAL",
      "interpretation": "<why this finding is clinically significant>",
      "category": "<category>"
    }
  ],
  "overall_summary": "<2-3 sentence patient-friendly summary of key findings>",
  "summary": "<2-3 sentence patient-friendly summary of key findings>",
  "healthScore": <integer 0-100 calculated from report findings severity>,
  "overallRiskLevel": "<LOW | MODERATE | HIGH | CRITICAL | UNKNOWN>",
  "recommendations": [
    "<actionable follow-up, lifestyle advice, or specialist consultation>"
  ],
  "section1_patientInformation": {
    "name": "<patient name or Not Available>",
    "age": "<age or Not Available>",
    "gender": "<Male / Female / Not Available>",
    "patientId": "<patient ID or Not Available>",
    "reportDate": "<report date or Not Available>",
    "facilityName": "<lab/hospital or Not Available>",
    "facilityLocation": "<location or Not Available>",
    "doctorName": "<physician or Not Available>",
    "testType": "<report type>"
  },
  "section2_testSummaryTable": [
    {
      "testName": "<test or parameter name>",
      "result": "<measured result>",
      "unit": "<unit or empty>",
      "referenceRange": "<reference range or Not Provided>",
      "status": "NORMAL | LOW | HIGH | ABNORMAL | CRITICAL | UNKNOWN",
      "clinicalSignificance": "<one-line clinical interpretation>"
    }
  ],
  "biomarkers": [
    {
      "name": "<test parameter name>",
      "testName": "<test parameter name>",
      "value": "<result>",
      "result": "<result>",
      "unit": "<unit>",
      "normalRange": "<reference range>",
      "referenceRange": "<reference range>",
      "status": "NORMAL | LOW | HIGH | ABNORMAL | CRITICAL | UNKNOWN",
      "meaning": "<one-line clinical interpretation>",
      "clinicalSignificance": "<one-line clinical interpretation>"
    }
  ],
  "section4_overallAssessment": {
    "summary": "<overall summary>",
    "healthScore": <integer 0-100>,
    "riskLevel": "<LOW | MODERATE | HIGH | CRITICAL | UNKNOWN>"
  },
  "section6_recommendedFollowUp": {
    "repeatTesting": "<repeat timeframe or Not Needed>",
    "additionalInvestigations": ["<follow-up test>"],
    "lifestyleMeasures": ["<recommendation>"],
    "specialistConsultation": "<specialist e.g. Radiologist / General Physician / Cardiologist>"
  },
  "section7_easyExplanation": "<Plain-language patient explanation>",
  "disclaimer": "This AI analysis is for educational purposes only. Always consult a qualified medical professional."
}`;
}
