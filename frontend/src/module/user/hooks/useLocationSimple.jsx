import { useUserLocation } from "../context/UserLocationContext"

/**
 * useLocationSimple - Consolidate logic to use UserLocationContext
 */
export function useLocationSimple() {
  const context = useUserLocation()

  return {
    location: context.location,
    loading: context.loading,
    error: context.error,
    permissionGranted: context.permissionGranted,
    requestLocation: context.requestLocation,
  }
}
