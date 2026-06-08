"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { error: null };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <section className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Back-office
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Sign in to continue.
      </p>

      <form action={formAction} className="flex flex-col gap-4" data-testid="login-form">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            data-testid="login-email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="login-password"
          />
        </div>

        {state.error && (
          <p data-testid="login-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="min-h-11"
          disabled={pending}
          data-testid="login-submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </section>
  );
}
