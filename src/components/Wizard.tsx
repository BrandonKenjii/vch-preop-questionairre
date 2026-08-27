// Top-level step controller: current section, navigation, completion gate,
// PDF generation, download, and reset.
import { useState } from "react";
import { sections, type Answers } from "../data/questions";
import { useFormState } from "../hooks/useFormState";
import { firstIncompleteSection, isFormComplete, isSectionComplete } from "../logic/validation";
import { generateFilledPdf, pdfFilename, triggerDownload } from "../logic/pdfGenerator";
import { buildDevAnswers } from "../dev/devAnswers";
import { devToolsEnabled } from "../dev/devTools";
import { ProgressBar } from "./ProgressBar";
import { SectionScreen } from "./SectionScreen";

type Status = "form" | "generating" | "done" | "error";

export function Wizard() {
  const { answers, updateAnswer, fill, reset } = useFormState();
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("form");
  const [error, setError] = useState<string | null>(null);
  const [jumpHint, setJumpHint] = useState(false);

  const current = sections[index];
  const sectionComplete = isSectionComplete(current.id, answers);
  const isLast = index === sections.length - 1;
  const completedFlags = sections.map((s) => isSectionComplete(s.id, answers));

  const goTo = (i: number) => {
    setIndex(i);
    setJumpHint(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generate = async (answersToUse: Answers) => {
    const firstBad = firstIncompleteSection(answersToUse);
    if (firstBad !== -1) {
      goTo(firstBad);
      setJumpHint(true);
      return;
    }
    if (!isFormComplete(answersToUse)) return; // defensive; unreachable with the check above
    setStatus("generating");
    setError(null);
    try {
      const blob = await generateFilledPdf(answersToUse);
      triggerDownload(blob, pdfFilename(answersToUse));
      setStatus("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleComplete = () => generate(answers);

  // Dev-only shortcuts: fill the form from a canned answer set so the
  // generated PDF can be tested without clicking through every question.
  const handleDevFill = () => fill(buildDevAnswers());

  const handleDevGenerate = () => {
    const dev = buildDevAnswers();
    fill(dev);
    void generate(dev);
  };

  const startOver = () => {
    reset();
    setIndex(0);
    setStatus("form");
    setError(null);
    setJumpHint(false);
  };

  if (status === "generating") {
    return (
      <div className="status-screen" role="status">
        <p className="status-title">Generating your questionnaire…</p>
        <p>Everything happens on this device — nothing is uploaded.</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="status-screen">
        <h2>Your questionnaire is ready</h2>
        <p>The completed PDF has been downloaded to this device.</p>
        <p>
          Please email the PDF to your surgeon&rsquo;s office, the same way you would return a
          paper copy.
        </p>
        {error && <p className="banner banner-error">{error}</p>}
        <button type="button" className="button button-primary" onClick={startOver}>
          Start New Survey
        </button>
      </div>
    );
  }

  return (
    <div className="wizard">
      <ProgressBar currentIndex={index} completed={completedFlags} onJump={goTo} />

      {devToolsEnabled() && (
        <div className="dev-panel">
          <span className="dev-label">Dev</span>
          <button type="button" className="button button-secondary" onClick={handleDevFill}>
            Auto-fill form
          </button>
          <button type="button" className="button button-primary" onClick={handleDevGenerate}>
            Auto-fill &amp; generate PDF
          </button>
        </div>
      )}

      {status === "error" && (
        <p className="banner banner-error" role="alert">
          Something went wrong while generating the PDF: {error}. Your answers are still here —
          please try again.
        </p>
      )}
      {jumpHint && (
        <p className="banner banner-warn" role="alert">
          Please complete the highlighted section below before finishing.
        </p>
      )}

      <SectionScreen section={current} answers={answers} onAnswer={updateAnswer} />

      <div className="nav-row">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => goTo(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          ← Back
        </button>
        {isLast ? (
          <button type="button" className="button button-primary" onClick={handleComplete}>
            Complete Survey
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={() => goTo(index + 1)}
            disabled={!sectionComplete}
            title={
              sectionComplete
                ? undefined
                : "Answer all required questions on this screen to continue"
            }
          >
            Next →
          </button>
        )}
      </div>
      {!sectionComplete && !isLast && (
        <p className="nav-hint">Answer all questions marked * to continue.</p>
      )}
    </div>
  );
}
