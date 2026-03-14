import { useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { runSEOChecks } from "@/lib/seo-analyzer";
import { calculateAnalysis } from "@/lib/scoring";
import { fetchAndAnalyzePage } from "@/lib/fetch-page";
import { detectLanguage } from "@/lib/languages";
import { generateRecommendation, generateAllH2Suggestions } from "@/lib/openai";
import {
  saveKeywordForUrl,
  getKeywordForUrl,
  saveAdvancedOptions,
  getAdvancedOptions,
} from "@/lib/storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Onboarding } from "@/components/Onboarding";
import { Toast } from "@/components/ui/Toast";
import { SetupPage } from "./pages/SetupPage";
import { LoadingPage } from "./pages/LoadingPage";
import { ScorePage } from "./pages/ScorePage";
import { SubscoresPage } from "./pages/SubscoresPage";
import type { PageSEOData, SEOCheck, SEOAnalysis } from "@/types/seo";

const isDevMode =
  typeof chrome === "undefined" || chrome.tabs === undefined;

/** Auto-generate AI recommendations for failing copyable checks and H2 suggestions. */
async function generateAIRecommendations(
  analysis: SEOAnalysis,
  apiKey: string,
  keyword: string,
  advancedOptions?: { pageType?: string; secondaryKeywords?: string; languageCode?: string },
): Promise<string | null> {
  const allChecks = analysis.categories.flatMap((c) => c.checks);
  const promises: Promise<void>[] = [];
  for (const check of allChecks) {
    if (check.status === "pass") continue;

    // Auto-generate H2 suggestions
    if (check.id === "h2-keyword" && check.h2Recommendations?.length) {
      promises.push(
        generateAllH2Suggestions(
          apiKey,
          check.h2Recommendations.map((h) => h.text),
          keyword,
          advancedOptions,
        ).then((suggestions) => {
          check.h2Recommendations!.forEach((h, i) => {
            h.suggestion = suggestions[i] ?? "";
          });
        }),
      );
      continue;
    }

    // Auto-generate text recommendations for copyable checks
    if (check.copyable) {
      const context = getCheckContext(check, analysis);
      promises.push(
        generateRecommendation(apiKey, check.id, keyword, context, advancedOptions)
          .then((rec) => { check.recommendation = rec; }),
      );
    }
  }

  if (promises.length === 0) return null;

  const settled = await Promise.allSettled(promises);
  const failures = settled.filter((r) => r.status === "rejected");

  if (failures.length === 0) return null;

  // Determine error type from the first failure
  const firstError = (failures[0] as PromiseRejectedResult).reason;
  const errorMsg = firstError?.message ?? String(firstError);

  if (errorMsg.includes("401") || errorMsg.includes("Incorrect API key") || errorMsg.includes("invalid_api_key")) {
    return "Invalid OpenAI API key — AI suggestions could not be generated.";
  }
  if (errorMsg.includes("429") || errorMsg.includes("rate_limit")) {
    return "OpenAI rate limit reached — some AI suggestions were skipped.";
  }
  if (errorMsg.includes("insufficient_quota") || errorMsg.includes("billing")) {
    return "OpenAI quota exceeded — check your billing at platform.openai.com.";
  }

  if (failures.length === settled.length) {
    return `AI suggestions failed: ${errorMsg}`;
  }

  return `${failures.length} of ${settled.length} AI suggestions failed to generate.`;
}

function getCheckContext(check: SEOCheck, analysis: SEOAnalysis): string {
  switch (check.id) {
    case "title-keyword": return analysis.pageData.title;
    case "meta-description-keyword": return analysis.pageData.metaDescription;
    case "keyword-url": return analysis.pageData.url;
    case "h1-keyword": return analysis.pageData.h1[0] ?? "";
    case "keyword-intro": return analysis.pageData.paragraphs[0] ?? "";
    default: return check.details ?? "";
  }
}

export default function App() {
  const { view, setView, setAnalysis, setError, settings, setSettings, loadApiKey, hideToast, toast } =
    useStore();

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  // Auto-detect URL and load saved keyword/settings
  useEffect(() => {
    async function loadSavedSettings() {
      if (!isDevMode) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.url) {
            const host = new URL(tab.url).hostname;
            const savedKeyword = await getKeywordForUrl(tab.url);
            const savedOptions = await getAdvancedOptions(host);
            if (savedKeyword) setSettings({ keyword: savedKeyword });
            if (savedOptions) {
              setSettings({
                pageType: savedOptions.pageType,
                secondaryKeywords: savedOptions.secondaryKeywords,
                language: savedOptions.language,
                advancedMode: true,
              });
            }
          }
        } catch {
          // Not in extension context
        }
      } else {
        // Dev mode: load saved keyword if URL is already set
        const { settings } = useStore.getState();
        if (settings.targetUrl.trim()) {
          try {
            const savedKeyword = await getKeywordForUrl(settings.targetUrl);
            if (savedKeyword) setSettings({ keyword: savedKeyword });
            const host = new URL(settings.targetUrl).hostname;
            const savedOptions = await getAdvancedOptions(host);
            if (savedOptions) {
              setSettings({
                pageType: savedOptions.pageType,
                secondaryKeywords: savedOptions.secondaryKeywords,
                language: savedOptions.language,
                advancedMode: true,
              });
            }
          } catch {
            // Invalid URL
          }
        }
      }
    }
    loadSavedSettings();
  }, [setSettings]);

  const handleAnalyze = useCallback(async () => {
    setView("loading");
    setError(null);

    try {
      let pageData: PageSEOData;

      if (!isDevMode) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab found");

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const getMetaContent = (name: string): string => {
              const el =
                document.querySelector<HTMLMetaElement>(
                  `meta[name="${name}"]`,
                ) ||
                document.querySelector<HTMLMetaElement>(
                  `meta[property="${name}"]`,
                );
              return el?.content ?? "";
            };

            const getHeadings = (tag: string): string[] =>
              Array.from(document.querySelectorAll(tag)).map(
                (el) => el.textContent?.trim() ?? "",
              );

            const images = Array.from(
              document.querySelectorAll<HTMLImageElement>("img"),
            ).map((img) => ({
              src: img.src,
              alt: img.alt ?? "",
              width: img.naturalWidth || null,
              height: img.naturalHeight || null,
            }));

            const links = Array.from(
              document.querySelectorAll<HTMLAnchorElement>("a[href]"),
            );
            const currentHost = window.location.hostname;
            let internalLinks = 0;
            let externalLinks = 0;
            for (const link of links) {
              try {
                const url = new URL(link.href);
                if (url.hostname === currentHost) internalLinks++;
                else externalLinks++;
              } catch {
                internalLinks++;
              }
            }

            const bodyText = document.body?.innerText ?? "";
            const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

            const ogTags: Record<string, string> = {};
            document
              .querySelectorAll<HTMLMetaElement>('meta[property^="og:"]')
              .forEach((el) => {
                ogTags[el.getAttribute("property")!] = el.content;
              });

            const twitterTags: Record<string, string> = {};
            document
              .querySelectorAll<HTMLMetaElement>('meta[name^="twitter:"]')
              .forEach((el) => {
                twitterTags[el.getAttribute("name")!] = el.content;
              });

            const paragraphs = Array.from(document.querySelectorAll("p"))
              .map((el) => el.textContent?.trim() ?? "")
              .filter(Boolean);

            const jsResources = Array.from(
              document.querySelectorAll<HTMLScriptElement>("script[src]"),
            ).map((el) => el.src).filter(Boolean);
            const cssResources = Array.from(
              document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
            ).map((el) => el.href).filter(Boolean);

            const schemaScripts = Array.from(
              document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
            );
            const schemaTypes: string[] = [];
            for (const script of schemaScripts) {
              try {
                const data = JSON.parse(script.textContent ?? "");
                if (data["@type"]) schemaTypes.push(data["@type"]);
              } catch {
                // skip
              }
            }

            return {
              url: window.location.href,
              title: document.title ?? "",
              metaDescription: getMetaContent("description"),
              metaKeywords: getMetaContent("keywords"),
              canonical:
                document.querySelector<HTMLLinkElement>(
                  'link[rel="canonical"]',
                )?.href ?? "",
              h1: getHeadings("h1"),
              h2: getHeadings("h2"),
              h3: getHeadings("h3"),
              h4: getHeadings("h4"),
              h5: getHeadings("h5"),
              h6: getHeadings("h6"),
              images,
              ogTags,
              twitterTags,
              wordCount,
              internalLinks,
              externalLinks,
              lang: document.documentElement.lang ?? "",
              paragraphs,
              resources: { js: jsResources, css: cssResources },
              schemaMarkup: { types: schemaTypes, count: schemaScripts.length },
              ogImage: getMetaContent("og:image"),
              imageFileSizes: [],
            };
          },
        });

        pageData = results[0].result as PageSEOData;
      } else {
        if (!settings.targetUrl.trim()) {
          throw new Error("Please enter a URL to analyze");
        }
        pageData = await fetchAndAnalyzePage(settings.targetUrl);
      }

      // Auto-detect language on first visit
      if (!settings.advancedMode && pageData.lang) {
        const detected = detectLanguage(pageData.lang);
        if (detected !== "en") {
          setSettings({ language: detected });
        }
      }

      const checks = runSEOChecks(pageData, {
        keyword: settings.keyword,
        secondaryKeywords: settings.secondaryKeywords,
        pageType: settings.pageType,
      });
      const analysis = calculateAnalysis(checks, pageData, settings.keyword);

      setAnalysis(analysis);

      // Auto-generate AI recommendations in background (non-blocking)
      const { apiKey: rawKey } = useStore.getState();
      const apiKey = rawKey?.trim();
      if (apiKey) {
        const advancedOptions = settings.advancedMode
          ? {
              pageType: settings.pageType,
              secondaryKeywords: settings.secondaryKeywords,
              languageCode: settings.language,
            }
          : undefined;

        generateAIRecommendations(
          analysis,
          apiKey,
          settings.keyword,
          advancedOptions,
        ).then((aiError) => {
          const store = useStore.getState();
          // Re-set analysis to trigger re-render with populated recommendations
          store.setAnalysis({ ...analysis });
          if (aiError) store.showToast(aiError);
        }).catch((err) => {
          useStore.getState().showToast(`AI error: ${err?.message ?? err}`);
        });
      }

      // Save keyword and settings for this URL
      try {
        await saveKeywordForUrl(pageData.url, settings.keyword);
        if (settings.advancedMode) {
          const host = new URL(pageData.url).hostname;
          await saveAdvancedOptions(host, {
            pageType: settings.pageType,
            secondaryKeywords: settings.secondaryKeywords,
            language: settings.language,
          });
        }
      } catch {
        // Storage save failure is non-critical
      }

      // Highlight issues on page (extension only)
      if (!isDevMode) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: "HIGHLIGHT_ISSUES" });
        }
      }

      setView("score");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Analysis failed",
      );
      setView("setup");
    }
  }, [settings, setView, setAnalysis, setError, setSettings]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg-900">
        <Onboarding />
        {view === "setup" && <SetupPage onAnalyze={handleAnalyze} />}
        {view === "loading" && <LoadingPage />}
        {view === "score" && <ScorePage />}
        {view === "subscores" && <SubscoresPage />}
        <Toast message={toast.message} visible={toast.visible} onClose={hideToast} />
      </div>
    </ErrorBoundary>
  );
}
