import { PLACE_SUGGESTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";

function findPlace(label) {
  return PLACE_SUGGESTIONS_FIXTURE.find((place) => place.label === label) ?? null;
}

// Stands in for the real Gemini edge function (audio in, transcript +
// origin/destination out) until that's wired up — same shape the real
// call will return, so swapping this out later is a one-function change.
// Always resolves to the same demo phrase regardless of what was actually
// said, since there's no real transcription happening yet.
export function mockTranscribeAndParseVoice() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        transcript: "Manibat National University Clark, papunta Marquee Mall.",
        originQuery: "National University Clark",
        destinationQuery: "Marquee Mall",
        originPlace: findPlace("National University Clark"),
        destinationPlace: findPlace("Marquee Mall"),
      });
    }, 1400);
  });
}
