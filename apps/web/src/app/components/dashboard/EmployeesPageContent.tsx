"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { useAuthStore, type UserRole } from "@/lib/store/auth-store";
import type { VisibleUserStatus } from "@smartbiotrack/types";
import { ROLE_CREATION_MATRIX, ROLE_LABEL } from "@/lib/roleCreationMatrix";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { DataTable } from "@/app/components/dashboard/DataTable";
import { AddPersonModal } from "@/app/components/dashboard/AddPersonModal";
import { EditEmployeeModal } from "@/app/components/dashboard/EditEmployeeModal";
import { DeleteEmployeeModal } from "@/app/components/dashboard/DeleteEmployeeModal";
import {
  EmployeeDetailModal,
  type EmployeeDetail,
} from "@/app/components/dashboard/EmployeeDetailModal";

// Shared between dashboard/super-admin/employees/page.tsx and
// dashboard/hr-admin/employees/page.tsx — same list, same two invite
// flows. The only real difference between the two roles is which roles
// each is allowed to invite (ROLE_CREATION_MATRIX), looked up here from
// whoever's actually logged in rather than hardcoded per page.
interface EmployeeListItem {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  // VisibleUserStatus, not UserStatus: findAll filters DELETED rows out before
  // they reach the browser. Derived from the shared UserStatus via Exclude, so
  // it cannot invent a status the database has never heard of — which is what
  // the hand-written `"PENDING" | "ACTIVE" | "SUSPENDED"` here had become after
  // soft deletes added a fourth value and nobody updated this line.
  status: VisibleUserStatus;
  departmentId: string | null;
  officeId: string | null;
}

/**
 * GET /users returns one page, not the whole directory — it used to return
 * every row, which for a five-thousand-employee customer was a multi-megabyte
 * response serialised in a single tick.
 */
