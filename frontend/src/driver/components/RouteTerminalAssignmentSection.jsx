import FormSection from "./FormSection.jsx";
import SelectField from "./SelectField.jsx";

// `routes` comes from a real query (drivers/pages/DriverRegistrationPage.jsx
// fetches routes + terminal_routes + terminals from Supabase) — no fixture.
function RouteTerminalAssignmentSection({ values, errors, onChange, onRouteChange, routes }) {
  const routeOptions = routes.map((route) => ({
    value: route.id,
    label: `${route.name} — ${route.color}`,
  }));
  const selectedRoute = routes.find((route) => route.id === values.assignedRouteId);
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
        options={routeOptions}
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
