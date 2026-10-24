---
name: form-handling
description: Form patterns with React Hook Form + Zod validation. Covers typed forms, field arrays, multi-step wizards, server actions, and accessible error handling. Keywords: form, form handling, react hook form, zod, validation, form validation, multi-step form, wizard
---

# Form Handling — React Hook Form + Zod

## When to Use This Skill

Activate this skill when:
- Building any form (login, registration, settings, checkout)
- Adding client-side or server-side validation
- Building multi-step wizards or survey flows
- Handling file uploads with validation
- Integrating forms with Next.js server actions
- Working with dynamic/repeating field groups (invoices, line items)

---

## Stack

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

| Package | Purpose |
|---------|---------|
| `react-hook-form` | Performant form state management with uncontrolled inputs |
| `zod` | TypeScript-first schema validation with type inference |
| `@hookform/resolvers` | Bridges Zod schemas to React Hook Form validation |

---

## 1. Basic Typed Form Pattern

Define the schema once with Zod, infer the TypeScript type, and pass it to `useForm`. This eliminates type duplication between validation and form state.

```tsx
// schemas/contact.ts
import { z } from "zod";

export const contactSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters"),
  email: z
    .string()
    .email("Please enter a valid email address"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(1000, "Message must be under 1000 characters"),
});

export type ContactFormData = z.infer<typeof contactSchema>;
```

```tsx
// components/ContactForm.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactFormData } from "@/schemas/contact";

export function ContactForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  async function onSubmit(data: ContactFormData) {
    // data is fully typed and validated at this point
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      reset();
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField
        label="Name"
        error={errors.name?.message}
      >
        <input
          {...register("name")}
          type="text"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
      </FormField>

      <FormField
        label="Email"
        error={errors.email?.message}
      >
        <input
          {...register("email")}
          type="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </FormField>

      <FormField
        label="Message"
        error={errors.message?.message}
      >
        <textarea
          {...register("message")}
          rows={4}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
        />
      </FormField>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
```

---

## 2. Reusable FormField Component

A shared wrapper that handles labels, error display, and ARIA attributes consistently across all forms.

```tsx
// components/ui/FormField.tsx
import { type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  name?: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  name,
  error,
  description,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const fieldId = name ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {description && (
        <p id={descriptionId} className="mt-1 text-sm text-gray-500">
          {description}
        </p>
      )}

      <div className="mt-1">{children}</div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-sm text-red-600"
          aria-describedby={errorId}
        >
          {error}
        </p>
      )}
    </div>
  );
}
```

Usage with `register`:

```tsx
<FormField label="Email" name="email" error={errors.email?.message} required>
  <input
    id="email"
    {...register("email")}
    type="email"
    className={cn(
      "w-full rounded-md border px-3 py-2",
      errors.email
        ? "border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:ring-blue-500"
    )}
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? "email-error" : undefined}
  />
</FormField>
```

---

## 3. Dynamic Field Arrays

Use `useFieldArray` for repeating groups like invoice line items, team members, or address entries.

```tsx
// schemas/invoice.ts
import { z } from "zod";

export const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().min(1, "Minimum quantity is 1"),
  unitPrice: z.coerce.number().min(0.01, "Price must be positive"),
});

export const invoiceSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;
```

```tsx
// components/InvoiceForm.tsx
"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, type InvoiceFormData } from "@/schemas/invoice";

export function InvoiceForm() {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientName: "",
      items: [{ description: "", quantity: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchItems = watch("items");

  const total = watchItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
    0
  );

  function onSubmit(data: InvoiceFormData) {
    console.log("Invoice:", data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormField
        label="Client Name"
        name="clientName"
        error={errors.clientName?.message}
      >
        <input {...register("clientName")} type="text" />
      </FormField>

      <fieldset>
        <legend className="text-lg font-semibold">Line Items</legend>

        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-4 items-start">
            <FormField
              label="Description"
              error={errors.items?.[index]?.description?.message}
            >
              <input
                {...register(`items.${index}.description`)}
                type="text"
              />
            </FormField>

            <FormField
              label="Qty"
              error={errors.items?.[index]?.quantity?.message}
            >
              <input
                {...register(`items.${index}.quantity`)}
                type="number"
                min={1}
              />
            </FormField>

            <FormField
              label="Unit Price"
              error={errors.items?.[index]?.unitPrice?.message}
            >
              <input
                {...register(`items.${index}.unitPrice`)}
                type="number"
                step="0.01"
                min={0}
              />
            </FormField>

            <button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              aria-label={`Remove item ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}

        {errors.items?.root && (
          <p role="alert" className="text-sm text-red-600">
            {errors.items.root.message}
          </p>
        )}
      </fieldset>

      <button
        type="button"
        onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
      >
        + Add Item
      </button>

      <div className="text-right font-bold">
        Total: ${total.toFixed(2)}
      </div>

      <button type="submit">Create Invoice</button>
    </form>
  );
}
```

---

## 4. Multi-Step Wizard

A custom `useMultiStepForm` hook with per-step Zod validation. Each step validates only its own fields before advancing.

```tsx
// hooks/useMultiStepForm.ts
import { useState, useCallback } from "react";
import { type UseFormTrigger, type FieldPath } from "react-hook-form";

