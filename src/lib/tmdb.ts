import type { Movie } from "@/state/movie-selection";

const API_KEY = process.env.EXPO_PUBLIC_TMDB_API;
const BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

type TmdbSearchResult = {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
};

export function posterUri(path: string | null): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

export async function searchMovies(
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const q = query.trim();
  if (!q) return [];
  if (!API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_TMDB_API in .env");
  }

  const url =
    `${BASE}/search/movie?api_key=${API_KEY}` +
    `&include_adult=false&language=en-US&page=1&query=${encodeURIComponent(q)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`TMDB request failed (${res.status})`);
  }

  const json = (await res.json()) as { results?: TmdbSearchResult[] };
  return (json.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    posterPath: r.poster_path,
    year: r.release_date ? r.release_date.slice(0, 4) : null,
  }));
}
