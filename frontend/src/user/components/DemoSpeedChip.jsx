import { nextDemoSpeed } from "../../demo/lib/demoFleetCommands.js";
import "./DemoSpeedChip.css";

// Demo stage only: shows the fast-forward the fleet is running at and cycles
// it on tap (x1 real time -> x4 -> x8). The speed itself is applied by the
// caller, which sends it to the fleet simulator (see demoFleetCommands.js).
function DemoSpeedChip({ speed, onChange }) {
  return (
    <button
      type="button"
      className="demo-speed-chip"
      onClick={() => onChange(nextDemoSpeed(speed))}
      aria-label={`Demo speed x${speed}. Tap to change.`}
    >
      <span aria-hidden="true">⏩</span> Demo speed ×{speed}
    </button>
  );
}

export default DemoSpeedChip;
