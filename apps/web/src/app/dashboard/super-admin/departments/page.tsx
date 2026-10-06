"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuthStore } from "@/lib/store/auth-store";
import { appClient } from "@/lib/api-client";
import { usePageHeader } from "@/app/components/dashboard/PageHeaderContext";
import { DataTable } from "@/app/components/dashboard/DataTable";
import {
  DepartmentFormModal,
  type Department,
} from "@/app/components/dashboard/DepartmentFormModal";
import { DeleteDepartmentModal } from "@/app/components/dashboard/DeleteDepartmentModal";

// Only the fields needed to count heads per department. GET /users is what
// makes the count possible client-side — there is no
// /departments/:id/employees endpoint.
interface UserRow {
  id: string;
  departmentId: string | null;
}

// GET /users is paginated (list-users.dto.ts caps `limit` at 100 —
// MAX_PAGE_SIZE) — it used to return a bare array, and this page still
// destructured it as one, so `users.filter` threw the moment the backend
// added pagination ("users.filter is not a function").
//
// Unlike lib/notifications.ts's best-effort single page, headcounts here
// are the entire point of the page, so undercounting past the first 100
// employees would be a real, wrong number shown to an admin — this walks
// every page rather than accepting that cap.
interface UserPage {
  items: UserRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function fetchAllUsers(): Promise<UserRow[]> {
  const first = await appClient.get<UserPage>("/users", {
    params: { page: 1, limit: 100 },
  });
  if (first.data.totalPages <= 1) {
    return first.data.items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: first.data.totalPages - 1 }, (_, i) =>
      appClient.get<UserPage>("/users", { params: { page: i + 2, limit: 100 } })
    )
  );

  return [
    ...first.data.items,
    ...remainingPages.flatMap((res) => res.data.items),
  ];
}

export default function SuperAdminDepartmentsPage() {
  const orgName =
    useAuthStore((state) => state.user?.organizationName) ??
    "Your organization";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<"create" | Department | null>(null);
  const [deletingDepartment, setDeletingDepartment] =
    useState<Department | null>(null);

  const fetchAll = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      appClient.get<Department[]>("/departments"),
      fetchAllUsers(),
    ])
      .then(([departmentsRes, allUsers]) => {
        // Sorted by name: the API returns creation order, which turns into
        // an arbitrary shuffle as soon as more than a handful exist.
        setDepartments(
          [...departmentsRes.data].sort((a, b) => a.name.localeCompare(b.name))
        );
        setUsers(allUsers);
      })
      .catch(() => setError("Couldn't load departments. Please try again."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function countEmployees(departmentId: string) {
    return users.filter((user) => user.departmentId === departmentId).length;
  }

  const unassignedCount = users.filter((user) => !user.departmentId).length;

  usePageHeader(
    "Departments",
    `${orgName} · ${departments.length} ${
      departments.length === 1 ? "department" : "departments"
    }`
  );

  return (
    <div>
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={() => setModalMode("create")}
          className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add department
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-neutral">Loading departments...</p>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-alert/10 border border-alert/30 text-alert text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!isLoading && !error && departments.length === 0 && (
        <div className="text-sm text-neutral">
          <p>
            No departments yet — click &quot;Add department&quot; to create your
            first one.
          </p>
          <p className="mt-1">
            Prefer the guided version?{" "}
            <Link href="/onboarding" className="text-primary font-medium">
              Run the setup wizard
            </Link>
            .
          </p>
        </div>
      )}

      {!isLoading && !error && departments.length > 0 && (
        <>
          {/* Surfaced because there is no other screen that reveals it: an
              unassigned employee is invisible in every department report,
              and nothing else would tell you they exist. */}
          {unassignedCount > 0 && (
            <p className="mb-4 text-sm text-neutral">
              {unassignedCount}{" "}
              {unassignedCount === 1 ? "employee has" : "employees have"} no
              department and{" "}
              {unassignedCount === 1 ? "does" : "do"} not appear in department
              reports.
            </p>
          )}

          <DataTable
            rows={departments}
            getRowKey={(department) => department.id}
            emptyMessage="No departments yet."
            pageSize={10}
            itemLabel="department"
            renderCardHeader={(department) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-heading break-words">
                    {department.name}
                  </p>
                  <p className="text-[12px] text-neutral">
                    {countEmployees(department.id)}{" "}
                    {countEmployees(department.id) === 1
                      ? "employee"
                      : "employees"}
                  </p>
                </div>
              </div>
            )}
            columns={[
              {
                key: "name",
                header: "Department",
                hideOnMobile: true,
                render: (department) => (
                  <span className="font-semibold text-heading">
                    {department.name}
                  </span>
                ),
              },
              {
                key: "employees",
                header: "Employees",
                render: (department) => (
                  <span className="font-medium text-heading whitespace-nowrap">
                    {countEmployees(department.id)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                align: "right",
                render: (department) => (
                  <div className="flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => setModalMode(department)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingDepartment(department)}
                      className="text-sm font-medium text-alert hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {modalMode && (
        <DepartmentFormModal
          department={modalMode === "create" ? undefined : modalMode}
          onClose={() => setModalMode(null)}
          onSaved={fetchAll}
        />
      )}

      {deletingDepartment && (
        <DeleteDepartmentModal
          department={deletingDepartment}
          employeeCount={countEmployees(deletingDepartment.id)}
          onClose={() => setDeletingDepartment(null)}
          onDeleted={fetchAll}
        />
      )}
    </div>
  );
}