interface UserPage {
  items: EmployeeListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Matches DataTable's own page size, so the rhythm of the list is unchanged. */
const PAGE_SIZE = 10;

interface Department {
  id: string;
  name: string;
}

interface Office {
  id: string;
  name: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const STATUS_STYLE: Record<EmployeeListItem["status"], string> = {
  ACTIVE: "bg-success/10 text-success",
  PENDING: "bg-warning/10 text-warning",
  SUSPENDED: "bg-alert/10 text-alert",
};

export function EmployeesPageContent() {
  const currentRole = useAuthStore((state) => state.user?.role);

  const allowedRoles = currentRole ? ROLE_CREATION_MATRIX[currentRole] : [];
  const canAddPeople = allowedRoles.length > 0;

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<EmployeeListItem | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeListItem | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeListItem | null>(null);

  // Debounced so typing does not fire a request per keystroke. Searching is
  // the server's job now: with only one page in memory, filtering client-side
  // would search the ten rows on screen and quietly miss everyone else.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // A new search starts at the beginning. Without this, searching while on
  // page 7 asks for page 7 of a much shorter result and shows an empty table.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Departments and offices are small, unpaginated lookups used only to turn
  // ids into names. Fetched once rather than alongside every page of users,
  // which is what the previous single fetchAll did.
  useEffect(() => {
    Promise.all([
      appClient
        .get<Department[]>("/departments")
        .catch(() => ({ data: [] as Department[] })),
      appClient.get<Office[]>("/offices").catch(() => ({ data: [] as Office[] })),
    ]).then(([deptRes, officeRes]) => {
      setDepartments(deptRes.data);
      setOffices(officeRes.data);
    });
  }, []);

  const fetchUsers = useCallback(() => {
    setIsLoading(true);
    setError(null);

    appClient
      .get<UserPage>("/users", {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(debouncedSearch ? { q: debouncedSearch } : {}),
        },
      })
      .then((res) => {
        setEmployees(res.data.items);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(() => setError("Couldn't load employees. Please try again."))
      .finally(() => setIsLoading(false));
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /** Refetches after an add, edit, suspend or delete. */
  const fetchAll = fetchUsers;

  usePageHeader("Employees", `${total} record${total === 1 ? "" : "s"}`);

  const departmentName = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments]
  );
  const officeName = useMemo(
    () => Object.fromEntries(offices.map((o) => [o.id, o.name])),
    [offices]
  );

  // The client-side filter that used to live here is gone. It could only ever
  // see the rows already fetched, so with one page in memory it would have
  // searched ten people and reported "no employees match" for the rest.

  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <div >
      <div className="flex flex-wrap items-center justify-end gap-3 mb-6">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees"
            className="w-full rounded-md border border-neutral/40 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {canAddPeople && (
          <button
            type="button"
            onClick={() => setIsAddPersonOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add person
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-neutral">Loading employees...</p>}

      {error && (
        <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!isLoading && employees.length === 0 && (
        <p className="text-sm text-neutral">
          {debouncedSearch
            ? "No employees match your search."
            : "No employees yet."}
        </p>
      )}

      {!isLoading && employees.length > 0 && (
        <DataTable
          rows={employees}
          getRowKey={(employee) => employee.id}
          emptyMessage="No employees match your search."
          // No pageSize: DataTable renders exactly the rows it is given.
          // Paging is the server's, so letting the table slice them again
          // would paginate a page — "1 / 1" under a list that is one of many.
          itemLabel="employees"
          // On mobile the person's identity leads the card; the matching
          // columns below set hideOnMobile so they aren't repeated.
          renderCardHeader={(employee) => (
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                {getInitials(employee.name)}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-heading wrap-break-word">
                  {employee.name}
                </p>
                <p className="text-[12px] text-neutral">
                  {employee.employeeId}
                </p>
              </div>
            </div>
          )}
          columns={[
            {
              key: "employee",
              header: "Employee",
              hideOnMobile: true,
              render: (employee) => (
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                    {getInitials(employee.name)}
                  </span>
                  <span className="font-semibold text-heading">
                    {employee.name}
                  </span>
                </div>
              ),
            },
            {
              key: "employeeId",
              header: "ID",
              hideOnMobile: true,
              render: (employee) => (
                <span className="text-neutral">{employee.employeeId}</span>
              ),
            },
            {
              key: "department",
              header: "Department",
              render: (employee) => (
                <span className="text-neutral">
                  {employee.departmentId
                    ? departmentName[employee.departmentId] ?? "—"
                    : "—"}
                </span>
              ),
            },
            {
              key: "role",
              header: "Role",
              render: (employee) => (
                <span className="text-neutral">{ROLE_LABEL[employee.role]}</span>
              ),
            },
            {
              key: "office",
              header: "Office",
              render: (employee) => (
                <span className="text-neutral">
                  {employee.officeId ? officeName[employee.officeId] ?? "—" : "—"}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (employee) => (
                <span
                  className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[employee.status]}`}
                >
                  {employee.status}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (employee) => (
                <div className="flex items-center justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setViewingEmployee(employee)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(employee)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingEmployee(employee)}
                    className="text-sm font-medium text-alert hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {/* Server-driven, so the counts describe the whole directory rather than
          what happens to be loaded. DataTable's own footer is not in play —
          it only appears when the table is doing its own paging. */}
      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4 text-sm">
          <p className="text-neutral">
            Showing {firstShown}&ndash;{lastShown} of {total} employee
            {total === 1 ? "" : "s"}
          </p>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-neutral/30 px-3 py-1.5 font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-neutral tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
                className="rounded-md border border-neutral/30 px-3 py-1.5 font-medium text-heading hover:bg-neutral/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {isAddPersonOpen && (
        <AddPersonModal
          allowedRoles={allowedRoles}
          onClose={() => setIsAddPersonOpen(false)}
          onInvited={fetchAll}
        />
      )}

      {editingEmployee && (
        <EditEmployeeModal
          employee={editingEmployee}
          allowedRoles={allowedRoles}
          onClose={() => setEditingEmployee(null)}
          onSaved={fetchAll}
        />
      )}

      {deletingEmployee && (
        <DeleteEmployeeModal
          employee={deletingEmployee}
          onClose={() => setDeletingEmployee(null)}
          onDeleted={fetchAll}
        />
      )}

      {viewingEmployee && (
        <EmployeeDetailModal
          employee={{
            id: viewingEmployee.id,
            employeeId: viewingEmployee.employeeId,
            name: viewingEmployee.name,
            email: viewingEmployee.email,
            role: viewingEmployee.role,
            status: viewingEmployee.status,
            departmentName: viewingEmployee.departmentId
              ? departmentName[viewingEmployee.departmentId] ?? null
              : null,
            officeName: viewingEmployee.officeId
              ? officeName[viewingEmployee.officeId] ?? null
              : null,
          }}
          onClose={() => setViewingEmployee(null)}
          onStatusChanged={fetchAll}
        />
      )}
    </div>
  );
}
