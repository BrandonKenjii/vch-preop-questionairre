// Shared fixtures: an auto-completed answer set that satisfies every
// required question, following the branching rules.
import { sections, type Answers, type Question } from "../src/data/questions";
import { getActiveQuestions } from "../src/logic/branching";
import { isAnswered, isSectionComplete } from "../src/logic/validation";

function answerFor(q: Question): Answers[string] {
  switch (q.type) {
    case "yesno":
      return false;
    case "number":
      return 1;
    case "text": {
      switch (q.input) {
        case "date":
          return "2020-01-01";
        case "digits":
          return "1234567890";
        case "tel":
          return "6045551234";
        case "email":
          return "test@example.com";
        default:
          return "Test answer";
      }
    }
    case "bmi":
      return { height: "170", heightUnit: "cm", weight: "72", weightUnit: "kg" };
    case "choice":
    case "multichoice": {
      const options = q.options ?? [];
      if (options.length === 0) return undefined;
      const storedValues = q.optionValues ?? options;
      return q.type === "choice" ? storedValues[0] : [options[0]];
    }
    default:
      return undefined;
  }
}

/**
 * Answers every visible required question across all sections, including
 * children revealed by earlier answers.
 */
export function buildCompleteAnswers(): Answers {
  const answers: Answers = {};
  for (const section of sections) {
    for (let pass = 0; pass < 10 && !isSectionComplete(section.id, answers); pass++) {
      // Only active questions are backfilled: soft (condition unanswered)
      // and disabled (condition answered No) rows are never required.
      for (const q of getActiveQuestions(section.id, answers)) {
        if (q.required && !isAnswered(q, answers)) {
          answers[q.id] = answerFor(q);
        }
      }
    }
  }
  return answers;
}

/** Spot answers for the pdfGenerator tests (values assertable by name). */
export function spotAnswers(): Answers {
  return {
    patient_last_name: "Doe",
    patient_first_name: "Jane",
    patient_dob: "1980-05-12",
    patient_phn_non_bc: true,
    patient_phn: "9123456789",
    completed_by: "Patient",
    anesthesia_general_procedure: true,
    anesthesia_general_procedure_details: "Knee arthroscopy, Mount St. Joseph Hospital, 2019",
    anesthesia_personal_problem: false,
    anesthesia_family_problem: false,
    anesthesia_hospital_ed_year: false,
    functional_lift: 0,
    functional_walk: 1,
    functional_transfer: 2,
    functional_stairs: 0,
    functional_falls: 1,
    functional_falls_cause: "Slipped on ice",
    functional_activity_freq: "More than once a week",
    functional_activity_times: 3,
    functional_activity_minutes: 30,
    functional_mobility_aid: false,
    functional_adl_assistance: false,
    functional_hearing: true,
    functional_hearing_aids: true,
    functional_hearing_specify: "Left ear",
    functional_eyesight: false,
    breathing_sleep_apnea: true,
    breathing_apnea_date_where: "UBC Sleep Clinic, 2021",
    breathing_sleep_study_location: "Home Sleep Study",
    breathing_cpap: true,
    breathing_cpap_irregular: false,
    breathing_asthma_copd: false,
    breathing_home_oxygen: false,
    breathing_sob: false,
    breathing_specialist: false,
    breathing_pft: false,
    breathing_other: false,
    heart_high_bp: true,
    heart_bp_meds: true,
    heart_chest_pain: false,
    heart_sob: false,
    heart_palpitations: false,
    heart_fainting: false,
    heart_murmur: false,
    heart_angina_attack: false,
    heart_valve: false,
    heart_weak: false,
    heart_pacemaker: false,
    heart_pvd: false,
    heart_cardiologist: false,
    heart_stress_test: false,
    heart_nuclear_scan: false,
    heart_catheterization: false,
    heart_echo: false,
    heart_holter: false,
    heart_other: false,
    neuro_memory: false,
    neuro_dementia: false,
    neuro_confusion: false,
    neuro_muscle_nerve: false,
    neuro_stroke: false,
    neuro_tbi: false,
    neuro_spinal: false,
    neuro_tracheostomy: false,
    neuro_ventilatory: false,
    neuro_epilepsy: false,
    neuro_neurologist: false,
    neuro_mental_health: false,
    blood_aspirin: true,
    blood_aspirin_reason: "Stroke prevention",
    blood_thinner: true,
    blood_thinner_reason: "Atrial fibrillation",
    blood_thinner_types: ["Pradaxa (dabigatran)", "Eliquis (apixaban)"],
    blood_thinner_instructions: true,
    blood_thinner_instructions_given: "Stop 2 days before surgery",
    blood_bleeding_disorder: false,
    blood_hematologist: false,
    blood_transfusion_refusal: false,
    blood_antibodies: false,
    blood_irradiated: false,
    blood_iga_deficiency: false,
    blood_transfused_90d: false,
    blood_pregnant: false,
    nutrition_weight_loss: false,
    nutrition_eating_less: false,
    substance_nicotine: false,
    substance_past_smoker: false,
    substance_cannabis: false,
    substance_alcohol: true,
    substance_alcohol_type: "Wine",
    substance_alcohol_drinks: "2",
    substance_drugs: false,
    substance_opioid_agonist: false,
    pain_chronic: false,
    pain_bad_experience: false,
    pain_clinic: false,
    pain_pcs1: 0,
    pain_pcs2: 1,
    pain_pcs3: 2,
    pain_pcs4: 3,
    pain_rating: 4,
    pain_opioids: false,
    pain_nonopioids: true,
    medical_diabetes: false,
    medical_kidney: false,
    medical_urine_problems: false,
    medical_catheter: false,
    medical_bowels: false,
    medical_liver: false,
    medical_transplant: false,
    medical_arthritis: false,
    medical_infections: false,
    medical_hospital_admission: false,
    medical_rashes_wounds: false,
    medical_birth_control: false,
    medical_cancer: false,
    medical_vascular_access: false,
    medical_autoimmune: false,
    medical_other_problems: false,
    medications_taken: true,
    medications_list: "Atorvastatin 20 mg once daily\nAmlodipine 5 mg once daily",
    allergies_any: true,
    allergies_types: ["Antibiotics", "Food"],
    allergies_antibiotics_details: "Penicillin",
    allergies_food_details: "Peanuts",
    other_support_person: true,
    other_support_name: "John Doe",
    other_living_type: ["Home", "Live Alone"],
    other_pickup_name: "John Doe",
    other_living_will: false,
    other_homecare: false,
    other_indigenous: false,
    other_english: true,
    other_bmi: { height: "170", heightUnit: "cm", weight: "72", weightUnit: "kg" },
    other_phone_day: "604-555-1234",
  };
}
