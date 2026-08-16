"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { getPublicProductName } from "@/lib/product-name";
import type { CatalogSuggestion } from "@/lib/store";

type HeaderSearchProps = {
  autoFocus?: boolean;
};

const SEARCH_DEBOUNCE_MS = 280;
const SUGGESTION_CACHE_TTL_MS = 45_000;
const SUGGESTION_CACHE_LIMIT = 20;

type SuggestionCacheEntry = {
  createdAt: number;
  suggestions: CatalogSuggestion[];
};

function getSuggestionCacheKey(query: string) {
  return query.trim().toLowerCase();
}

function readCachedSuggestions(
  cache: Map<string, SuggestionCacheEntry>,
  key: string,
) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > SUGGESTION_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return entry.suggestions;
}

function rememberSuggestions(
  cache: Map<string, SuggestionCacheEntry>,
  key: string,
  suggestions: CatalogSuggestion[],
) {
  cache.set(key, { createdAt: Date.now(), suggestions });

  if (cache.size <= SUGGESTION_CACHE_LIMIT) {
    return;
  }

  const oldestKey = cache.keys().next().value;

  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

export function HeaderSearch({ autoFocus = false }: HeaderSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const requestIdRef = useRef(0);
  const suggestionsCacheRef = useRef(new Map<string, SuggestionCacheEntry>());

  const resetSearchState = useCallback(() => {
    requestIdRef.current += 1;
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
  }, []);

  const focusSearchInput = useCallback((shouldScroll = false) => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    if (shouldScroll) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    input.focus({ preventScroll: true });
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleFocusSearch = () => {
      focusSearchInput(true);
    };

    window.addEventListener("catalog:focus-search", handleFocusSearch);

    return () => {
      window.removeEventListener("catalog:focus-search", handleFocusSearch);
    };
  }, [focusSearchInput]);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;

    if (trimmed.length < 2) {
      return;
    }

    const cacheKey = getSuggestionCacheKey(trimmed);

    if (readCachedSuggestions(suggestionsCacheRef.current, cacheKey)) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/catalog-suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudieron cargar sugerencias.");
        }

        const data = (await response.json()) as { suggestions?: CatalogSuggestion[] };
        const nextSuggestions = data.suggestions ?? [];
        rememberSuggestions(suggestionsCacheRef.current, cacheKey, nextSuggestions);

        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setSuggestions(nextSuggestions);
        }
      } catch (error) {
        if (
          requestIdRef.current === requestId &&
          !controller.signal.aborted &&
          (error as Error).name !== "AbortError"
        ) {
          setSuggestions([]);
        }
      } finally {
        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  async function resolveSearchDestination(trimmedQuery: string) {
    const normalizedQuery = trimmedQuery.toLowerCase();
    const localMatch = suggestions.find((item) => {
      const code = item.code.trim().toLowerCase();
      const slug = item.slug.trim().toLowerCase();
      const name = item.name.trim().toLowerCase();

      return normalizedQuery === code || normalizedQuery === slug || normalizedQuery === name;
    });

    if (localMatch) {
      return `/producto/${localMatch.slug}`;
    }

    const response = await fetch(`/api/catalog-exact?q=${encodeURIComponent(trimmedQuery)}`);

    if (!response.ok) {
      return `/?q=${encodeURIComponent(trimmedQuery)}`;
    }

    const data = (await response.json()) as { href?: string | null };

    return data.href ?? `/?q=${encodeURIComponent(trimmedQuery)}`;
  }

  return (
    <form
      action="/"
      className="public-store-search-form"
      method="get"
      onSubmit={async (event) => {
        event.preventDefault();

        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
          return;
        }

        requestIdRef.current += 1;
        setLoading(true);

        try {
          const destination = await resolveSearchDestination(trimmedQuery);
          resetSearchState();
          router.push(destination);
        } finally {
          setLoading(false);
        }
      }}
      role="search"
    >
      <label
        className="public-store-search-field"
        onPointerDownCapture={() => focusSearchInput()}
        onTouchStartCapture={() => focusSearchInput()}
      >
        <input
          autoComplete="off"
          autoFocus={autoFocus}
          id="store-header-search-input"
          name="q"
          enterKeyHint="search"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextValue = event.target.value;
            requestIdRef.current += 1;
            setQuery(nextValue);

            if (nextValue.trim().length < 2) {
              setSuggestions([]);
              setLoading(false);
              return;
            }

            const cachedSuggestions = readCachedSuggestions(
              suggestionsCacheRef.current,
              getSuggestionCacheKey(nextValue),
            );

            if (cachedSuggestions) {
              setSuggestions(cachedSuggestions);
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          inputMode="search"
          aria-label="Buscar producto o código"
          placeholder="Busca de todo en Importaciones Super"
          ref={inputRef}
          type="search"
          value={query}
        />
        {loading ? <LoaderCircle className="search-field-spinner" size={16} /> : null}
        <button aria-label="Buscar" className="public-store-search-submit" type="submit">
          <Search size={16} />
        </button>

        {open && query.trim().length >= 2 ? (
          <div className="search-suggestions-panel public-store-suggestions-panel">
            {suggestions.length ? (
              suggestions.map((item) => (
                <Link
                  className="search-suggestion-item"
                  href={`/producto/${item.slug}`}
                  key={item.id}
                  onClick={resetSearchState}
                >
                  <div className="search-suggestion-main">
                    <strong>{getPublicProductName(item.name)}</strong>
                    <span>
                      {item.brand ?? item.category ?? "Catálogo"} · {item.code}
                    </span>
                  </div>
                  {item.category ? <small>{item.category}</small> : null}
                </Link>
              ))
            ) : (
              <div className="search-suggestion-empty">
                <strong>Sin coincidencias rápidas</strong>
                <span>Presiona buscar para revisar todo el catálogo.</span>
              </div>
            )}
          </div>
        ) : null}
      </label>
    </form>
  );
}
