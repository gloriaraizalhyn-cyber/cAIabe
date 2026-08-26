import FormSection from "./FormSection.jsx";
import SelectField from "./SelectField.jsx";
import { ROUTES_WITH_TERMINALS_FIXTURE } from "../../shared/constants/driverRegistrationFixtures.js";

const ROUTE_OPTIONS = ROUTES_WITH_TERMINALS_FIXTURE.map((route) => ({
  value: route.id,
  label: `${route.name} — ${route.color}`,
}));

function RouteTerminalAssignmentSection({ values, errors, onChange, onRouteChange }) {
  const selectedRoute = ROUTES_WITH_TERMINALS_FIXTURE.find(
    (route) => route.id === values.assignedRouteId
  );
  const terminalOptions =
    selectedRoute?.terminals.map((terminal) => ({ value: terminal.id, label: terminal.name })) ?? [];

  return (
    <FormSection
      stepNumber={4}
      title="Route & Terminal Assignment"
      description="Terminals are limited to the ones served by your selected route."
    >
      <SelectField
        label="Assigned Route"
        required
        value={values.assignedRouteId}
        onChange={onRouteChange}
        onClear={() => onRouteChange("")}
        options={ROUTE_OPTIONS}
        placeholder="Select assigned route"
        error={errors.assignedRouteId}
      />
      <SelectField
        label="Assigned Terminal"
        required
        value={values.assignedTerminalId}
        onChange={(value) => onChange("assignedTerminalId", value)}
        onClear={() => onChange("assignedTerminalId", "")}
        options={terminalOptions}
        placeholder="Select assigned terminal"
        disabled={!values.assignedRouteId}
        disabledPlaceholder="Select a route first"
        error={errors.assignedTerminalId}
      />
    </FormSection>
  );
}

export default RouteTerminalAssignmentSection;
