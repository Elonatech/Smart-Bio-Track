"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { appClient } from "@/lib/api-client";
import { useAuthStore, type UserRole } from "@/lib/store/auth-store";
import { ROLE_CREATION_MATRIX, ROLE_LABEL } from "@/lib/roleCreationMatrix";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { AddPersonModal } from "@/app/components/dashboard/AddPersonModal";
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
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  departmentId: string | null;
  officeId: string | null;
}

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
  // One flow for adding anyone — the role dropdown inside the modal
  // offers exactly these. An empty list means this user can't create
  // anybody (TEAM_LEAD, EMPLOYEE), so the button is hidden entirely.
  const allowedRoles = currentRole ? ROLE_CREATION_MATRIX[currentRole] : [];
  const canAddPeople = allowedRoles.length > 0;

  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<EmployeeListItem | null>(null);

  const fetchAll = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      appClient.get<EmployeeListItem[]>("/users"),
      appClient.get<Department[]>("/departments").catch(() => ({ data: [] as Department[] })),
      appClient.get<Office[]>("/offices").catch(() => ({ data: [] as Office[] })),
    ])
      .then(([usersRes, deptRes, officeRes]) => {
        setEmployees(usersRes.data);
        setDepartments(deptRes.data);
        setOffices(officeRes.data);
      })
      .catch(() => setError("Couldn't load employees. Please try again."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  usePageHeader("Employees", `${employees.length} record${employees.length === 1 ? "" : "s"}`);

  const departmentName = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments]
  );
  const officeName = useMemo(
    () => Object.fromEntries(offices.map((o) => [o.id, o.name])),
    [offices]
  );

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.employeeId, employee.email]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [employees, search]);

  return (
    <div>
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

      {!isLoading && filteredEmployees.length === 0 && (
        <p className="text-sm text-neutral">No employees match your search.</p>
      )}

      {!isLoading && filteredEmployees.length > 0 && (
        <div className="bg-surface border border-neutral/20 rounded-xl overflow-hidden p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral/20">
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    Employee
                  </th>
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    ID
                  </th>
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    Department
                  </th>
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    Role
                  </th>
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    Office
                  </th>
                  <th className="text-left  py-3 text-xs font-medium tracking-wide uppercase text-neutral">
                    Status
                  </th>
                  <th className=" py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b border-neutral/10 last:border-0">
                    <td className=" py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {getInitials(employee.name)}
                        </span>
                        <span className="font-semibold text-heading">{employee.name}</span>
                      </div>
                    </td>
                    <td className=" py-4 text-neutral whitespace-nowrap">
                      {employee.employeeId}
                    </td>
                    <td className=" py-4 text-neutral whitespace-nowrap">
                      {employee.departmentId ? departmentName[employee.departmentId] ?? "—" : "—"}
                    </td>
                    <td className=" py-4 text-neutral whitespace-nowrap">
                      {ROLE_LABEL[employee.role]}
                    </td>
                    <td className=" py-4 text-neutral whitespace-nowrap">
                      {employee.officeId ? officeName[employee.officeId] ?? "—" : "—"}
                    </td>
                    <td className=" py-4 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_STYLE[employee.status]}`}
                      >
                        {employee.status}
                      </span>
                    </td>
                    <td className=" py-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingEmployee(employee)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAddPersonOpen && (
        <AddPersonModal
          allowedRoles={allowedRoles}
          onClose={() => setIsAddPersonOpen(false)}
          onInvited={fetchAll}
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
        />
      )}
    </div>
  );
}
