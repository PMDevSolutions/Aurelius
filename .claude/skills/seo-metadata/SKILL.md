---
name: seo-metadata
description: SEO patterns for React apps — Next.js Metadata API, Open Graph, structured data (JSON-LD), sitemap generation, and Core Web Vitals optimization. Keywords: SEO, metadata, open graph, og image, sitemap, structured data, json-ld, meta tags, social sharing
---

# SEO & Metadata — React Patterns

## 1. Next.js Static Metadata

Define static metadata in any `layout.tsx` or `page.tsx` using the exported `metadata` object. The `title.template` pattern in the root layout ensures consistent page titles site-wide.

```tsx
// app/layout.tsx
import { type Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: {
    default: "My App — Build faster with React",
    template: "%s | My App",
  },
  description:
    "A modern React application built with Next.js, TypeScript, and Tailwind CSS.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://example.com",
    siteName: "My App",
    title: "My App — Build faster with React",
    description:
      "A modern React application built with Next.js, TypeScript, and Tailwind CSS.",
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: "My App",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "My App — Build faster with React",
    description:
      "A modern React application built with Next.js, TypeScript, and Tailwind CSS.",
    creator: "@myapp",
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://example.com",
  },
};
```

Page-level metadata merges with the layout metadata and uses the `title.template`:

```tsx
// app/about/page.tsx
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us", // Renders as "About Us | My App"
  description: "Learn about our team and mission.",
  alternates: {
    canonical: "https://example.com/about",
  },
};

export default function AboutPage() {
  return <main>...</main>;
}
```

---

## 2. Dynamic Metadata

Use `generateMetadata` for pages where metadata depends on route params or fetched data.

```tsx
// app/blog/[slug]/page.tsx
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/posts";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  return {
    title: post.title,
    description: post.excerpt,
    authors: [{ name: post.author.name }],
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `https://example.com/blog/${slug}`,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      images: [
        {
          url: post.coverImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
    alternates: {
      canonical: `https://example.com/blog/${slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  );
}
```

---

## 3. Dynamic OG Image Generation

Use `ImageResponse` from `next/og` to generate Open Graph images on demand. This produces shareable social cards with dynamic content.

```tsx
// app/api/og/route.tsx
import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title") ?? "My App";
  const description = searchParams.get("description") ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          width: "100%",
          height: "100%",
          padding: "60px 80px",
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: "80%",
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: 28,
              color: "#94a3b8",
              marginTop: 24,
              maxWidth: "70%",
              lineHeight: 1.4,
            }}
          >
            {description}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            fontSize: 24,
            color: "#64748b",
          }}
        >
          example.com
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
```

Reference the OG image in metadata:

```tsx
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    openGraph: {
      images: [
        {
          url: `/api/og?title=${encodeURIComponent(post.title)}&description=${encodeURIComponent(post.excerpt)}`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
  };
}
```

---

## 4. Structured Data (JSON-LD)

Structured data helps search engines understand your content. Use JSON-LD format, which Google recommends.

### Reusable JsonLd Component

```tsx
// components/JsonLd.tsx
interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

### Article Schema

```tsx
// app/blog/[slug]/page.tsx
import { JsonLd } from "@/components/JsonLd";

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      "@type": "Person",
      name: post.author.name,
      url: post.author.url,
    },
    publisher: {
      "@type": "Organization",
      name: "My App",
      logo: {
        "@type": "ImageObject",
        url: "https://example.com/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://example.com/blog/${slug}`,
    },
  };

  return (
    <>
      <JsonLd data={articleJsonLd} />
      <article>
        <h1>{post.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: post.content }} />
      </article>
    </>
  );
}
```

### Product Schema

```tsx
const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: product.name,
  description: product.description,
  image: product.images,
  sku: product.sku,
  brand: {
    "@type": "Brand",
    name: product.brand,
  },
  offers: {
    "@type": "Offer",
    url: `https://example.com/products/${product.slug}`,
    priceCurrency: "USD",
    price: product.price,
    availability: product.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    seller: {
      "@type": "Organization",
      name: "My Store",
    },
  },
  aggregateRating: product.reviewCount > 0
    ? {
        "@type": "AggregateRating",
        ratingValue: product.averageRating,
        reviewCount: product.reviewCount,
      }
    : undefined,
};
```

### Organization Schema (Root Layout)

```tsx
// app/layout.tsx
import { JsonLd } from "@/components/JsonLd";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "My App",
  url: "https://example.com",
  logo: "https://example.com/logo.png",
  sameAs: [
    "https://twitter.com/myapp",
    "https://github.com/myapp",
    "https://linkedin.com/company/myapp",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@example.com",
    contactType: "customer support",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <JsonLd data={organizationJsonLd} />
        {children}
      </body>
    </html>
  );
}
```

---

## 5. Sitemap Generation

Next.js supports `sitemap.ts` files that generate sitemaps at build time or on request.

```tsx
// app/sitemap.ts
import { type MetadataRoute } from "next";
import { getAllPosts } from "@/lib/posts";
import { getAllProducts } from "@/lib/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://example.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  // Dynamic blog posts
  const posts = await getAllPosts();
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Dynamic product pages
  const products = await getAllProducts();
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${baseUrl}/products/${product.slug}`,
    lastModified: new Date(product.updatedAt),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...blogPages, ...productPages];
}
```