interface Step<T extends Record<string, unknown>> {
  id: string;
  title: string;
  fields: FieldPath<T>[];
}

export function useMultiStepForm<T extends Record<string, unknown>>(
  steps: Step<T>[],
  trigger: UseFormTrigger<T>
) {
  const [currentStep, setCurrentStep] = useState(0);

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const next = useCallback(async () => {
    // Validate only the fields in the current step
    const fieldsValid = await trigger(step.fields);
    if (fieldsValid && !isLastStep) {
      setCurrentStep((prev) => prev + 1);
    }
    return fieldsValid;
  }, [trigger, step.fields, isLastStep]);

  const back = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [isFirstStep]);

  const goTo = useCallback((index: number) => {
    setCurrentStep(index);
  }, []);

  return {
    currentStep,
    step,
    steps,
    isFirstStep,
    isLastStep,
    progress,
    next,
    back,
    goTo,
  };
}
```

```tsx
// schemas/onboarding.ts
import { z } from "zod";

export const onboardingSchema = z.object({
  // Step 1: Account
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),

  // Step 2: Profile
  displayName: z.string().min(2, "Display name required"),
  bio: z.string().max(500).optional(),

  // Step 3: Preferences
  theme: z.enum(["light", "dark", "system"]),
  notifications: z.boolean(),
});

export type OnboardingData = z.infer<typeof onboardingSchema>;

export const onboardingSteps = [
  { id: "account", title: "Account", fields: ["email", "password"] as const },
  { id: "profile", title: "Profile", fields: ["displayName", "bio"] as const },
  {
    id: "preferences",
    title: "Preferences",
    fields: ["theme", "notifications"] as const,
  },
];
```

```tsx
// components/OnboardingWizard.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  onboardingSchema,
  onboardingSteps,
  type OnboardingData,
} from "@/schemas/onboarding";
import { useMultiStepForm } from "@/hooks/useMultiStepForm";

