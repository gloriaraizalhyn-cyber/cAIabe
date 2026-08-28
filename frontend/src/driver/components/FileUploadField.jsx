import { useId } from "react";
import { UploadCloud, FileCheck2, X } from "lucide-react";
import "./FileUploadField.css";

function FileUploadField({
  label,
  required = false,
  file,
  onFileSelect,
  onRemove,
  error,
  acceptedFileTypesLabel,
  accept,
}) {
  const inputId = useId();

  const handleInputChange = (event) => {
    const selectedFile = event.target.files?.[0] ?? null;
    onFileSelect(selectedFile);
    event.target.value = "";
  };

  return (
    <div className="file-upload-field">
      <label className="file-upload-field__label">
        {label}
        {required && <span className="file-upload-field__required-mark">*</span>}
      </label>

      <input
        type="file"
        id={inputId}
        className="file-upload-field__hidden-input"
        accept={accept}
        onChange={handleInputChange}
      />

      {!file ? (
        <label
          htmlFor={inputId}
          className={
            error
              ? "file-upload-field__dropzone file-upload-field__dropzone--error"
              : "file-upload-field__dropzone"
          }
        >
          <UploadCloud size={20} strokeWidth={2} />
          <span className="file-upload-field__upload-text">Upload file</span>
          <span className="file-upload-field__accepted-types">{acceptedFileTypesLabel}</span>
        </label>
      ) : (
        <div className="file-upload-field__preview">
          <FileCheck2 size={18} strokeWidth={2} className="file-upload-field__preview-icon" />
          <span className="file-upload-field__file-name">{file.name}</span>
          <label htmlFor={inputId} className="file-upload-field__replace-button">
            Replace
          </label>
          <button
            type="button"
            className="file-upload-field__remove-button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
          >
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>
      )}

      {error && <p className="file-upload-field__error">{error}</p>}
    </div>
  );
}

export default FileUploadField;
