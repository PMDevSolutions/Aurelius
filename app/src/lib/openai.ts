import OpenAI from "openai";
import { getLanguageByCode } from "./languages";

const isDevMode =
  typeof window !== "undefined" && window.location?.hostname === "localhost";

function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
    ...(isDevMode ? { baseURL: `${window.location.origin}/api/openai` } : {}),
  });
}

async function chatWithRetry(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxRetries = 2,
): Promise<string> {
  const client = createClient(apiKey);
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      const text = response.choices[0]?.message?.content?.trim() ?? "";
      // Strip wrapping quotes if present
      return text.replace(/^["']|["']$/g, "");
    } catch (error: unknown) {
      // Don't retry auth or billing errors — they won't resolve
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) throw error;
      if (retries === maxRetries) throw error;
      retries++;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
    }
  }
  throw new Error("Max retries exceeded");
}

interface AdvancedOptions {
  pageType?: string;
  secondaryKeywords?: string;
  languageCode?: string;
}

function buildAdvancedContext(opts?: AdvancedOptions): string {
  if (!opts) return "";
  let ctx = "";
  if (opts.pageType || opts.secondaryKeywords) {
    ctx = "\n\nAdvanced Context:";
    if (opts.pageType) ctx += `\n- Page Type: ${opts.pageType}`;
    if (opts.secondaryKeywords) ctx += `\n- Secondary Keywords: ${opts.secondaryKeywords}`;
  }
  return ctx;
}

function buildLanguageInstruction(langCode?: string): string {
  if (!langCode || langCode === "en") return "";
  const lang = getLanguageByCode(langCode);
  if (!lang) return "";
  return `\n\nIMPORTANT: Generate all content in ${lang.name} (${lang.nativeName}). Provide recommendations entirely in this language.`;
}

export async function generateRecommendation(
  apiKey: string,
  checkId: string,
  keyword: string,
  context: string,
  advancedOptions?: AdvancedOptions,
): Promise<string> {
  const advCtx = buildAdvancedContext(advancedOptions);
  const langInst = buildLanguageInstruction(advancedOptions?.languageCode);
  const pageTypeStr = advancedOptions?.pageType
    ? ` for a ${advancedOptions.pageType.replace("-", " ")}`
    : "";

  const copyableSystem = `You are an SEO expert providing ready-to-use content.
Create a single, concise, and optimized piece of content that naturally incorporates the keyphrase.
Return ONLY the final content with no additional explanation, quotes, or formatting.
The content must be directly usable by copying and pasting.${advCtx ? " Consider the page type and additional context provided." : ""}${langInst}`;

  const advisorySystem = `You are an SEO expert providing actionable advice.
Provide a concise recommendation for improving this SEO issue.${advCtx ? " Consider the page type and additional context provided." : ""}${langInst}`;

  switch (checkId) {
    case "title-keyword":
      return chatWithRetry(apiKey, copyableSystem,
        `Create a perfect SEO title for the keyphrase "${keyword}".
Current title: ${context}${advCtx}
Requirements:
- 50-60 characters
- Naturally incorporate the keyphrase "${keyword}"
- Make it compelling and click-worthy${pageTypeStr}
Return ONLY the title text.`);

    case "meta-description-keyword":
      return chatWithRetry(apiKey, copyableSystem,
        `Create a perfect meta description for the keyphrase "${keyword}".
Current description: ${context}${advCtx}
Requirements:
- 120-155 characters
- Naturally incorporate the keyphrase "${keyword}"
- Make it compelling with a call to action${pageTypeStr}
Return ONLY the description text.`);

    case "keyword-url":
      return chatWithRetry(apiKey, copyableSystem,
        `Create an SEO-friendly URL slug for the keyphrase "${keyword}".
Current URL: ${context}${advCtx}
Requirements:
- Extract ONLY the page slug (the part after the last slash)
- Ignore protocol, domain name, and folder paths
- Use lowercase letters only
- Separate words with hyphens
- Include the main keyphrase naturally
- Keep it concise and readable
Return ONLY the page slug with no slashes, protocol, or domain.`);

    case "h1-keyword":
      return chatWithRetry(apiKey, copyableSystem,
        `Create a perfect H1 heading for the keyphrase "${keyword}".
Current H1: ${context}${advCtx}
Requirements:
- Must contain the exact keyphrase "${keyword}"
- Keep it engaging and readable
- Make it compelling${pageTypeStr}
Return ONLY the H1 heading text.`);

    case "keyword-intro":
      return chatWithRetry(apiKey, copyableSystem,
        `Rewrite this introduction to naturally include the keyphrase "${keyword}".
Current introduction: ${context}${advCtx}
Requirements:
- Maintain the original message and tone
- Naturally incorporate the keyphrase "${keyword}"
- 2-3 sentences maximum
- Make it engaging${pageTypeStr}
Return ONLY the rewritten introduction.`);

    case "keyword-density":
    case "word-count":
    case "heading-hierarchy":
    case "internal-links":
    case "outbound-links":
    case "next-gen-images":
    case "code-minification":
    case "schema-markup":
    case "image-file-size":
    case "og-image":
    case "og-tags":
    case "canonical":
    case "lang":
      return chatWithRetry(apiKey, advisorySystem,
        `Fix this SEO issue: "${checkId}" for keyphrase "${keyword}" if applicable.
Current status: ${context}${advCtx}
Provide concise but actionable advice in 2-3 sentences${pageTypeStr}.`);

    default:
      return chatWithRetry(apiKey, advisorySystem,
        `Provide SEO advice for: "${checkId}" regarding keyphrase "${keyword}".
Context: ${context}${advCtx}`);
  }
}