For large sites with more than 50,000 URLs, split into multiple sitemaps:

```tsx
// app/sitemap/[id]/route.ts
import { type MetadataRoute } from "next";

export async function generateSitemaps() {
  const totalProducts = await getProductCount();
  const sitemapCount = Math.ceil(totalProducts / 50000);

  return Array.from({ length: sitemapCount }, (_, i) => ({ id: i }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts({ offset: id * 50000, limit: 50000 });

  return products.map((product) => ({
    url: `https://example.com/products/${product.slug}`,
    lastModified: product.updatedAt,
  }));
}
```

---

## 6. Robots.txt

```tsx
// app/robots.ts
import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://example.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/private/"],
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

---

## 7. Vite SPA SEO

SPAs cannot use the Next.js Metadata API. Use `react-helmet-async` for client-side meta tags, or consider Vike (formerly vite-plugin-ssr) for SSR.

### react-helmet-async

```bash
pnpm add react-helmet-async
```

```tsx
// main.tsx
import { HelmetProvider } from "react-helmet-async";

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
```

```tsx
// components/SEO.tsx
import { Helmet } from "react-helmet-async";

interface SEOProps {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: "website" | "article";
}

export function SEO({
  title,
  description,
  url,
  image = "/og-default.png",
  type = "website",
}: SEOProps) {
  const siteName = "My App";
  const fullTitle = `${title} | ${siteName}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
```

Usage:

```tsx
function AboutPage() {
  return (
    <>
      <SEO
        title="About Us"
        description="Learn about our team and mission."
        url="https://example.com/about"
      />
      <main>...</main>
    </>
  );
}
```

**SPA Limitations:** Client-side meta tags only work if the crawler executes JavaScript. For full SEO support with a Vite app, use Vike for SSR/SSG or a pre-rendering service.

### Vike (SSR for Vite)

```bash
pnpm add vike vike-react
```

Vike provides file-based routing with SSR, enabling proper meta tags in the initial HTML response. See the Vike documentation for full setup.

---

## 8. SEO Checklist

Every page shipped to production must satisfy these requirements:

| Requirement | How to Verify |
|-------------|---------------|
| Unique `<title>` per page | Each page has distinct, descriptive title (50-60 characters) |
| Meta description | Each page has a unique description (150-160 characters) |
| Open Graph tags | `og:title`, `og:description`, `og:image`, `og:url` present |
| Twitter card tags | `twitter:card`, `twitter:title`, `twitter:image` present |
| Canonical URL | `<link rel="canonical">` on every page to prevent duplicates |
| JSON-LD structured data | Article, Product, Organization, or BreadcrumbList as appropriate |
| Sitemap | `sitemap.xml` generated and submitted to Google Search Console |
| Robots.txt | Exists, allows indexing of public pages, blocks private routes |
| Image alt text | Every `<img>` has a descriptive `alt` attribute |
| Heading hierarchy | Single `<h1>` per page, logical `<h2>`-`<h6>` nesting |
| Core Web Vitals | LCP < 2.5s, INP < 200ms, CLS < 0.1 |
| Mobile-friendly | Responsive layout, `<meta name="viewport">` present |
| HTTPS | All pages served over HTTPS |
| No broken links | Internal and external links return 200 |
| `lang` attribute | `<html lang="en">` (or appropriate language code) |

### Quick Validation Commands

```bash
# Lighthouse SEO audit
npx lighthouse https://example.com --only-categories=seo --output=json

# Check Open Graph tags
curl -s https://example.com | grep -E 'og:|twitter:'

# Validate structured data
# Use Google's Rich Results Test: https://search.google.com/test/rich-results

# Check sitemap
curl -s https://example.com/sitemap.xml | head -50

# Check robots.txt
curl -s https://example.com/robots.txt
```
