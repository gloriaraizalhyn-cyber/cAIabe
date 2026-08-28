import { Lottie } from "lottie-react";

const ANIMATION_URL = "/animations/caiabe-mascot-full.json";

function MascotReveal({ className }) {
  return <Lottie src={ANIMATION_URL} className={className} loop={false} autoplay />;
}

export default MascotReveal;
