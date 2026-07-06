import { useSyncExternalStore } from "react";

export type Movie = {
  id: number;
  title: string;
  posterPath: string | null;
  year: string | null;
};

let selection: Movie[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return selection;
}

export function isSelected(id: number) {
  return selection.some((m) => m.id === id);
}

export function toggleMovie(movie: Movie) {
  selection = isSelected(movie.id)
    ? selection.filter((m) => m.id !== movie.id)
    : [...selection, movie];
  emit();
}

export function removeMovie(id: number) {
  selection = selection.filter((m) => m.id !== id);
  emit();
}

export function clearSelection() {
  if (selection.length === 0) return;
  selection = [];
  emit();
}

export function setSelection(movies: Movie[]) {
  selection = [...movies];
  emit();
}

export function useMovieSelection() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
