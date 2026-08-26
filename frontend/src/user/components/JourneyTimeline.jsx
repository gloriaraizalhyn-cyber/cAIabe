import "./JourneyTimeline.css";

function getStepStatus(stepIndex, activeStepIndex) {
  if (stepIndex < activeStepIndex) return "completed";
  if (stepIndex === activeStepIndex) return "current";
  return "upcoming";
}

function JourneyTimeline({ steps, activeStepIndex }) {
  return (
    <ol className="journey-timeline">
      {steps.map((step, stepIndex) => {
        const status = getStepStatus(stepIndex, activeStepIndex);
        return (
          <li key={step.id} className={`journey-timeline__item journey-timeline__item--${status}`}>
            <span className="journey-timeline__marker">
              <span className="journey-timeline__dot" />
              {stepIndex < steps.length - 1 && <span className="journey-timeline__connector" />}
            </span>
            <span className="journey-timeline__text">
              <span className="journey-timeline__name">{step.name}</span>
              <span className="journey-timeline__timestamp">{step.timestampLabel}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default JourneyTimeline;
