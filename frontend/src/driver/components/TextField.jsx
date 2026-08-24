import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./TextField.css";

function TextField({
  label,
  required = false,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
}) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordType = type === "password";
  const inputType = isPasswordType && isPasswordVisible ? "text" : type;

  return (
    <div className="text-field">
      <label className="text-field__label">
        {label}
        {required && <span className="text-field__required-mark">*</span>}
      </label>
      <div className="text-field__control">
        <input
          type={inputType}
          className={error ? "text-field__input text-field__input--error" : "text-field__input"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        {isPasswordType && (
          <button
            type="button"
            className="text-field__password-toggle"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
          >
            {isPasswordVisible ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
          </button>
        )}
      </div>
      {error && <p className="text-field__error">{error}</p>}
    </div>
  );
}

export default TextField;
