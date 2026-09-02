"use client";

import toast, { Toaster, type Toast as HotToast } from "react-hot-toast";
import { CircleCheck, CircleX, Info, X } from "lucide-react";

// A thin wrapper over react-hot-toast.
//
// The library handles the hard parts — queueing, enter/exit animation,
// pause-on-hover, stacking, cleanup. This file only supplies the markup,
// so toasts use the same theme tokens as the rest of the app and work in
// light and dark without a second set of colours.
//
// It keeps the useToast() shape the call sites already use:
//
//   const toast = useToast();
//   toast.success("Office created");
//   toast.error("Couldn't save", extractErrorMessage(err));
//
// react-hot-toast's own toast.success() takes a single message, so a
// title + description pair goes through toast.custom() below.

type ToastVariant = "success" | "error" | "info";

const DURATION_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
};

const VARIANT_META: Record<
  ToastVariant,
  { icon: typeof CircleCheck; accent: string; iconClass: string }
> = {
  success: {
    icon: CircleCheck,
    accent: "border-l-success",
    iconClass: "text-success",
  },
  error: { icon: CircleX, accent: "border-l-alert", iconClass: "text-alert" },
  info: { icon: Info, accent: "border-l-primary", iconClass: "text-primary" },
};

function render(
  instance: HotToast,
  variant: ToastVariant,
  title: string,
  description?: string
) {
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={`pointer-events-auto flex w-96 max-w-[92vw] items-start gap-3 rounded-lg border border-neutral/20 border-l-4 ${
        meta.accent
      } bg-surface p-4 shadow-lg transition-opacity ${
        instance.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <Icon
        className={`h-5 w-5 shrink-0 mt-0.5 ${meta.iconClass}`}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-heading">{title}</p>
        {description && (
          <p className="mt-1 text-[13px] text-neutral wrap-break-word">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(instance.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-neutral hover:text-heading transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function push(variant: ToastVariant, title: string, description?: string) {
  toast.custom(
    (instance) => render(instance, variant, title, description),
    { duration: DURATION_MS[variant] }
  );
}

export function useToast() {
  return {
    success: (title: string, description?: string) =>
      push("success", title, description),
    error: (title: string, description?: string) =>
      push("error", title, description),
    info: (title: string, description?: string) =>
      push("info", title, description),
  };
}

export function ToastViewport() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      containerStyle={{ top: 16, right: 16, zIndex: 100 }}
    />
  );
}
