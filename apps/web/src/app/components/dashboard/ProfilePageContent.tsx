"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  CircleCheck,
  Info,
  KeyRound,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { appClient, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/app/components/Toast";
import { ROLE_LABEL } from "@/lib/roleCreationMatrix";
import { useAuthStore, type AuthUser } from "@/lib/store/auth-store";
import { Toggle } from "@/app/components/dashboard/Toggle";
import { UserAvatar } from "@/app/components/dashboard/UserAvatar";
import {
  AVATAR_ACCEPTED_TYPES,
  useAvatarStore,
  useAvatarUrl,
} from "@/lib/store/avatar-store";

// Shared by every role's /profile route — an HR Admin has a password and
// registered devices exactly like an Employee does, so there's one
// component here rather than four near-identical pages. Same pattern as
// EmployeesPageContent.
//
// WHAT IS AND ISN'T REAL, checked against the backend directly:
//   REAL   — name, email, role, organization, department (GET /auth/me),
//            and the password reset link (POST /auth/forgot-password).
//   ABSENT — employeeId / office exist as columns but aren't in the
//            /auth/me payload, and GET /users is restricted to admin
//            roles, so an employee can't look themselves up either.
//   ABSENT — phone, job title and profile picture have no column on the
//            User model (the picture is a preview held in memory).
//   ABSENT — self-service editing. PATCH /users/:id exists but is admin-only
//            and refuses to edit the caller's own record, so the identity
//            fields are read-only and point to HR. Also no change-password
//            route, no Device model, no notification-preference model.
// Everything unbacked is rendered but disabled and labelled, so the page
// shows the intended product without pretending anything persists.

interface DeviceRow {
  id: string;
  name: string;
  registeredOn: string;
  lastUsed: string;
}

// Example rows — there's no Device model to fetch from.
const DEVICES: DeviceRow[] = [
  {
    id: "1",
    name: "iPhone 14",
    registeredOn: "12 Mar 2026",
    lastUsed: "Today, 08:03 WAT",
  },
  {
    id: "2",
    name: "ELN-LAP-0412 (Windows Hello)",
    registeredOn: "04 Jan 2026",
    lastUsed: "Yesterday, 17:41 WAT",
  },
];

const NOTIFICATION_PREFS = [
  { key: "shift", label: "Shift reminders", initial: true },
  { key: "flagged", label: "Flagged punch updates", initial: true },
  { key: "leave", label: "Leave request decisions", initial: true },
  { key: "system", label: "System announcements", initial: false },
] as const;

export function ProfilePageContent() {
  const toast = useToast();
  // Seed from the store so something renders immediately, then refresh
  // from /auth/me — the stored copy could be stale if an admin changed
  // something since the last login.
  const storedUser = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<AuthUser | null>(storedUser);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        NOTIFICATION_PREFS.map((pref) => [pref.key, pref.initial])
      )
  );

  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetSent, setIsResetSent] = useState(false);

  useEffect(() => {
    let isActive = true;

    appClient
      .get<AuthUser>("/auth/me")
      .then(({ data }) => {
        if (!isActive) return;
        setProfile(data);
      })
      .catch((error) => {
        // Non-fatal: the stored copy is still on screen.
        if (isActive) setLoadError(extractErrorMessage(error));
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleConfirmReset() {
    if (!profile?.email) return;
    setResetError(null);
    setIsSendingReset(true);
    try {
      // The endpoint emails the link and returns the same generic response
      // whatever the outcome, so it can't be used to probe which addresses
      // exist. Nothing comes back to display.
      await appClient.post("/auth/forgot-password", { email: profile.email });
      setIsResetSent(true);
      toast.success(
        "Password reset email sent successfully",
        "Follow the link in your inbox. Setting a new password signs you out everywhere."
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      setResetError(message);
      toast.error("Could not generate a reset link", message);
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* ---- Left: identity ---- */}
      <div className="bg-surface border border-neutral/20 rounded-xl p-5">
        <h6 className="text-[15px] font-semibold text-heading">
          Personal information
        </h6>
        <p className="text-[12px] text-neutral">
          Employment data is managed by HR.
        </p>

        {loadError && (
          <p className="mt-3 text-sm text-alert">
            Could not refresh your profile: {loadError}
          </p>
        )}

        {profile && (
          <ProfilePhoto
            userId={profile.id}
            nameOrEmail={profile.name ?? profile.email}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <ReadOnlyField label="Full name" value={profile?.name} />
          <ReadOnlyField label="Employee ID" value={undefined} />

          {/* Read-only: email is the login identifier, and PATCH /users/:id
              deliberately never changes it. Phone has no column at all. */}
          <ReadOnlyField label="Email" value={profile?.email} />
          <ReadOnlyField label="Phone" value={undefined} />

          <ReadOnlyField label="Department" value={profile?.departmentName} />
          {/* The SYSTEM role — permissions and which dashboard they land
              on. Distinct from job title below, which is descriptive. */}
          <ReadOnlyField
            label="Role"
            value={profile ? ROLE_LABEL[profile.role] : undefined}
          />

          <ReadOnlyField label="Job title" value={undefined} />
          <ReadOnlyField label="Branch" value={undefined} />

          <div>
            <p className="block text-sm font-medium text-heading mb-1">
              Status
            </p>
            {/* Genuinely known rather than assumed: JwtStrategy rejects
                any user whose status isn't ACTIVE, so simply being able
                to load this page proves it. */}
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <CircleCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
              Active
            </div>
          </div>
        </div>

        {/* No Save button: PATCH /users/:id is admin-only and refuses
            self-edits by design, so there is nothing for one to call. */}
        <div className="mt-5 flex items-start gap-2 rounded-md bg-neutral/5 border border-neutral/20 px-3 py-2.5 text-[13px] text-neutral">
          <Info className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <p>
            Your details are managed by HR. Ask an admin to change your name,
            department or branch. Employee ID, branch and job title
            aren&apos;t returned to you yet.
          </p>
        </div>
      </div>

      {/* ---- Right: security and preferences ---- */}
      <div className="flex flex-col gap-6">
        <div className="bg-surface border border-neutral/20 rounded-xl p-5">
          <h6 className="text-[15px] font-semibold text-heading">
            Registered devices
          </h6>
          <p className="text-[12px] text-neutral">
            Attendance is only accepted from trusted devices.
          </p>

          <div className="mt-4 divide-y divide-neutral/10">
            {DEVICES.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-heading truncate">
                    {device.name}
                  </p>
                  <p className="text-[12px] text-neutral">
                    Registered {device.registeredOn} · last used{" "}
                    {device.lastUsed}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    disabled
                    title="No device registry exists on the backend yet."
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                    Re-register
                  </button>
                  <button
                    type="button"
                    disabled
                    title="No device registry exists on the backend yet."
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-alert disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[12px] text-neutral">
            Example devices — there&apos;s no device registry on the backend
            yet.
          </p>
        </div>

        {/* The one action on this page that genuinely works. */}
        <div className="bg-surface border border-neutral/20 rounded-xl p-5">
          <h6 className="text-[15px] font-semibold text-heading">Password</h6>
          <p className="text-[12px] text-neutral">
            Generate a one-time link to set a new password. This signs you out
            of every device.
          </p>

          {!isConfirmingReset && !isResetSent && (
            <button
              type="button"
              onClick={() => setIsConfirmingReset(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-neutral/30 px-4 py-2.5 text-sm font-medium text-heading hover:bg-neutral/10"
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
              Reset my password
            </button>
          )}

          {isConfirmingReset && !isResetSent && (
            <div className="mt-4">
              <p className="text-sm text-neutral">
                This revokes your current sessions. You&apos;ll need to sign in
                again with the new password.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={isSendingReset}
                  className="rounded-md bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingReset ? "Generating…" : "Generate reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingReset(false);
                    setResetError(null);
                  }}
                  className="rounded-md border border-neutral/30 px-4 py-2.5 text-sm font-medium text-heading hover:bg-neutral/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {resetError && <p className="mt-3 text-sm text-alert">{resetError}</p>}

          {isResetSent && (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-3 py-3">
              <MailCheck
                className="h-5 w-5 shrink-0 text-success"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm text-heading">
                  Check your inbox — we&apos;ve emailed you a link to set a new
                  password.
                </p>
                <p className="mt-1 text-xs text-neutral">
                  It expires shortly. Nothing there? Look in spam, then try
                  again.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface border border-neutral/20 rounded-xl p-5">
          <h6 className="text-[15px] font-semibold text-heading">
            Notification preferences
          </h6>

          <div className="mt-4 divide-y divide-neutral/10">
            {NOTIFICATION_PREFS.map((pref) => (
              <div
                key={pref.key}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-heading">{pref.label}</span>
                <Toggle
                  checked={notifications[pref.key]}
                  onChange={(checked) =>
                    setNotifications((prev) => ({
                      ...prev,
                      [pref.key]: checked,
                    }))
                  }
                  label={pref.label}
                />
              </div>
            ))}
          </div>

          {/* Left interactive rather than disabled: a switch you can't
              move can't show what the setting does. It's local state and
              says so. */}
          <p className="mt-3 text-[12px] text-neutral">
            These reset on refresh — there&apos;s nowhere to store
            notification preferences yet.
          </p>
        </div>

        <div className="flex items-start gap-2 bg-primary/10 text-primary text-sm rounded-md px-4 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          No raw biometric images are stored on our servers — verification
          happens at the device/OS level.
        </div>
      </div>
    </div>
  );
}

// Picture picker. Preview only: there's no avatar column or upload endpoint,
// so the image is held in memory (lib/store/avatar-store.ts) and the note
// below says it disappears on refresh.
function ProfilePhoto({
  userId,
  nameOrEmail,
}: {
  userId: string;
  nameOrEmail: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const setFromFile = useAvatarStore((state) => state.setFromFile);
  const clear = useAvatarStore((state) => state.clear);
  const hasPhoto = useAvatarUrl(userId) !== null;
  const [error, setError] = useState<string | null>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;
    setError(setFromFile(userId, file));
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <UserAvatar userId={userId} nameOrEmail={nameOrEmail} size="lg" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-neutral/30 px-3 py-2 text-sm font-medium text-heading hover:bg-neutral/10"
          >
            <Camera className="h-4 w-4" strokeWidth={1.75} />
            {hasPhoto ? "Change photo" : "Upload photo"}
          </button>
          {hasPhoto && (
            <button
              type="button"
              onClick={() => {
                clear();
                setError(null);
              }}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-alert hover:bg-alert/10"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPTED_TYPES.join(",")}
          onChange={handleChange}
          className="hidden"
          aria-label="Choose a profile photo"
        />
        <p className="mt-2 text-[12px] text-neutral">
          JPG, PNG or WebP, up to 2 MB. Preview only — it isn&apos;t saved
          yet and disappears when you refresh.
        </p>
        {error && <p className="mt-1 text-sm text-alert">{error}</p>}
      </div>
    </div>
  );
}

// Anything the backend can't give us yet renders as a muted "Not
// available yet" instead of an empty box, so a missing field never looks
// like a rendering bug.
function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="block text-sm font-medium text-heading mb-1">{label}</p>
      <div
        className={`rounded-md border border-neutral/30 bg-neutral/5 px-3 py-2 text-sm truncate ${
          value ? "text-heading" : "text-neutral italic"
        }`}
      >
        {value || "Not available yet"}
      </div>
    </div>
  );
}
