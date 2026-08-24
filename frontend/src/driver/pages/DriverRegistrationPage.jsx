import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountInformationSection from "../components/AccountInformationSection.jsx";
import DriverVerificationSection from "../components/DriverVerificationSection.jsx";
import VehicleInformationSection from "../components/VehicleInformationSection.jsx";
import RouteTerminalAssignmentSection from "../components/RouteTerminalAssignmentSection.jsx";
import RegistrationSubmittedNotice from "../components/RegistrationSubmittedNotice.jsx";
import { validateDriverRegistrationForm } from "../utils/validateDriverRegistrationForm.js";
import "./DriverRegistrationPage.css";

const INITIAL_FORM_VALUES = {
  fullName: "",
  mobileNumber: "",
  emailAddress: "",
  password: "",
  confirmPassword: "",
  driversLicenseNumber: "",
  driversLicensePhotoFile: null,
  franchisePermitNumber: "",
  franchisePermitPhotoFile: null,
  plateNumber: "",
  vehicleRegistrationNumber: "",
  vehicleRegistrationPhotoFile: null,
  jeepneyColor: "",
  assignedRouteId: "",
  assignedTerminalId: "",
};

function DriverRegistrationPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleFieldChange = (fieldName, value) => {
    setFormValues((previousValues) => ({ ...previousValues, [fieldName]: value }));
    setFormErrors((previousErrors) => {
      if (!previousErrors[fieldName]) return previousErrors;
      const { [fieldName]: _removed, ...remainingErrors } = previousErrors;
      return remainingErrors;
    });
  };

  const handleAssignedRouteChange = (routeId) => {
    setFormValues((previousValues) => ({
      ...previousValues,
      assignedRouteId: routeId,
      assignedTerminalId: "",
    }));
    setFormErrors((previousErrors) => {
      const { assignedRouteId: _removedRoute, assignedTerminalId: _removedTerminal, ...remainingErrors } =
        previousErrors;
      return remainingErrors;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = validateDriverRegistrationForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setIsSubmitted(true);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  const handleBackToLogin = () => {
    navigate("/driver/login");
  };

  if (isSubmitted) {
    return (
      <main className="driver-registration-page">
        <RegistrationSubmittedNotice onBackToLogin={handleBackToLogin} />
      </main>
    );
  }

  return (
    <main className="driver-registration-page">
      <form className="driver-registration-page__form" onSubmit={handleSubmit} noValidate>
        <header className="driver-registration-page__header">
          <h1 className="driver-registration-page__title">Driver Registration</h1>
          <p className="driver-registration-page__subtitle">
            Fields marked with an asterisk (*) are required.
          </p>
        </header>

        <AccountInformationSection values={formValues} errors={formErrors} onChange={handleFieldChange} />
        <DriverVerificationSection values={formValues} errors={formErrors} onChange={handleFieldChange} />
        <VehicleInformationSection values={formValues} errors={formErrors} onChange={handleFieldChange} />
        <RouteTerminalAssignmentSection
          values={formValues}
          errors={formErrors}
          onChange={handleFieldChange}
          onRouteChange={handleAssignedRouteChange}
        />

        <p className="driver-registration-page__review-notice">
          Your information will be reviewed by our team before you're granted access to the
          driver system.
        </p>

        <div className="driver-registration-page__actions">
          <button type="submit" className="driver-registration-page__submit-button">
            Submit for Verification
          </button>
          <button type="button" className="driver-registration-page__cancel-button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}

export default DriverRegistrationPage;
