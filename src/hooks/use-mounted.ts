"use client";
import { useSyncExternalStore } from "react";

/**
 * Returns true once the component has mounted on the client.
 * Uses useSyncExternalStore to satisfy the react-hooks/set-state-in-effect rule.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
