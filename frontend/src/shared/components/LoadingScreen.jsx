import { Lottie } from "lottie-react";
import "./LoadingScreen.css";

const ANIMATION_URL = "/animations/steer-wheel-loading.json";
// The wheel keeps oscillating (0 -> 12deg -> -12deg -> ...) and holding at
// full opacity through frame ~202; past that it does a one-shot finishing
// spin + fade-out that isn't meant to repeat, so the loop stops just before it.
const LOOP_SEGMENT = [0, 202];

function LoadingScreen({ message = "Loading…" }) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__crop">
        <Lottie
          src={ANIMATION_URL}
          className="loading-screen__animation"
          loop
          autoplay
          segment={LOOP_SEGMENT}
        />
      </div>
      <p className="loading-screen__message">{message}</p>
    </div>
  );
}

export default LoadingScreen;
