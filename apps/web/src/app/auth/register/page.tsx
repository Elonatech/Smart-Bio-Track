"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormValues } from "@/lib/validation/auth";
import { appClient } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/lib/store/auth-store";

interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: AuthUser;
    accessToken: string;
  };
}

export default function RegisterPage() {
  const router = useRouter();
  // const register = useAuthStore((state) => state.register);
  // const [isSubmitting, setIsSubmitting] = useState(false);
  // const [serverError, setServerError] = useState<string | null>(null);

  return <div></div>;
}
