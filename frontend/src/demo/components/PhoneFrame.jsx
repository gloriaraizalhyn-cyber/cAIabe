import { useEffect, useRef, useState } from "react";

// The app inside always lays out at a real phone width (390px) and is scaled
// down to fit the bezel, so it never runs its cramped small-screen layout.
const PHONE_WIDTH = 390;

// A phone bezel around a live iframe of the real app.
//
// The panes really are the shipping passenger and driver apps, not mockups —
// that's the point of the stage, so the bezel should read as a device and
// otherwise get out of the way.
function PhoneFrame({ title, subtitle, accent, src, isFocused, badge }) {
  const viewportRef = useRef(null);
  const [scale, setScale] = useState(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const nextScale = el.clientWidth / PHONE_WIDTH;
      setScale(nextScale);
      setHeight(el.clientHeight / nextScale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={`phone-frame${isFocused ? " phone-frame--focused" : ""}`}
      style={accent ? { "--phone-accent": accent } : undefined}
    >
      <header className="phone-frame__header">
        <div className="phone-frame__labels">
          <h2 className="phone-frame__title">{title}</h2>
          {subtitle && <p className="phone-frame__subtitle">{subtitle}</p>}
        </div>
        {badge && <span className="phone-frame__badge">{badge}</span>}
      </header>

      <div className="phone-frame__device">
        <div className="phone-frame__notch" aria-hidden="true" />
        <div className="phone-frame__viewport" ref={viewportRef}>
        <iframe
          className="phone-frame__screen"
          style={scale ? { width: PHONE_WIDTH, height, transform: `scale(${scale})` } : undefined}
          src={src}
          title={title}
          // Deliberately NO allow="geolocation" — the Permissions Policy must
          // block it in both panes, and that is load-bearing, not an omission.
          //
          // Passenger: WaitingForJeepPage uses
          //   passengerPosition = livePassengerPosition ?? searchedOriginPosition
          // so with GPS granted, "I'm here!" would register her at the
          // presenter's actual laptop — hundreds of km from Angeles City —
          // and driver-demand-check would filter her out. Blocked, it falls
          // back to the searched origin, which is Astro Park.
          //
          // Driver: NextToGoPage would otherwise watchPosition and POST
          // driver-location-update for a driver the fleet simulator may also
          // be moving, so the jeepney would flip between the route and the
          // laptop. Blocked, "Use terminal location" is the only writer.
        />
        </div>
      </div>
    </section>
  );
}

export default PhoneFrame;

