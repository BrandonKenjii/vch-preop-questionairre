// Top-level step controller: current section, navigation, completion gate,
// the review-and-confirm page, PDF generation, download, and reset.
import { useState } from "react";
import { sections, type Answers } from "../data/questions";
import { useFormState } from "../hooks/useFormState";
import {
  firstIncompleteQuestion,
  firstIncompleteSection,
  isFormComplete,
  isSectionComplete,
} from "../logic/validation";
import { generateFilledPdf, pdfFilename, triggerDownload } from "../logic/pdfGenerator";
import { buildDevAnswers } from "../dev/devAnswers";
import { devToolsEnabled } from "../dev/devTools";
import { Preface } from "./Preface";
import { ProgressBar } from "./ProgressBar";
import { ReviewPage } from "./ReviewPage";
import { SectionScreen } from "./SectionScreen";

type Status = "form" | "review" | "generating" | "done" | "error";

export function Wizard() {
  const { answers, updateAnswer, fill, reset } = useFormState();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>("form");
  const [error, setError] = useState<string | null>(null);
  // Shown after a bounce: either the Next gate or the final submit gate.
  const [hint, setHint] = useState<string | null>(null);
  // Id of the question to frame in red after a bounce.
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const current = sections[index];
  const sectionComplete = isSectionComplete(current.id, answers);
  const isLast = index === sections.length - 1;
  const completedFlags = sections.map((s) => isSectionComplete(s.id, answers));

  const goTo = (i: number) => {
    setIndex(i);
    setHint(null);
    setHighlightId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generate = async (answersToUse: Answers) => {
    const firstBad = firstIncompleteSection(answersToUse);
    if (firstBad !== -1) {
      goTo(firstBad);
      setHint("Please answer the question highlighted in red below before finishing.");
      // Frame the specific unanswered question in red (goTo cleared the
      // previous highlight; the hint survives via the call above).
      setHighlightId(firstIncompleteQuestion(sections[firstBad].id, answersToUse));
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

  // Complete Survey: a form that still has gaps bounces to the first
  // incomplete section (as before); a complete form opens the review page,
  // where the patient confirms before the PDF is generated.
  const handleComplete = () => {
    if (firstIncompleteSection(answers) !== -1) {
      void generate(answers);
      return;
    }
    setStatus("review");
  };

  // Next is always clickable. With required answers missing it stays on the
  // screen and frames the first unanswered question in red (SectionScreen
  // scrolls it into view) instead of advancing.
  const handleNext = () => {
    if (sectionComplete) {
      goTo(index + 1);
      return;
    }
    setHint("Please answer the question highlighted in red below before continuing.");
    setHighlightId(firstIncompleteQuestion(current.id, answers));
  };

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
    setStarted(false);
    setIndex(0);
    setStatus("form");
    setError(null);
    setHint(null);
    setHighlightId(null);
  };

  if (status === "generating") {
    return (
      <div className="status-screen" role="status">
        <p className="status-title">Generating your questionnaire…</p>
        <p>Everything happens on this device — nothing is uploaded.</p>
      </div>
    );
  }

  if (status === "review") {
    return (
      <div className="wizard">
        <ReviewPage
          answers={answers}
          onBack={() => setStatus("form")}
          onConfirm={() => {
            // generate() preflights again: if an Edit removed a required
            // answer, it bounces to the first incomplete section with the
            // usual hint instead of generating.
            setStatus("form");
            void generate(answers);
          }}
          onEdit={(i) => {
            setStatus("form");
            goTo(i);
          }}
        />
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

  if (!started) {
    return (
      <div className="wizard">
        <Preface
          onBegin={() => {
            setStarted(true);
            window.scrollTo({ top: 0 });
          }}
        />
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
      {hint && (
        <p className="banner banner-warn" role="alert">
          {hint}
        </p>
      )}

      <SectionScreen
        section={current}
        answers={answers}
        onAnswer={(id, value) => {
          updateAnswer(id, value);
          // Once the flagged question (or its confirm copy) receives an
          // answer, drop the red frame and the bounce hint.
          if ((id === highlightId || id === `${highlightId}_confirm`) && value !== undefined) {
            setHighlightId(null);
            setHint(null);
          }
        }}
        highlightId={highlightId}
      />

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
            onClick={handleNext}
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
