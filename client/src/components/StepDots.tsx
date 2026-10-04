/** Where you are in a multi-step card, plus Back / Next. Each player pages on their own device. */
export default function StepDots({ step, count, onStep }: { step: number; count: number; onStep: (n: number) => void }) {
  return (
    <nav className="step-nav" aria-label="Pages">
      <button className="secondary small-btn" disabled={step === 0} onClick={() => onStep(step - 1)}>
        ‹ Back
      </button>
      <span className="step-dots" aria-label={`Page ${step + 1} of ${count}`}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={i === step ? 'dot on' : 'dot'} />
        ))}
      </span>
      <button className={step === count - 1 ? 'secondary small-btn hidden' : 'primary small-btn'} disabled={step === count - 1} onClick={() => onStep(step + 1)}>
        Next ›
      </button>
    </nav>
  );
}