export function OnboardingWizard() {
  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
      bio: "",
      theme: "system",
      notifications: true,
    },
  });

  const {
    currentStep,
    step,
    steps,
    isFirstStep,
    isLastStep,
    progress,
    next,
    back,
  } = useMultiStepForm(onboardingSteps, trigger);

  async function onSubmit(data: OnboardingData) {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Step ${currentStep + 1} of ${steps.length}`}
        className="h-2 bg-gray-200 rounded-full"
      >
        <div
          className="h-full bg-blue-600 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step indicators */}
      <nav aria-label="Form steps">
        <ol className="flex gap-4">
          {steps.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === currentStep ? "step" : undefined}
              className={i === currentStep ? "font-bold" : "text-gray-500"}
            >
              {s.title}
            </li>
          ))}
        </ol>
      </nav>

      {/* Step content */}
      <div>
        {currentStep === 0 && (
          <div>
            <FormField label="Email" error={errors.email?.message} required>
              <input {...register("email")} type="email" />
            </FormField>
            <FormField
              label="Password"
              error={errors.password?.message}
              required
            >
              <input {...register("password")} type="password" />
            </FormField>
          </div>
        )}

        {currentStep === 1 && (
          <div>
            <FormField
              label="Display Name"
              error={errors.displayName?.message}
              required
            >
              <input {...register("displayName")} type="text" />
            </FormField>
            <FormField label="Bio" error={errors.bio?.message}>
              <textarea {...register("bio")} rows={3} />
            </FormField>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <FormField label="Theme" error={errors.theme?.message}>
              <select {...register("theme")}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </FormField>
            <FormField label="Email Notifications">
              <label className="flex items-center gap-2">
                <input {...register("notifications")} type="checkbox" />
                <span>Receive email notifications</span>
              </label>
            </FormField>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button type="button" onClick={back} disabled={isFirstStep}>
          Back
        </button>

        {isLastStep ? (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Complete"}
          </button>
        ) : (
          <button type="button" onClick={next}>
            Next
          </button>
        )}
      </div>
    </form>
  );
}
```

---

## 5. Server Action Integration (Next.js)

Use `useActionState` to bridge React Hook Form with Next.js server actions for progressive enhancement.

```tsx
// actions/contact.ts
"use server";

import { contactSchema } from "@/schemas/contact";

interface ActionState {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
}

export async function submitContact(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  };

  const result = contactSchema.safeParse(raw);

  if (!result.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: result.error.flatten().fieldErrors,
    };
  }

  // Save to database, send email, etc.
  await saveContactSubmission(result.data);

  return {
    success: true,
    message: "Thank you for your message!",
  };
}
```

```tsx
// components/ContactFormWithAction.tsx
"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactFormData } from "@/schemas/contact";
import { submitContact } from "@/actions/contact";

export function ContactFormWithAction() {
  const [state, formAction, isPending] = useActionState(submitContact, {
    success: false,
    message: "",
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  // Client-side validation first, then server action
  const onSubmit = handleSubmit(async (_data, event) => {
    const formData = new FormData(event?.target as HTMLFormElement);
    formAction(formData);
  });

  return (
    <form action={formAction} onSubmit={onSubmit}>
      {state.message && (
        <div
          role="alert"
          className={state.success ? "text-green-600" : "text-red-600"}
        >
          {state.message}
        </div>
      )}

      <FormField
        label="Name"
        error={errors.name?.message || state.errors?.name?.[0]}
      >
        <input {...register("name")} name="name" type="text" />
      </FormField>

      <FormField
        label="Email"
        error={errors.email?.message || state.errors?.email?.[0]}
      >
        <input {...register("email")} name="email" type="email" />
      </FormField>

      <FormField
        label="Message"
        error={errors.message?.message || state.errors?.message?.[0]}
      >
        <textarea {...register("message")} name="message" rows={4} />
      </FormField>

      <button type="submit" disabled={isPending}>
        {isPending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
```

---

## 6. Accessibility Checklist

Every form built with this skill MUST satisfy these requirements:

| Requirement | Implementation |
|-------------|---------------|
| Every input has a visible `<label>` | `<label htmlFor="fieldId">` matching the input `id` |
| Errors are announced to screen readers | `role="alert"` on error messages |
| Inputs link to their errors | `aria-describedby="fieldId-error"` on the input |
| Invalid state is communicated | `aria-invalid={true}` when field has an error |
| Required fields are indicated | `aria-required="true"` or `required` attribute, plus visible indicator |
| Form-level errors are announced | `role="alert"` on summary error container |
| Focus management on errors | Move focus to first invalid field after failed submission |
| Submit button shows loading state | `disabled` + text change during `isSubmitting` |
| Progress in wizards | `role="progressbar"` with `aria-valuenow` |
| Fieldsets group related fields | `<fieldset>` + `<legend>` for field groups |

### Focus Management on Validation Failure

```tsx
function onInvalid() {
  // Focus the first field with an error
  const firstError = document.querySelector<HTMLElement>(
    '[aria-invalid="true"]'
  );
  firstError?.focus();
}

<form onSubmit={handleSubmit(onSubmit, onInvalid)}>
```

---

## 7. Testing Forms

### Test: Validation Error Display

```tsx
// __tests__/ContactForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { ContactForm } from "../ContactForm";

describe("ContactForm", () => {
  it("shows validation errors when submitting empty form", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    // Submit empty form
    await user.click(screen.getByRole("button", { name: /send/i }));

    // Expect error messages
    expect(
      await screen.findByText(/name must be at least 2 characters/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/please enter a valid email/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/message must be at least 10 characters/i)
    ).toBeInTheDocument();

    // Verify aria-invalid is set
    expect(screen.getByLabelText(/name/i)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("submits successfully with valid data", async () => {
    const user = userEvent.setup();
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );

    render(<ContactForm />);

    await user.type(screen.getByLabelText(/name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(
      screen.getByLabelText(/message/i),
      "Hello, this is a test message for the form."
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    // Verify fetch was called with correct data
    expect(mockFetch).toHaveBeenCalledWith("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        email: "jane@example.com",
        message: "Hello, this is a test message for the form.",
      }),
    });

    mockFetch.mockRestore();
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    render(<ContactForm />);

    await user.type(screen.getByLabelText(/name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.type(screen.getByLabelText(/message/i), "A valid message that is long enough.");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });
});
```

### Test: Multi-Step Wizard Navigation

```tsx
// __tests__/OnboardingWizard.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { OnboardingWizard } from "../OnboardingWizard";

describe("OnboardingWizard", () => {
  it("validates step 1 before advancing to step 2", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    // Try to advance without filling fields
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Should still be on step 1 with errors
    expect(
      await screen.findByText(/valid email required/i)
    ).toBeInTheDocument();

    // Fill step 1 correctly
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Should now see step 2
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it("allows navigating back without losing data", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    // Fill step 1
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "securepassword");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Go back
    await user.click(screen.getByRole("button", { name: /back/i }));

    // Data should be preserved
    expect(screen.getByLabelText(/email/i)).toHaveValue("test@example.com");
  });
});
```
