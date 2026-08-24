import { Routes, Route } from "react-router-dom";
import LandingPage from "../user/pages/LandingPage.jsx";
import AboutYouPage from "../user/pages/AboutYouPage.jsx";
import FindRoutesPage from "../user/pages/FindRoutesPage.jsx";
import WaitingForJeepPage from "../user/pages/WaitingForJeepPage.jsx";
import OnRoutePage from "../user/pages/OnRoutePage.jsx";
import DriverRegistrationPage from "../driver/pages/DriverRegistrationPage.jsx";
import DriverLoginPage from "../driver/pages/DriverLoginPage.jsx";
import DriverDashboardPage from "../driver/pages/DriverDashboardPage.jsx";
import NextToGoPage from "../driver/pages/NextToGoPage.jsx";
import DrivingPage from "../driver/pages/DrivingPage.jsx";

// User-end routes above; driver-end routes below under their own "/driver/*"
// prefix so the two flows stay clearly separated.
function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about-you" element={<AboutYouPage />} />
      <Route path="/routes" element={<FindRoutesPage />} />
      <Route path="/waiting" element={<WaitingForJeepPage />} />
      <Route path="/on-route" element={<OnRoutePage />} />

      <Route path="/driver/login" element={<DriverLoginPage />} />
      <Route path="/driver/register" element={<DriverRegistrationPage />} />
      <Route path="/driver/dashboard" element={<DriverDashboardPage />} />
      <Route path="/driver/next-to-go" element={<NextToGoPage />} />
      <Route path="/driver/driving" element={<DrivingPage />} />
    </Routes>
  );
}

export default AppRouter;
