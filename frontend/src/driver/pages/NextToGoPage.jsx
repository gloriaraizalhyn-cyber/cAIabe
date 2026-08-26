import { useNavigate } from "react-router-dom";
import NextToGoMapCanvas from "../components/NextToGoMapCanvas.jsx";
import NextToGoCard from "../components/NextToGoCard.jsx";
import { ROUTES_WITH_TERMINALS_FIXTURE } from "../../shared/constants/driverRegistrationFixtures.js";
import {
  CURRENT_DRIVER_PROFILE_FIXTURE,
  WAITING_PASSENGERS_ALONG_ROUTE_FIXTURE,
} from "../../shared/constants/driverDashboardFixtures.js";
import "./NextToGoPage.css";

const assignedRoute = ROUTES_WITH_TERMINALS_FIXTURE.find(
  (route) => route.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedRouteId
);
const assignedTerminal = assignedRoute.terminals.find(
  (terminal) => terminal.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedTerminalId
);

function NextToGoPage() {
  const navigate = useNavigate();
  const handleWaitForMore = () => {};
  const handleGoNow = () => {
    navigate("/driver/driving");
  };

  return (
    <main className="next-to-go-page">
      <NextToGoMapCanvas
        terminalName={assignedTerminal.name}
        waitingPassengers={WAITING_PASSENGERS_ALONG_ROUTE_FIXTURE}
      />
      <NextToGoCard
        waitingCount={WAITING_PASSENGERS_ALONG_ROUTE_FIXTURE.length}
        onWaitForMore={handleWaitForMore}
        onGoNow={handleGoNow}
      />
    </main>
  );
}

export default NextToGoPage;
