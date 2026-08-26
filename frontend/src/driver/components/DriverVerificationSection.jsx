import FormSection from "./FormSection.jsx";
import TextField from "./TextField.jsx";
import FileUploadField from "./FileUploadField.jsx";
import { ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL } from "../../shared/constants/driverRegistrationFixtures.js";

function DriverVerificationSection({ values, errors, onChange }) {
  return (
    <FormSection
      stepNumber={2}
      title="Driver Verification"
      description="We'll review these documents before approving your account."
    >
      <TextField
        label="Driver's License Number"
        required
        value={values.driversLicenseNumber}
        onChange={(value) => onChange("driversLicenseNumber", value)}
        placeholder="N01-23-456789"
        error={errors.driversLicenseNumber}
      />
      <FileUploadField
        label="Driver's License Photo"
        required
        file={values.driversLicensePhotoFile}
        onFileSelect={(file) => onChange("driversLicensePhotoFile", file)}
        onRemove={() => onChange("driversLicensePhotoFile", null)}
        acceptedFileTypesLabel={ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL}
        accept="image/jpeg,image/png"
        error={errors.driversLicensePhotoFile}
      />
      <TextField
        label="Franchise / Permit Number"
        required
        value={values.franchisePermitNumber}
        onChange={(value) => onChange("franchisePermitNumber", value)}
        placeholder="CPC-2024-00123"
        error={errors.franchisePermitNumber}
      />
      <FileUploadField
        label="Franchise / Permit Photo"
        required
        file={values.franchisePermitPhotoFile}
        onFileSelect={(file) => onChange("franchisePermitPhotoFile", file)}
        onRemove={() => onChange("franchisePermitPhotoFile", null)}
        acceptedFileTypesLabel={ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL}
        accept="image/jpeg,image/png"
        error={errors.franchisePermitPhotoFile}
      />
    </FormSection>
  );
}

export default DriverVerificationSection;
