import { DEMO_BEATS, DEMO_FAST_FORWARD_SCALE } from "../constants/demoScript.js";

// The presenter's whole control surface: the scripted beats on the left so
// the narrative can't derail, and the live levers on the right so judges can
// ask us to change something and watch the system genuinely react.
function PresenterBar({
  beatIndex,
  onSelectBeat,
  onPrev,
  onNext,
  levers,
  activity,
  isTrafficThrown,
  isIdle,
  isFastForward,
}) {
  const beat = DEMO_BEATS[beatIndex];

  return (
    <footer className="presenter-bar">
      <div className="presenter-bar__beats">
        {DEMO_BEATS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={
              index === beatIndex
                ? "presenter-bar__beat presenter-bar__beat--active"
                : index < beatIndex
                  ? "presenter-bar__beat presenter-bar__beat--done"
                  : "presenter-bar__beat"
            }
            onClick={() => onSelectBeat(index)}
          >
            <span className="presenter-bar__beat-index">{index + 1}</span>
            <span className="presenter-bar__beat-title">{item.title}</span>
          </button>
        ))}
      </div>

      <div className="presenter-bar__script">
        <div className="presenter-bar__nav">
          <button type="button" className="presenter-bar__nav-button" onClick={onPrev} disabled={beatIndex === 0}>
            ←
          </button>
          <button
            type="button"
            className="presenter-bar__nav-button"
            onClick={onNext}
            disabled={beatIndex === DEMO_BEATS.length - 1}
          >
            →
          </button>
        </div>
        <p className="presenter-bar__narration">{beat.narration}</p>
      </div>

      <div className="presenter-bar__levers">
        <span className="presenter-bar__levers-label">Live levers</span>
        <div className="presenter-bar__lever-row">
          <button type="button" className="presenter-bar__lever" onClick={levers.surge}>
            Surge demand
          </button>
          <button type="button" className="presenter-bar__lever" onClick={levers.clearDemand}>
            Clear
          </button>
          <button
            type="button"
            className="presenter-bar__lever"
            onClick={isIdle ? levers.resume : levers.idle}
          >
            {isIdle ? "Resume jeep" : "Idle jeep"}
          </button>
          <button
            type="button"
            className="presenter-bar__lever"
            onClick={() => (isTrafficThrown ? levers.clearTraffic() : levers.throwTraffic())}
          >
            {isTrafficThrown ? "Clear traffic" : "Throw traffic"}
          </button>
          <button
            type="button"
            className={
              isFastForward ? "presenter-bar__lever presenter-bar__lever--active" : "presenter-bar__lever"
            }
            onClick={levers.toggleFastForward}
            aria-pressed={isFastForward}
          >
            {isFastForward ? `⏩ Fast-forward x${DEMO_FAST_FORWARD_SCALE}` : "⏩ Fast-forward"}
          </button>
        </div>
        {activity && (
          <p key={activity.at} className="presenter-bar__activity">
            {activity.message}
          </p>
        )}
      </div>
    </footer>
  );
}

export default PresenterBar;
