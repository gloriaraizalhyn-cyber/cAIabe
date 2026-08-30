import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  LogOut,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../shared/lib/supabaseClient.js";
import DriverEditModal from "../components/DriverEditModal.jsx";
import DeleteDriversConfirmModal from "../components/DeleteDriversConfirmModal.jsx";
import ApproveDriverConfirmModal from "../components/ApproveDriverConfirmModal.jsx";
import DriverSummaryModal from "../components/DriverSummaryModal.jsx";
import DriverAttachments from "../components/DriverAttachments.jsx";
import JeepColorCell from "../components/JeepColorCell.jsx";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import "./AdminDashboardPage.css";

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function driverDisplayName(driver) {
  return driver.fullName ?? driver.email ?? "this driver";
}

// Excel-style header filter: a funnel icon that opens a dropdown of the
// distinct values actually present in the currently loaded (status-
// filtered) driver list, so an option never has zero matching rows. The
// menu renders with `position: fixed` computed from the trigger's own
// screen position rather than being a normal absolutely-positioned child,
// so it isn't clipped by the table's horizontal-scroll container.
function ColumnFilterDropdown({ label, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const openMenu = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportMargin = 8;
    const preferredMaxHeight = 260;
    const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
    const spaceAbove = rect.top - viewportMargin;

    // If there isn't enough room below to show a useful list, and there's
    // more room above, open upward instead — either way the menu's own
    // max-height is clamped to whatever space actually exists, so its
    // internal scrollbar is always reachable rather than running off the
    // bottom (or top) of the viewport.
    const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(preferredMaxHeight, openUpward ? spaceAbove : spaceBelow));
    const top = openUpward ? rect.top - 4 - maxHeight : rect.bottom + 4;

    const estimatedMenuWidth = 200;
    const left = Math.min(rect.left, window.innerWidth - estimatedMenuWidth - viewportMargin);

    setMenuPosition({ top, left: Math.max(viewportMargin, left), maxHeight });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    // Focus the menu so wheel/trackpad scrolling and arrow/Page keys target
    // its own scroll container rather than the page behind it.
    menuRef.current?.focus();

    const isInsideMenuOrTrigger = (target) =>
      triggerRef.current?.contains(target) || menuRef.current?.contains(target);

    const handleClickOutside = (event) => {
      if (isInsideMenuOrTrigger(event.target)) return;
      setIsOpen(false);
    };
    // Scrolling *inside* the menu's own overflow also fires a `scroll`
    // event (captured here same as a page/table scroll would be) — closing
    // on that would make the menu impossible to scroll at all, so only
    // close when the scroll happened somewhere else.
    const handleScroll = (event) => {
      if (isInsideMenuOrTrigger(event.target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const isActive = value !== "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-driver-table__filter-trigger${
          isActive ? " admin-driver-table__filter-trigger--active" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
          } else {
            openMenu();
          }
        }}
        aria-label={`Filter by ${label}`}
        aria-expanded={isOpen}
      >
        <Filter size={13} strokeWidth={2.5} />
      </button>
      {isOpen && menuPosition && (
        <div
          ref={menuRef}
          className="admin-driver-table__filter-menu"
          tabIndex={-1}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          <button
            type="button"
            className={`admin-driver-table__filter-option${
              !isActive ? " admin-driver-table__filter-option--selected" : ""
            }`}
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
          >
            (All)
          </button>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`admin-driver-table__filter-option${
                value === option ? " admin-driver-table__filter-option--selected" : ""
              }`}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// One button, three states, cycling on each click: unsorted → ascending →
// descending → unsorted. The icon itself flips between the "wide-to-narrow"
// (descending, also the resting/unsorted look) and "narrow-to-wide"
// (ascending) variants rather than showing two separate up/down buttons.
function SortToggleButton({ label, column, sortState, onChange }) {
  const isActive = sortState.column === column;
  const direction = isActive ? sortState.direction : null;

  const handleClick = () => {
    if (!isActive) {
      onChange({ column, direction: "asc" });
    } else if (direction === "asc") {
      onChange({ column, direction: "desc" });
    } else {
      onChange({ column: null, direction: "asc" });
    }
  };

  const nextDirectionLabel = !isActive ? "ascending" : direction === "asc" ? "descending" : "off";
  const Icon = direction === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <button
      type="button"
      className={`admin-driver-table__sort-button${
        isActive ? " admin-driver-table__sort-button--active" : ""
      }`}
      onClick={handleClick}
      aria-label={`Sort by ${label} (currently ${direction ?? "unsorted"}, click for ${nextDirectionLabel})`}
    >
      <Icon size={14} strokeWidth={2.25} />
    </button>
  );
}

function AdminDashboardPage() {
  const navigate = useNavigate();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [drivers, setDrivers] = useState([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [routes, setRoutes] = useState([]);
  const [terminals, setTerminals] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState({
    jeepColor: "",
    vehicleType: "",
    route: "",
    terminal: "",
  });
  const [sortState, setSortState] = useState({ column: null, direction: "asc" });

  const [selectedDriverIds, setSelectedDriverIds] = useState(() => new Set());
  const [editingDriver, setEditingDriver] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null); // { ids: string[], names: string[] }
  const [isDeleting, setIsDeleting] = useState(false);

  // Pending-only: which row's detail/review panel is expanded (one at a
  // time), and — when the admin has clicked Reject on that row — the
  // in-progress remarks draft for it.
  const [expandedDriverId, setExpandedDriverId] = useState(null);
  const [rejectDraftId, setRejectDraftId] = useState(null);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const [approveTarget, setApproveTarget] = useState(null);
  const [isApproving, setIsApproving] = useState(false);

  // Approved/Rejected only: the driver whose read-only summary card is
  // currently open (clicking a row).
  const [summaryDriver, setSummaryDriver] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!isCancelled) navigate("/admin/login", { replace: true });
        return;
      }

      const { data: adminRow } = await supabase
        .from("admins")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (isCancelled) return;

      if (!adminRow) {
        await supabase.auth.signOut();
        navigate("/admin/login", { replace: true });
        return;
      }

      setIsCheckingAuth(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, [navigate]);

  // Routes/terminals are public-read reference data (schema.sql's "public
  // read routes/terminals" policies) — no edge function needed, and the
  // edit modal needs them as select options.
  useEffect(() => {
    if (isCheckingAuth) return;
    supabase
      .from("routes")
      .select("id, name")
      .order("name")
      .then(({ data }) => setRoutes(data ?? []));
    supabase
      .from("terminals")
      .select("id, name")
      .order("name")
      .then(({ data }) => setTerminals(data ?? []));
  }, [isCheckingAuth]);

  // Guards against out-of-order responses: if the status tab changes (or
  // StrictMode double-fires the effect) while a request is in flight, a
  // slower earlier response must not clobber a newer one that already
  // landed.
  const latestRequestIdRef = useRef(0);

  const loadDrivers = useCallback(async (status) => {
    const requestId = ++latestRequestIdRef.current;
    setIsLoadingDrivers(true);
    setLoadError(null);

    const { data, error } = await supabase.functions.invoke("admin-list-drivers", {
      body: { status },
    });

    if (requestId !== latestRequestIdRef.current) return;

    if (error) {
      setLoadError(error.message ?? "Failed to load drivers.");
      setDrivers([]);
    } else if (data?.error) {
      setLoadError(data.error);
      setDrivers([]);
    } else {
      setDrivers(data?.drivers ?? []);
    }
    setIsLoadingDrivers(false);
  }, []);

  useEffect(() => {
    if (isCheckingAuth) return;
    setSelectedDriverIds(new Set());
    setSearchQuery("");
    setColumnFilters({ jeepColor: "", vehicleType: "", route: "", terminal: "" });
    setSortState({ column: null, direction: "asc" });
    setExpandedDriverId(null);
    setRejectDraftId(null);
    setRejectRemarks("");
    setSummaryDriver(null);
    loadDrivers(statusFilter);
  }, [isCheckingAuth, statusFilter, loadDrivers]);

  // Options are derived from the currently loaded drivers, not a fixed
  // list, so a filter dropdown never offers a value with zero matches.
  const columnFilterOptions = useMemo(() => {
    const unique = (mapValue) =>
      Array.from(new Set(drivers.map(mapValue).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      jeepColor: unique((driver) => driver.jeepColor),
      vehicleType: unique((driver) => driver.vehicleType),
      route: unique((driver) => driver.route?.name),
      terminal: unique((driver) => driver.terminal?.name),
    };
  }, [drivers]);

  const visibleDrivers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = drivers.filter((driver) => {
      if (columnFilters.jeepColor && driver.jeepColor !== columnFilters.jeepColor) return false;
      if (columnFilters.vehicleType && driver.vehicleType !== columnFilters.vehicleType) return false;
      if (columnFilters.route && driver.route?.name !== columnFilters.route) return false;
      if (columnFilters.terminal && driver.terminal?.name !== columnFilters.terminal) return false;

      if (!query) return true;
      const haystack = [
        driver.fullName,
        driver.email,
        driver.mobileNumber,
        driver.plateNumber,
        driver.vehicleRegistrationNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    if (!sortState.column) return filtered;

    // Blank values always sort to the end, in either direction — sorting
    // ascending then reversing for descending would flip blanks to the
    // front instead, so the direction only flips the real-value comparison.
    return [...filtered].sort((a, b) => {
      const aValue = (a[sortState.column] ?? "").trim();
      const bValue = (b[sortState.column] ?? "").trim();
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      const comparison = aValue.localeCompare(bValue, undefined, { sensitivity: "base" });
      return sortState.direction === "desc" ? -comparison : comparison;
    });
  }, [drivers, searchQuery, columnFilters, sortState]);

  const submitApprove = async (driver) => {
    setIsApproving(true);
    const { data, error } = await supabase.functions.invoke("admin-verify-driver", {
      body: { driver_id: driver.id, status: "approved" },
    });

    if (error || data?.error) {
      setIsApproving(false);
      window.alert(error?.message ?? data?.error ?? "Failed to approve driver.");
      return;
    }

    setDrivers((current) => current.filter((d) => d.id !== driver.id));
    if (expandedDriverId === driver.id) setExpandedDriverId(null);
    setIsApproving(false);
    setApproveTarget(null);
  };

  const startReject = (driver) => {
    setExpandedDriverId(driver.id);
    setRejectDraftId(driver.id);
    setRejectRemarks("");
  };

  const cancelReject = () => {
    setRejectDraftId(null);
    setRejectRemarks("");
  };

  const submitReject = async (driver) => {
    const remarks = rejectRemarks.trim();
    if (!remarks) return;

    setIsRejecting(true);
    const { data, error } = await supabase.functions.invoke("admin-verify-driver", {
      body: { driver_id: driver.id, status: "rejected", rejection_reason: remarks },
    });

    if (error || data?.error) {
      setIsRejecting(false);
      window.alert(error?.message ?? data?.error ?? "Failed to reject driver.");
      return;
    }

    setDrivers((current) => current.filter((d) => d.id !== driver.id));
    if (expandedDriverId === driver.id) setExpandedDriverId(null);
    setIsRejecting(false);
    setRejectDraftId(null);
    setRejectRemarks("");
  };

  const toggleSelected = (driverId) => {
    setSelectedDriverIds((current) => {
      const next = new Set(current);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const allVisibleSelected =
    visibleDrivers.length > 0 && visibleDrivers.every((driver) => selectedDriverIds.has(driver.id));

  const handleSelectAll = () => {
    setSelectedDriverIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        visibleDrivers.forEach((driver) => next.delete(driver.id));
        return next;
      }
      const next = new Set(current);
      visibleDrivers.forEach((driver) => next.add(driver.id));
      return next;
    });
  };

  const handleSaveEdit = async (updates) => {
    setIsSavingEdit(true);
    const { data, error } = await supabase.functions.invoke("admin-update-driver", {
      body: { driver_id: editingDriver.id, ...updates },
    });

    if (error || data?.error) {
      setIsSavingEdit(false);
      window.alert(error?.message ?? data?.error ?? "Failed to save changes.");
      return;
    }

    setDrivers((current) =>
      current.map((driver) =>
        driver.id === editingDriver.id
          ? {
              ...driver,
              fullName: updates.full_name || null,
              mobileNumber: updates.mobile_number || null,
              plateNumber: updates.plate_number || null,
              vehicleRegistrationNumber: updates.vehicle_registration_number || null,
              jeepColor: data.driver?.jeep_color ?? null,
              vehicleType: data.driver?.vehicle_type ?? null,
              route: data.driver?.route ?? null,
              terminal: data.driver?.terminal ?? null,
            }
          : driver
      )
    );
    setIsSavingEdit(false);
    setEditingDriver(null);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-drivers", {
      body: { driver_ids: deleteRequest.ids },
    });

    if (error || data?.error) {
      setIsDeleting(false);
      window.alert(error?.message ?? data?.error ?? "Failed to delete driver accounts.");
      return;
    }

    const failedIds = new Set(
      (data.results ?? []).filter((result) => result.error).map((result) => result.id)
    );
    const deletedIds = deleteRequest.ids.filter((id) => !failedIds.has(id));

    setDrivers((current) => current.filter((driver) => !deletedIds.includes(driver.id)));
    setSelectedDriverIds((current) => {
      const next = new Set(current);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });

    setIsDeleting(false);
    setDeleteRequest(null);

    if (failedIds.size > 0) {
      window.alert(`${failedIds.size} account(s) could not be deleted.`);
    }
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  if (isCheckingAuth) return <LoadingScreen message="Loading admin dashboard…" />;

  // Pending applications lean on the expand panel for the full detail —
  // the collapsed row only needs enough to identify who's who at a glance.
  // Approved/Rejected keep every column, unchanged.
  const isPendingTab = statusFilter === "pending";

  return (
    <main className="admin-dashboard-page">
      <header className="admin-dashboard-page__header">
        <h1 className="admin-dashboard-page__title">Driver Applications</h1>
        <button type="button" className="admin-dashboard-page__logout-button" onClick={handleLogOut}>
          <LogOut size={15} strokeWidth={2.25} />
          Log out
        </button>
      </header>

      <div className="admin-dashboard-page__toolbar">
        <div className="admin-dashboard-page__tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`admin-dashboard-page__tab${
                statusFilter === tab.value ? " admin-dashboard-page__tab--active" : ""
              }`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-dashboard-page__search-bar">
          <Search size={16} strokeWidth={2.25} className="admin-dashboard-page__search-icon" />
          <input
            type="search"
            className="admin-dashboard-page__search-input"
            placeholder="Search by name, email, mobile, plate, or vehicle reg. no."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      {selectedDriverIds.size > 0 && (
        <div className="admin-dashboard-page__bulk-bar">
          <span className="admin-dashboard-page__selection-count">
            {selectedDriverIds.size} selected
          </span>
          <button
            type="button"
            className="admin-dashboard-page__bulk-delete-button"
            onClick={() =>
              setDeleteRequest({
                ids: Array.from(selectedDriverIds),
                names: drivers
                  .filter((driver) => selectedDriverIds.has(driver.id))
                  .map(driverDisplayName),
              })
            }
          >
            <Trash2 size={14} strokeWidth={2.25} />
            Delete selected
          </button>
        </div>
      )}

      {isLoadingDrivers && <LoadingScreen message="Loading drivers…" fullScreen={false} />}
      {!isLoadingDrivers && loadError && (
        <p className="admin-dashboard-page__status-message admin-dashboard-page__status-message--error">
          {loadError}
        </p>
      )}
      {!isLoadingDrivers && !loadError && drivers.length === 0 && (
        <p className="admin-dashboard-page__status-message">No {statusFilter} applications.</p>
      )}
      {!isLoadingDrivers && !loadError && drivers.length > 0 && visibleDrivers.length === 0 && (
        <p className="admin-dashboard-page__status-message">
          No drivers match your search or filters.
        </p>
      )}

      {!isLoadingDrivers && !loadError && visibleDrivers.length > 0 && (
        <div className="admin-dashboard-page__table-wrap">
          <table className="admin-driver-table">
            <thead>
              <tr>
                <th className="admin-driver-table__expand-col" />
                <th className="admin-driver-table__checkbox-col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleSelectAll}
                    aria-label="Select all visible drivers"
                  />
                </th>
                {!isPendingTab && <th>License</th>}
                <th>
                  <div className="admin-driver-table__header-with-filter">
                    Name
                    <SortToggleButton
                      label="name"
                      column="fullName"
                      sortState={sortState}
                      onChange={setSortState}
                    />
                  </div>
                </th>
                <th>Email</th>
                <th>Mobile</th>
                {!isPendingTab && <th>Plate No.</th>}
                {!isPendingTab && <th>Vehicle Reg.</th>}
                {!isPendingTab && (
                  <th>
                    <div className="admin-driver-table__header-with-filter">
                      Jeep Color
                      <ColumnFilterDropdown
                        label="jeep color"
                        value={columnFilters.jeepColor}
                        options={columnFilterOptions.jeepColor}
                        onChange={(value) => setColumnFilters((c) => ({ ...c, jeepColor: value }))}
                      />
                    </div>
                  </th>
                )}
                <th>
                  <div className="admin-driver-table__header-with-filter">
                    Vehicle Type
                    <ColumnFilterDropdown
                      label="vehicle type"
                      value={columnFilters.vehicleType}
                      options={columnFilterOptions.vehicleType}
                      onChange={(value) => setColumnFilters((c) => ({ ...c, vehicleType: value }))}
                    />
                  </div>
                </th>
                {!isPendingTab && (
                  <th>
                    <div className="admin-driver-table__header-with-filter">
                      Route
                      <ColumnFilterDropdown
                        label="route"
                        value={columnFilters.route}
                        options={columnFilterOptions.route}
                        onChange={(value) => setColumnFilters((c) => ({ ...c, route: value }))}
                      />
                    </div>
                  </th>
                )}
                {!isPendingTab && (
                  <th>
                    <div className="admin-driver-table__header-with-filter">
                      Terminal
                      <ColumnFilterDropdown
                        label="terminal"
                        value={columnFilters.terminal}
                        options={columnFilterOptions.terminal}
                        onChange={(value) => setColumnFilters((c) => ({ ...c, terminal: value }))}
                      />
                    </div>
                  </th>
                )}
                {!isPendingTab && <th>Status</th>}
                <th className="admin-driver-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDrivers.map((driver) => {
                const isPending = driver.verificationStatus === "pending";
                const isExpanded = expandedDriverId === driver.id;
                const isRejectingThis = rejectDraftId === driver.id;

                return (
                  <Fragment key={driver.id}>
                    <tr
                      className={
                        selectedDriverIds.has(driver.id) ? "admin-driver-table__row--selected" : undefined
                      }
                      onClick={() => {
                        if (!isPending) setSummaryDriver(driver);
                      }}
                      style={!isPending ? { cursor: "pointer" } : undefined}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        {isPending && (
                          <button
                            type="button"
                            className="admin-driver-table__expand-button"
                            onClick={() => setExpandedDriverId(isExpanded ? null : driver.id)}
                            aria-label={isExpanded ? "Collapse application details" : "Review application details"}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <ChevronDown size={15} strokeWidth={2.5} />
                            ) : (
                              <ChevronRight size={15} strokeWidth={2.5} />
                            )}
                          </button>
                        )}
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedDriverIds.has(driver.id)}
                          onChange={() => toggleSelected(driver.id)}
                          aria-label={`Select ${driverDisplayName(driver)}`}
                        />
                      </td>
                      {!isPendingTab && (
                        <td>
                          {driver.licensePhotoSignedUrl ? (
                            <img
                              src={driver.licensePhotoSignedUrl}
                              alt={`${driver.fullName ?? "Driver"}'s license`}
                              className="admin-driver-table__thumb"
                            />
                          ) : (
                            <span className="admin-driver-table__cell-muted">—</span>
                          )}
                        </td>
                      )}
                      <td className="admin-driver-table__name-cell">
                        {driver.fullName ?? "Unnamed driver"}
                      </td>
                      <td>{driver.email ?? <span className="admin-driver-table__cell-muted">—</span>}</td>
                      <td>
                        {driver.mobileNumber ?? <span className="admin-driver-table__cell-muted">—</span>}
                      </td>
                      {!isPendingTab && (
                        <td>
                          {driver.plateNumber ?? <span className="admin-driver-table__cell-muted">—</span>}
                        </td>
                      )}
                      {!isPendingTab && (
                        <td>
                          {driver.vehicleRegistrationNumber ?? (
                            <span className="admin-driver-table__cell-muted">—</span>
                          )}
                        </td>
                      )}
                      {!isPendingTab && (
                        <td>
                          <JeepColorCell jeepColor={driver.jeepColor} />
                        </td>
                      )}
                      <td>
                        {driver.vehicleType ?? <span className="admin-driver-table__cell-muted">—</span>}
                      </td>
                      {!isPendingTab && (
                        <td>
                          {driver.route?.name ?? <span className="admin-driver-table__cell-muted">—</span>}
                        </td>
                      )}
                      {!isPendingTab && (
                        <td>
                          {driver.terminal?.name ?? <span className="admin-driver-table__cell-muted">—</span>}
                        </td>
                      )}
                      {!isPendingTab && (
                        <td>
                          <span
                            className={`admin-driver-table__status-badge admin-driver-table__status-badge--${driver.verificationStatus}`}
                          >
                            {driver.verificationStatus}
                          </span>
                        </td>
                      )}
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="admin-driver-table__actions">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className="admin-driver-table__icon-button admin-driver-table__icon-button--approve"
                                onClick={() => setApproveTarget(driver)}
                                title="Approve"
                                aria-label="Approve"
                              >
                                <Check size={15} strokeWidth={2.5} />
                              </button>
                              <button
                                type="button"
                                className="admin-driver-table__icon-button admin-driver-table__icon-button--reject"
                                onClick={() => startReject(driver)}
                                title="Reject"
                                aria-label="Reject"
                              >
                                <X size={15} strokeWidth={2.5} />
                              </button>
                            </>
                          )}
                          {!isPendingTab && (
                            <button
                              type="button"
                              className="admin-driver-table__icon-button admin-driver-table__icon-button--edit"
                              onClick={() => setEditingDriver(driver)}
                              title="Edit"
                              aria-label="Edit"
                            >
                              <Pencil size={15} strokeWidth={2.5} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="admin-driver-table__icon-button admin-driver-table__icon-button--delete"
                            onClick={() =>
                              setDeleteRequest({ ids: [driver.id], names: [driverDisplayName(driver)] })
                            }
                            title="Delete"
                            aria-label="Delete"
                          >
                            <Trash2 size={15} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isPending && isExpanded && (
                      <tr className="admin-driver-table__detail-row">
                        <td colSpan={7}>
                          <div className="admin-driver-detail-panel">
                            <dl className="admin-driver-detail-panel__fields">
                              <div>
                                <dt>Full name</dt>
                                <dd>{driver.fullName ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Email</dt>
                                <dd>{driver.email ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Mobile</dt>
                                <dd>{driver.mobileNumber ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Plate number</dt>
                                <dd>{driver.plateNumber ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Vehicle registration</dt>
                                <dd>{driver.vehicleRegistrationNumber ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Jeep color</dt>
                                <dd>
                                  <JeepColorCell jeepColor={driver.jeepColor} />
                                </dd>
                              </div>
                              <div>
                                <dt>Vehicle type</dt>
                                <dd>{driver.vehicleType ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Route</dt>
                                <dd>{driver.route?.name ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Terminal</dt>
                                <dd>{driver.terminal?.name ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>Applied</dt>
                                <dd>{new Date(driver.createdAt).toLocaleDateString()}</dd>
                              </div>
                            </dl>

                            <DriverAttachments driver={driver} variant="sidebar" />

                            <div className="admin-driver-detail-panel__actions">
                              <span className="admin-driver-detail-panel__actions-label">Actions</span>
                              <div className="admin-driver-detail-panel__actions-buttons">
                                <button
                                  type="button"
                                  className="admin-driver-detail-panel__action-button admin-driver-detail-panel__action-button--approve"
                                  onClick={() => setApproveTarget(driver)}
                                >
                                  <Check size={14} strokeWidth={2.5} />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="admin-driver-detail-panel__action-button admin-driver-detail-panel__action-button--reject"
                                  onClick={() => startReject(driver)}
                                >
                                  <X size={14} strokeWidth={2.5} />
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  className="admin-driver-detail-panel__action-button admin-driver-detail-panel__action-button--delete"
                                  onClick={() =>
                                    setDeleteRequest({ ids: [driver.id], names: [driverDisplayName(driver)] })
                                  }
                                >
                                  <Trash2 size={14} strokeWidth={2.5} />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>

                          {isRejectingThis && (
                            <div className="admin-driver-detail-panel__remarks">
                              <label
                                htmlFor={`reject-remarks-${driver.id}`}
                                className="admin-driver-detail-panel__remarks-label"
                              >
                                Remarks — why is this application being rejected?
                              </label>
                              <textarea
                                id={`reject-remarks-${driver.id}`}
                                className="admin-driver-detail-panel__remarks-textarea"
                                rows={3}
                                value={rejectRemarks}
                                onChange={(event) => setRejectRemarks(event.target.value)}
                                placeholder="e.g. License photo is blurry and unreadable"
                                autoFocus
                              />
                              <div className="admin-driver-detail-panel__remarks-actions">
                                <button
                                  type="button"
                                  className="admin-driver-detail-panel__remarks-cancel-button"
                                  onClick={cancelReject}
                                  disabled={isRejecting}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="admin-driver-detail-panel__remarks-confirm-button"
                                  onClick={() => submitReject(driver)}
                                  disabled={isRejecting || !rejectRemarks.trim()}
                                >
                                  {isRejecting ? "Rejecting…" : "Confirm Reject"}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingDriver && (
        <DriverEditModal
          driver={editingDriver}
          routes={routes}
          terminals={terminals}
          onSave={handleSaveEdit}
          onCancel={() => setEditingDriver(null)}
          isSaving={isSavingEdit}
        />
      )}

      {deleteRequest && (
        <DeleteDriversConfirmModal
          driverNames={deleteRequest.names}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteRequest(null)}
          isDeleting={isDeleting}
        />
      )}

      {approveTarget && (
        <ApproveDriverConfirmModal
          driverName={driverDisplayName(approveTarget)}
          onConfirm={() => submitApprove(approveTarget)}
          onCancel={() => setApproveTarget(null)}
          isApproving={isApproving}
        />
      )}

      {summaryDriver && (
        <DriverSummaryModal driver={summaryDriver} onClose={() => setSummaryDriver(null)} />
      )}
    </main>
  );
}

export default AdminDashboardPage;
