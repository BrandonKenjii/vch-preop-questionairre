import { Wizard } from "./components/Wizard";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Pre-Operative Patient Health Questionnaire</h1>
        <p>Vancouver Coastal Health · Form VCH.0749-TRIAL (Nov 2021)</p>
      </header>
      <main className="app-main">
        <Wizard />
      </main>
      <footer className="app-footer">
        <p>
          Your answers are processed entirely in your browser. Nothing is sent to or stored on any
          server. When you finish, a completed PDF is downloaded for you to email to your
          surgeon&rsquo;s office yourself.
        </p>
      </footer>
    </div>
  );
}
