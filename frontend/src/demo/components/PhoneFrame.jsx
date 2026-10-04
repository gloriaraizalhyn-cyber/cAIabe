// A phone bezel around a live iframe of the real app.
//
// The panes really are the shipping passenger and driver apps, not mockups —
// that's the point of the stage, so the bezel should read as a device and
// otherwise get out of the way.
function PhoneFrame({ title, subtitle, accent, src, isFocused, badge }) {
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
        <iframe
          className="phone-frame__screen"
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
          // back to the searched origin, which is SM City Clark.
          //
          // Driver: NextToGoPage would otherwise watchPosition and POST
          // driver-location-update for a driver the fleet simulator may also
          // be moving, so the jeepney would flip between the route and the
          // laptop. Blocked, "Use terminal location" is the only writer.
        />
      </div>
    </section>
  );
}

export default PhoneFrame;
