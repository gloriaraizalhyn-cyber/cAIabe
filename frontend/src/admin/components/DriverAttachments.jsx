import { useEffect, useState } from "react";
import { ArrowLeft, FileImage } from "lucide-react";
import "./DriverAttachments.css";

const DOCUMENT_FIELDS = [
  { label: "Driver's License", urlKey: "licensePhotoSignedUrl" },
  { label: "Franchise / Permit", urlKey: "franchisePermitPhotoSignedUrl" },
  { label: "Vehicle Registration", urlKey: "vehicleRegistrationPhotoSignedUrl" },
];

function fileTypeLabel(url) {
  const ext = /\.(\w+)(?:\?|$)/.exec(url)?.[1]?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "JPG File";
  if (ext === "png") return "PNG File";
  return ext ? `${ext.toUpperCase()} File` : "File";
}

// Shown wherever an admin needs to review what a driver actually uploaded
// at sign-up — the pending review panel and the approved/rejected summary
// card. Registration collects three separate documents, so all three get
// listed here rather than just the one license photo that used to be the
// only thing rendered. Rows open a full-size in-app viewer instead of a new
// browser tab, so there's always a way back to the list (Back button or Esc).
function DriverAttachments({ driver, variant }) {
  const [openAttachment, setOpenAttachment] = useState(null);
  const uploadedDate = driver.createdAt
    ? new Date(driver.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      })
    : null;

  useEffect(() => {
    if (!openAttachment) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpenAttachment(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openAttachment]);

  const hasAny = DOCUMENT_FIELDS.some((field) => driver[field.urlKey]);

  return (
    <div className={`driver-attachments${variant ? ` driver-attachments--${variant}` : ""}`}>
      <span className="driver-attachments__label">Attachments</span>
      {hasAny ? (
        <ul className="driver-attachments__list">
          {DOCUMENT_FIELDS.map((field) => {
            const url = driver[field.urlKey];
            return (
              <li key={field.label} className="driver-attachments__list-item">
                {url ? (
                  <button
                    type="button"
                    className="driver-attachments__row"
                    onClick={() => setOpenAttachment({ label: field.label, url })}
                  >
                    <FileImage size={16} strokeWidth={2} className="driver-attachments__row-icon" />
                    <span className="driver-attachments__row-name">{field.label}</span>
                    <span className="driver-attachments__row-date">{uploadedDate}</span>
                    <span className="driver-attachments__row-type">{fileTypeLabel(url)}</span>
                  </button>
                ) : (
                  <div className="driver-attachments__row driver-attachments__row--missing">
                    <FileImage size={16} strokeWidth={2} className="driver-attachments__row-icon" />
                    <span className="driver-attachments__row-name">{field.label}</span>
                    <span className="driver-attachments__row-date">—</span>
                    <span className="driver-attachments__row-type">Not provided</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="driver-attachments__empty">No documents on file.</p>
      )}

      {openAttachment && (
        <div
          className="driver-attachments__lightbox-backdrop"
          onClick={() => setOpenAttachment(null)}
        >
          <div className="driver-attachments__lightbox" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="driver-attachments__lightbox-back-button"
              onClick={() => setOpenAttachment(null)}
            >
              <ArrowLeft size={16} strokeWidth={2.25} />
              Back
            </button>
            <img
              src={openAttachment.url}
              alt={openAttachment.label}
              className="driver-attachments__lightbox-image"
            />
            <span className="driver-attachments__lightbox-label">{openAttachment.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default DriverAttachments;
