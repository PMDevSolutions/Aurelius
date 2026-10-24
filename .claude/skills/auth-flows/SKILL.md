---
name: auth-flows
description: Authentication patterns for React apps — Auth.js (NextAuth), Clerk, Supabase Auth. Covers session management, protected routes, role-based access, and OAuth flows. Keywords: authentication, auth, login, sign in, sign up, session, protected route, authorization, OAuth, clerk, supabase auth, nextauth
---

# Authentication Flows

## Decision Tree — Choosing an Auth Provider

```
Which framework?
├── Next.js
│   ├── Need full control / self-hosted? → Auth.js v5
│   ├── Want managed UI + user management? → Clerk
│   └── Already using Supabase DB? → Supabase Auth
├── Vite / Remix / SPA
│   ├── Want drop-in components? → Clerk
│   └── Using Supabase backend? → Supabase Auth
```

| Provider | Best For | Hosting | UI Components |
|----------|----------|---------|---------------|
| Auth.js v5 | Full control, self-hosted, Next.js | Self-hosted | Custom (build your own) |
| Clerk | Fast setup, managed users, any framework | Managed SaaS | Built-in (SignIn, SignUp, UserButton) |
| Supabase Auth | Supabase stack, row-level security | Supabase cloud / self-hosted | Headless (build your own) |

---

## 1. Auth.js v5 (NextAuth) — Next.js

### Installation

```bash
pnpm add next-auth@beta @auth/prisma-adapter
```

### Configuration

```ts
// auth.ts (project root)
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.hashedPassword) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.hashedPassword
        );
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Attach role to JWT on sign-in
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose role in client session
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/auth/error",
    newUser: "/onboarding",
  },
  session: {
    strategy: "jwt",
  },
});
```

### Type Augmentation

```ts
// types/next-auth.d.ts
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
  }
}
```

### Route Handler

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

### Middleware for Protected Routes

```ts
// middleware.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/settings", "/admin"];
const adminPaths = ["/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAdmin = adminPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdmin && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/admin/:path*"],
};
```

### Server Component Access

```tsx
// app/dashboard/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {session.user.name}</p>
      <p>Role: {session.user.role}</p>
    </div>
  );
}
```

### Client Component Access

```tsx
// components/UserNav.tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function UserNav() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div aria-busy="true">Loading...</div>;
  }

  if (!session) {
    return (
      <button onClick={() => signIn()}>Sign In</button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span>{session.user.name}</span>
      <button onClick={() => signOut({ callbackUrl: "/" })}>
        Sign Out
      </button>
    </div>
  );
}
```

### Session Provider (Layout)

```tsx
// app/layout.tsx
import { SessionProvider } from "next-auth/react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

---

## 2. Clerk — Any Framework

### Installation

```bash
pnpm add @clerk/nextjs
# or for Vite:
# pnpm add @clerk/clerk-react
```

### Environment Variables

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### Middleware

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

### Layout Provider

```tsx
// app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

### Built-in Components

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}
```

```tsx
// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
```

```tsx
// components/Header.tsx
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/nextjs";

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <h1>My App</h1>
      <nav>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal" />
        </SignedOut>
      </nav>
    </header>
  );
}
```

### Server-Side Auth

```tsx
// app/dashboard/page.tsx
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.firstName}</p>
    </div>
  );
}
```

---

## 3. Supabase Auth

### Installation

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

### Browser Client

```ts
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Server Client (Next.js App Router)

```ts
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in Server Components (read-only)
          }
        },
      },
    }
  );
}
```

### Middleware

```ts
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users from protected routes
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

### Sign In / Sign Up

```tsx
// app/login/page.tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const supabase = createClient();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/dashboard";
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <form onSubmit={handleSignIn}>
      {error && <p role="alert" className="text-red-600">{error}</p>}

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit">Sign In</button>

      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => handleOAuth("github")}>
          Continue with GitHub
        </button>
        <button type="button" onClick={() => handleOAuth("google")}>
          Continue with Google
        </button>
      </div>
    </form>
  );
}
```

---

## 4. Role-Based Access Control (RBAC)

A framework-agnostic RBAC pattern that works with any auth provider.

```ts
// lib/auth/permissions.ts