export async function generateH2Suggestion(
  apiKey: string,
  h2Text: string,
  keyword: string,
  advancedOptions?: AdvancedOptions,
): Promise<string> {
  const advCtx = buildAdvancedContext(advancedOptions);
  const langInst = buildLanguageInstruction(advancedOptions?.languageCode);
  const pageTypeStr = advancedOptions?.pageType
    ? ` for a ${advancedOptions.pageType.replace("-", " ")}`
    : "";

  return chatWithRetry(
    apiKey,
    `You are an SEO expert providing ready-to-use content.
Return ONLY the final H2 heading text with no explanation, quotes, or formatting.${langInst}`,
    `Create a perfect H2 heading for the keyphrase "${keyword}".
Current H2: "${h2Text}"${advCtx}
CRITICAL: The H2 heading must contain the exact word "${keyword}" literally in the text.
Requirements:
- Include the exact keyphrase "${keyword}" (not synonyms)
- Keep it engaging and readable (40-60 characters ideal)
- Make it compelling and relevant${pageTypeStr}
- Use title case capitalization
Return ONLY the H2 heading text.`,
  );
}

export async function generateAllH2Suggestions(
  apiKey: string,
  h2Texts: string[],
  keyword: string,
  advancedOptions?: AdvancedOptions,
): Promise<string[]> {
  const results = await Promise.all(
    h2Texts.map((text) => generateH2Suggestion(apiKey, text, keyword, advancedOptions)),
  );
  return results;
}

export async function generateAltText(
  apiKey: string,
  imageSrc: string,
  keyword: string,
  advancedOptions?: AdvancedOptions,
): Promise<string> {
  const advCtx = buildAdvancedContext(advancedOptions);
  const langInst = buildLanguageInstruction(advancedOptions?.languageCode);
  const filename = imageSrc.split("/").pop()?.split("?")[0] ?? "unknown";

  return chatWithRetry(
    apiKey,
    `You are an SEO and accessibility expert. Return ONLY the alt text string with no explanations, quotes, or formatting.${langInst}`,
    `Create a concise, descriptive alt tag for this image that naturally incorporates the keyphrase "${keyword}".
Image URL: ${imageSrc}
Image filename: ${filename}${advCtx}
Requirements:
- Under 125 characters
- Naturally incorporate the keyphrase "${keyword}"
- Describe what the image likely shows based on the filename and context
- Make it specific and descriptive
Return ONLY the alt text.`,
  );
}

// Legacy exports for backward compatibility in SubscoresPage
export async function generateTitle(
  apiKey: string,
  keyword: string,
  context: string,
  advancedOptions?: AdvancedOptions,
): Promise<string> {
  return generateRecommendation(apiKey, "title-keyword", keyword, context, advancedOptions);
}

export async function generateMetaDescription(
  apiKey: string,
  keyword: string,
  context: string,
  advancedOptions?: AdvancedOptions,
): Promise<string> {
  return generateRecommendation(apiKey, "meta-description-keyword", keyword, context, advancedOptions);
}
