export type SurveyQuestionType =
  "rating" | "nps" | "single_choice" | "multi_choice" | "yes_no" | "short_text" | "long_text"

export type SurveyQuestionDraft = {
  id: string
  type: SurveyQuestionType
  label: string
  helpText?: string
  required: boolean
  options?: string[]
}

export const QUESTION_TYPE_META: Record<
  SurveyQuestionType,
  { label: string; hint: string; hasOptions?: boolean }
> = {
  rating: { label: "Star rating (1–5)", hint: "Tap 1 to 5 stars" },
  nps: { label: "NPS scale (0–10)", hint: "How likely to recommend (0–10)" },
  single_choice: {
    label: "Single choice",
    hint: "Pick one option from radio cards",
    hasOptions: true,
  },
  multi_choice: {
    label: "Multiple choice",
    hint: "Select all that apply",
    hasOptions: true,
  },
  yes_no: { label: "Yes / No", hint: "Simple two-choice answer" },
  short_text: { label: "Short answer", hint: "Single-line text reply" },
  long_text: { label: "Open feedback", hint: "Multi-line comments & suggestions" },
}

export type SurveyTemplate = {
  key: string
  name: string
  badge: string
  title: string
  description: string
  thankYouMessage: string
  collectContact: boolean
  questions: SurveyQuestionDraft[]
}

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: "patient_satisfaction",
    name: "Patient Satisfaction Survey",
    badge: "Hospital · Popular",
    title: "Patient Satisfaction Survey",
    description:
      "Your feedback helps our doctors, nurses, and support staff deliver safer, kinder care. Takes under 1 minute.",
    thankYouMessage:
      "Thank you for sharing your experience with us. Our patient care team reviews every response.",
    collectContact: true,
    questions: [
      {
        id: "q_overall",
        type: "rating",
        label: "How would you rate your overall experience today?",
        required: true,
      },
      {
        id: "q_nps",
        type: "nps",
        label: "How likely are you to recommend our hospital to family or friends?",
        helpText: "0 = Not at all likely, 10 = Extremely likely",
        required: true,
      },
      {
        id: "q_dept",
        type: "single_choice",
        label: "Which department did you visit?",
        required: true,
        options: [
          "OPD / Consultation",
          "Emergency",
          "Inpatient Ward",
          "Diagnostics & Lab",
          "Pharmacy",
          "Billing & Reception",
        ],
      },
      {
        id: "q_care",
        type: "rating",
        label: "How satisfied were you with doctor & nursing care?",
        required: true,
      },
      {
        id: "q_clean",
        type: "yes_no",
        label: "Were the waiting area, rooms, and washrooms clean and comfortable?",
        required: true,
      },
      {
        id: "q_highlights",
        type: "multi_choice",
        label: "What went particularly well during your visit?",
        required: false,
        options: [
          "Polite & attentive staff",
          "Clear explanation by doctor",
          "Short waiting time",
          "Clean & hygienic premises",
          "Smooth billing & registration",
        ],
      },
      {
        id: "q_comments",
        type: "long_text",
        label: "Any suggestions on how we can improve?",
        helpText: "Please avoid sharing personal medical diagnosis details here.",
        required: false,
      },
    ],
  },
  {
    key: "opd_pulse",
    name: "OPD Waiting & Registration Pulse",
    badge: "Clinic · Quick 30s",
    title: "OPD Experience Check-In",
    description: "Quick 4-question check on waiting time, registration, and consultation.",
    thankYouMessage: "Thank you! Your response helps us reduce waiting times.",
    collectContact: false,
    questions: [
      {
        id: "q_wait",
        type: "single_choice",
        label: "How long did you wait before seeing the doctor?",
        required: true,
        options: ["Under 15 mins", "15–30 mins", "30–60 mins", "Over 1 hour"],
      },
      {
        id: "q_desk",
        type: "rating",
        label: "How smooth was registration & token handling?",
        required: true,
      },
      {
        id: "q_doctor",
        type: "yes_no",
        label: "Did the doctor explain your treatment plan clearly?",
        required: true,
      },
      {
        id: "q_note",
        type: "long_text",
        label: "Anything we could have done faster or better?",
        required: false,
      },
    ],
  },
  {
    key: "discharge_feedback",
    name: "Inpatient Discharge Experience",
    badge: "Inpatient · NABH",
    title: "Discharge & Inpatient Care Survey",
    description:
      "Before you head home, please tell us how our ward and discharge team supported you.",
    thankYouMessage: "Wishing you a speedy recovery! Thank you for helping us improve.",
    collectContact: true,
    questions: [
      {
        id: "q_ward",
        type: "rating",
        label: "Nursing responsiveness & ward comfort",
        required: true,
      },
      {
        id: "q_food",
        type: "rating",
        label: "Meal quality, hygiene & timely delivery",
        required: false,
      },
      {
        id: "q_discharge_clear",
        type: "yes_no",
        label: "Were your discharge medications and follow-up instructions explained clearly?",
        required: true,
      },
      {
        id: "q_nps",
        type: "nps",
        label: "How likely are you to recommend our hospital?",
        required: true,
      },
      {
        id: "q_staff",
        type: "short_text",
        label: "Would you like to recognise any doctor, nurse, or staff member?",
        required: false,
      },
      {
        id: "q_improve",
        type: "long_text",
        label: "Additional feedback on your stay or discharge process",
        required: false,
      },
    ],
  },
  {
    key: "guest_satisfaction",
    name: "Guest & Visitor Satisfaction",
    badge: "Hotel / Mall / General",
    title: "Guest Satisfaction Survey",
    description: "Tell us about your visit so we can keep raising the bar.",
    thankYouMessage: "Thank you for visiting! We appreciate your feedback.",
    collectContact: true,
    questions: [
      {
        id: "q_overall",
        type: "rating",
        label: "Overall satisfaction with your experience",
        required: true,
      },
      {
        id: "q_nps",
        type: "nps",
        label: "How likely are you to recommend us to others?",
        required: true,
      },
      {
        id: "q_best",
        type: "multi_choice",
        label: "What stood out most?",
        required: false,
        options: ["Cleanliness", "Staff hospitality", "Ambience", "Speed of service", "Value"],
      },
      {
        id: "q_comments",
        type: "long_text",
        label: "Comments or suggestions",
        required: false,
      },
    ],
  },
  {
    key: "blank",
    name: "Blank Custom Survey",
    badge: "Start from scratch",
    title: "",
    description: "",
    thankYouMessage: "Thank you for your feedback!",
    collectContact: true,
    questions: [
      {
        id: "q_1",
        type: "rating",
        label: "How would you rate your experience?",
        required: true,
      },
    ],
  },
]