export const roles = {
  admin: {
    permissions: [
      "users:read",
      "users:write",
      "users:delete",
      "posts:read",
      "posts:write",
      "posts:delete",
      "settings:read",
      "settings:write",
    ],
  },
  editor: {
    permissions: [
      "posts:read",
      "posts:write",
      "posts:delete",
      "users:read",
    ],
  },
  viewer: {
    permissions: [
      "posts:read",
      "users:read",
    ],
  },
} as const;

export type Role = keyof typeof roles;

export type Permission =
  (typeof roles)[Role]["permissions"][number];

export function hasPermission(
  userRole: Role,
  permission: Permission
): boolean {
  const role = roles[userRole];
  return (role.permissions as readonly string[]).includes(permission);
}

export function requirePermission(
  userRole: Role,
  permission: Permission
): void {
  if (!hasPermission(userRole, permission)) {
    throw new Error(
      `Role "${userRole}" does not have permission "${permission}"`
    );
  }
}
```

### RequirePermission Component

```tsx
// components/RequirePermission.tsx
"use client";

import { type ReactNode } from "react";
import { hasPermission, type Permission, type Role } from "@/lib/auth/permissions";

interface RequirePermissionProps {
  role: Role;
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({
  role,
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  if (!hasPermission(role, permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
```

Usage:

```tsx
<RequirePermission
  role={session.user.role}
  permission="users:delete"
  fallback={<p>You do not have permission to manage users.</p>}
>
  <UserManagementPanel />
</RequirePermission>
```

### Server-Side Permission Check

```ts
// app/admin/users/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { requirePermission, type Role } from "@/lib/auth/permissions";

export default async function AdminUsersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  try {
    requirePermission(session.user.role as Role, "users:write");
  } catch {
    redirect("/unauthorized");
  }

  return <UserManagementPanel />;
}
```

---

## 5. Security Rules

These rules are NON-NEGOTIABLE for any auth implementation:

| Rule | Reason |
|------|--------|
| Never store tokens in `localStorage` | XSS attacks can steal them. Use `httpOnly` cookies. |
| Always use `httpOnly` cookies for sessions | Cannot be accessed by client-side JavaScript. |
| Validate sessions server-side | Never trust client-side session data for authorization decisions. |
| Implement CSRF protection | Auth.js and Next.js include CSRF tokens automatically. Verify for custom APIs. |
| Rate limit auth endpoints | Prevent brute force attacks. Use middleware or API route rate limiting. |
| Hash passwords with bcrypt (cost 12+) | Never store plaintext or weakly-hashed passwords. |
| Rotate refresh tokens | Invalidate old tokens when issuing new ones to limit exposure. |
| Validate redirect URLs | Only allow redirects to trusted origins. Never redirect to user-supplied URLs without validation. |
| Use `secure` and `sameSite` cookie flags | `secure: true` in production, `sameSite: "lax"` minimum. |
| Log authentication events | Record sign-ins, failures, and password resets for audit trails. |

### Redirect URL Validation

```ts
// lib/auth/validate-redirect.ts
const ALLOWED_HOSTS = [
  process.env.NEXT_PUBLIC_APP_URL,
  "localhost:3000",
];

export function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url, process.env.NEXT_PUBLIC_APP_URL);
    return ALLOWED_HOSTS.some(
      (host) => parsed.origin === new URL(`https://${host}`).origin
    );
  } catch {
    return false;
  }
}

export function getSafeRedirect(url: string | null, fallback = "/"): string {
  if (!url) return fallback;
  return isValidRedirectUrl(url) ? url : fallback;
}
```
