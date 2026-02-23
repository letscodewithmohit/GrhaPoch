import { useUserLocation } from "../context/UserLocationContext"

/**
 * useLocation - Simplified hook that consumes UserLocationContext
 * This ensures that location state is shared across all components
 * and changes are dynamic.
 */
export function useLocation() {
  const context = useUserLocation()

  return {
    location: context.location,
    loading: context.loading,
    error: context.error,
    permissionGranted: context.permissionGranted,
    requestLocation: context.requestLocation,
    setManualLocation: context.setManualLocation,
    // Add compatibility wrappers if needed for legacy code
    startWatchingLocation: () => { /* Logic is in context */ },
    stopWatchingLocation: () => { /* Logic in context */ }
  }
}
