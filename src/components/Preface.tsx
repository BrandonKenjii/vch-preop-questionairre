// Welcome screen shown before the questionnaire: the "Dear Patient" letter
// from the paper form, paraphrased to fit the web app (download a PDF and
// email it, rather than return a paper copy) and with the one-sitting
// requirement made explicit.
interface Props {
  onBegin: () => void;
}

export function Preface({ onBegin }: Props) {
  return (
    <section className="preface-card" aria-label="Before you begin">
      <h2>Dear Patient,</h2>
      <p>
        This questionnaire is an important part of preparing for your surgery. The VGH
        Pre-Admission Clinic will use your answers to determine your surgical care needs.
      </p>
      <p>
        It asks detailed questions about your medical history so the clinic can safely assess
        your surgical risks and help prepare you for surgery.
      </p>
      <p>
        Please answer each question as best you can. If you are not sure what a question means,
        provide as much detail as you can &mdash; you will be asked for more information at your
        pre-admission appointment.
      </p>
      <p>
        When you finish, a completed PDF is downloaded to this device. Please email it to your
        surgeon&rsquo;s office, just as you would return a paper copy.
      </p>
      <p className="preface-note">
        <strong>Please complete this questionnaire in one sitting.</strong> Your progress is not
        saved &mdash; if you leave or refresh this page before finishing, your answers will be
        lost and you will need to start again.
      </p>
      <div className="preface-begin">
        <button type="button" className="button button-primary" onClick={onBegin}>
          Begin Questionnaire
        </button>
      </div>
    </section>
  );
}
