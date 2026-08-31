import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountInformationSection from "../components/AccountInformationSection.jsx";
import DriverVerificationSection from "../components/DriverVerificationSection.jsx";
import VehicleInformationSection from "../components/VehicleInformationSection.jsx";
import RouteTerminalAssignmentSection from "../components/RouteTerminalAssignmentSection.jsx";
import RegistrationSubmittedNotice from "../components/RegistrationSubmittedNotice.jsx";
import { validateDriverRegistrationForm, normalizeIdNumber } from "../utils/validateDriverRegistrationForm.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./DriverRegistrationPage.css";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const INITIAL_FORM_VALUES = {
  firstName: "",
  middleName: "",
  lastName: "",
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from("routes")
      .select("id, name, color, terminal_routes(terminals(id, name))")
      .then(({ data, error }) => {
        if (!isMounted || error || !data) return;
        setRoutes(
          data.map((route) => ({
            id: route.id,
            name: route.name,
            color: route.color ?? "blue",
            terminals: (route.terminal_routes ?? []).map((tr) => tr.terminals).filter(Boolean),
          }))
        );
      });
    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateDriverRegistrationForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: formValues.emailAddress,
      password: formValues.password,
      options: {
        data: {
          full_name: [formValues.firstName, formValues.middleName, formValues.lastName]
            .filter(Boolean)
            .join(" "),
          mobile_number: formValues.mobileNumber,
          plate_number: formValues.plateNumber,
          vehicle_registration_number: formValues.vehicleRegistrationNumber,
        },
      },
    });

    if (signUpError) {
      setSubmitError(signUpError.message);
      setIsSubmitting(false);
      return;
    }

    if (!signUpData.session) {
      // The project requires email confirmation before issuing a session,
      // and driver-onboarding needs an authenticated caller — so onboarding
      // can't happen until after the driver confirms and logs in.
      setIsSubmitting(false);
      setSubmitError(
        "Account created — check your email to confirm it, then log in to finish your application."
      );
      return;
    }

    try {
      const [license_photo_base64, franchise_permit_photo_base64, vehicle_registration_photo_base64] =
        await Promise.all([
          fileToBase64(formValues.driversLicensePhotoFile),
          fileToBase64(formValues.franchisePermitPhotoFile),
          fileToBase64(formValues.vehicleRegistrationPhotoFile),
        ]);

      const { data: onboardData, error: onboardError } = await supabase.functions.invoke(
        "driver-onboarding",
        {
          body: {
            route_id: formValues.assignedRouteId,
            home_terminal_id: formValues.assignedTerminalId,
            jeep_color: formValues.jeepneyColor,
            license_number: normalizeIdNumber(formValues.driversLicenseNumber),
            license_photo_base64,
            license_photo_mime: formValues.driversLicensePhotoFile.type,
            franchise_permit_number: normalizeIdNumber(formValues.franchisePermitNumber),
            franchise_permit_photo_base64,
            franchise_permit_photo_mime: formValues.franchisePermitPhotoFile.type,
            vehicle_registration_photo_base64,
            vehicle_registration_photo_mime: formValues.vehicleRegistrationPhotoFile.type,
          },
        }
      );

      if (onboardError || onboardData?.error) {
        setSubmitError(onboardError?.message ?? onboardData.error);
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setIsSubmitted(true);
    } catch (err) {
      setSubmitError(String(err));
      setIsSubmitting(false);
    }
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
          routes={routes}
        />

        <p className="driver-registration-page__review-notice">
          Your information will be reviewed by our team before you're granted access to the
          driver system.
        </p>

        {submitError && <p className="driver-registration-page__submit-error">{submitError}</p>}

        <div className="driver-registration-page__actions">
          <button
            type="submit"
            className="driver-registration-page__submit-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting…" : "Submit for Verification"}
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
