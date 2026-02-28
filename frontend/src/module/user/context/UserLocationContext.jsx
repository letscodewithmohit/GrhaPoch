import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react"
import { locationAPI, userAPI } from "@/lib/api"

const UserLocationContext = createContext(null)

export const useUserLocation = () => {
    const context = useContext(UserLocationContext)
    if (!context) {
        throw new Error("useUserLocation must be used within a UserLocationProvider")
    }
    return context
}

export const UserLocationProvider = ({ children }) => {
    const [location, setLocation] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [permissionGranted, setPermissionGranted] = useState(false)

    const watchIdRef = useRef(null)
    const updateTimerRef = useRef(null)
    const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
    const geocodeCacheRef = useRef(new Map())
    const geocodeDebounceRef = useRef(null)

    /* ===================== DB UPDATE ===================== */
    const updateLocationInDB = useCallback(async (locationData) => {
        try {
            const hasPlaceholder =
                locationData?.city === "Current Location" ||
                locationData?.address === "Select location" ||
                locationData?.formattedAddress === "Select location" ||
                (!locationData?.city && !locationData?.address && !locationData?.formattedAddress);

            if (hasPlaceholder) return;

            const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
            if (!userToken || userToken === 'null' || userToken === 'undefined') return

            const locationPayload = {
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                address: locationData.address || "",
                city: locationData.city || "",
                state: locationData.state || "",
                area: locationData.area || "",
                formattedAddress: locationData.formattedAddress || locationData.address || "",
            }

            if (locationData.accuracy) locationPayload.accuracy = locationData.accuracy
            if (locationData.postalCode) locationPayload.postalCode = locationData.postalCode
            if (locationData.street) locationPayload.street = locationData.street

            await userAPI.updateLocation(locationPayload)
            console.log("✅ Location updated in DB:", locationData.label || "Live")
        } catch (err) {
            // Silently handle
        }
    }, [])

    /* ===================== REVERSE GEOCODING UTILS ===================== */
    // Cache key: rounded to 4 decimals (~11m) to avoid duplicate API calls for nearby coords
    const getCacheKey = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
    const CACHE_MAX_SIZE = 50

    const reverseGeocodeDirect = async (latitude, longitude) => {
        try {
            const res = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            )
            const data = await res.json()
            return {
                city: data.city || data.locality || "Unknown City",
                state: data.principalSubdivision || "",
                country: data.countryName || "",
                area: data.subLocality || "",
                address: data.formattedAddress || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                formattedAddress: data.formattedAddress || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            }
        } catch {
            return {
                city: "Current Location",
                address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
                formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
            }
        }
    }

    const reverseGeocodeWithGoogle = useCallback(async (latitude, longitude) => {
        const cacheKey = getCacheKey(latitude, longitude)
        const cached = geocodeCacheRef.current.get(cacheKey)
        if (cached) return { ...cached, latitude, longitude }
        try {
            const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js')
            const apiKey = await getGoogleMapsApiKey()

            if (!apiKey) return reverseGeocodeDirect(latitude, longitude)

            const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=en&region=in`
            )
            const data = await response.json()

            if (data.status === "OK" && data.results.length > 0) {
                const result = data.results[0]
                const components = result.address_components

                const getComp = (type) => components.find(c => c.types.includes(type))?.long_name || ""

                const city = getComp("locality") || getComp("administrative_area_level_2")
                const state = getComp("administrative_area_level_1")
                const area = getComp("sublocality_level_1") || getComp("neighborhood") || getComp("sublocality")

                const addr = {
                    city: city || "Unknown City",
                    state: state || "",
                    area: area || "",
                    address: result.formatted_address.split(',')[0],
                    formattedAddress: result.formatted_address,
                    latitude,
                    longitude
                }
                if (geocodeCacheRef.current.size < CACHE_MAX_SIZE) {
                    geocodeCacheRef.current.set(cacheKey, addr)
                }
                return addr
            }
            const fallback = await reverseGeocodeDirect(latitude, longitude)
            if (geocodeCacheRef.current.size < CACHE_MAX_SIZE) {
                geocodeCacheRef.current.set(cacheKey, fallback)
            }
            return { ...fallback, latitude, longitude }
        } catch (err) {
            const fallback = await reverseGeocodeDirect(latitude, longitude)
            if (geocodeCacheRef.current.size < CACHE_MAX_SIZE) {
                geocodeCacheRef.current.set(cacheKey, fallback)
            }
            return { ...fallback, latitude, longitude }
        }
    }, [])

    /* ===================== CORE LOGIC ===================== */
    // Persistence and DB update logic moved to useEffect to ensure it only runs when location actually changes
    useEffect(() => {
        if (!location) return

        // Save to localStorage
        localStorage.setItem("userLocation", JSON.stringify(location))

        // Save to DB (debounced)
        const saveToDB = async () => {
            // Only save if it's not a placeholder
            const hasPlaceholder =
                location.city === "Current Location" ||
                location.address === "Select location" ||
                location.formattedAddress === "Select location";

            if (!hasPlaceholder) {
                await updateLocationInDB(location)
            }
        }

        clearTimeout(updateTimerRef.current)
        updateTimerRef.current = setTimeout(saveToDB, 3000)

        return () => clearTimeout(updateTimerRef.current)
    }, [location, updateLocationInDB])

    const updateLocationState = useCallback((newLoc, saveToDB = true) => {
        if (!newLoc) return

        // Update state
        setLocation(prev => {
            // Logic to prevent GPS from overwriting a pinned address (Home/Office)
            // But allow it if the new location IS a manual pick or search result
            const isNewLocManual = newLoc.label && newLoc.label !== "Current Location"
            const isPrevLocPinned = prev && prev.label && prev.label !== "Current Location"

            // If we are currently on a manual/pinned location, and a generic GPS update comes in, skip it
            if (isPrevLocPinned && !isNewLocManual && !newLoc.forceUpdate) {
                console.log("⏭️ Skipping GPS update because current location is pinned:", prev.label)
                return prev
            }

            // Otherwise, apply the new location
            return newLoc
        })

        setPermissionGranted(true)
        setLoading(false)
        setError(null)
    }, [])

    const startWatching = useCallback(() => {
        if (typeof window === "undefined" || !navigator.geolocation) return
        if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords

                // Threshold check to avoid jitter (~20m) - reduces redundant API calls
                if (prevLocationCoordsRef.current.latitude) {
                    const latDiff = latitude - prevLocationCoordsRef.current.latitude
                    const lngDiff = longitude - prevLocationCoordsRef.current.longitude
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320
                    if (dist < 20) return
                }

                // Debounce: avoid multiple reverse-geocode API calls when GPS updates rapidly
                clearTimeout(geocodeDebounceRef.current)
                geocodeDebounceRef.current = setTimeout(async () => {
                    try {
                        const addr = await reverseGeocodeWithGoogle(latitude, longitude)

                        // Update ref AFTER successful processing
                        prevLocationCoordsRef.current = { latitude, longitude }

                        updateLocationState({
                            ...addr,
                            latitude,
                            longitude,
                            accuracy: accuracy || null,
                            label: "Current Location"
                        }, true)
                    } catch (err) {
                        console.warn("Watcher geocode error:", err)
                    }
                }, 2000)
            },
            (err) => {
                console.warn("Location watch error:", err.message)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        )
    }, [reverseGeocodeWithGoogle, updateLocationState])

    const requestLocation = useCallback(async (forceFresh = true) => {
        setLoading(true)
        setError(null)

        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                setError("Geolocation not supported")
                setLoading(false)
                reject(new Error("Geolocation not supported"))
                return
            }

            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const { latitude, longitude, accuracy } = pos.coords
                    try {
                        const addr = await reverseGeocodeWithGoogle(latitude, longitude)
                        const finalLoc = {
                            ...addr,
                            latitude,
                            longitude,
                            accuracy,
                            label: "Current Location",
                            forceUpdate: true // Ensure it updates even if currently pinned
                        }
                        updateLocationState(finalLoc, true)
                        startWatching()
                        resolve(finalLoc)
                    } catch (err) {
                        setError("Geocoding failed")
                        setLoading(false)
                        reject(err)
                    }
                },
                (err) => {
                    setError(err.message)
                    setLoading(false)
                    reject(err)
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: forceFresh ? 0 : 60000 }
            )
        })
    }, [reverseGeocodeWithGoogle, updateLocationState, startWatching])

    const setManualLocation = useCallback((locationData) => {
        updateLocationState({
            ...locationData,
            forceUpdate: true // Manual selection should always override
        }, true)
    }, [updateLocationState])

    /* ===================== INITIALIZATION ===================== */
    useEffect(() => {
        const init = async () => {
            // 1. Check LocalStorage
            const stored = localStorage.getItem("userLocation")
            if (stored) {
                try {
                    const parsed = JSON.parse(stored)
                    if (parsed && parsed.latitude && parsed.longitude) {
                        console.log("📍 Restored location from local storage")
                        setLocation(parsed)
                        setLoading(false)
                        setPermissionGranted(true)
                        startWatching()
                        return
                    }
                } catch (e) {
                    console.warn("Failed to parse stored location")
                }
            }

            // 2. Fallback to GPS
            try {
                await requestLocation(false)
            } catch (err) {
                console.warn("Initial location detection failed:", err.message)
                setLoading(false)
            }
        }
        init()

        return () => {
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
            clearTimeout(updateTimerRef.current)
            clearTimeout(geocodeDebounceRef.current)
        }
    }, [requestLocation, startWatching])

    const value = {
        location,
        loading,
        error,
        permissionGranted,
        refreshLocation: () => requestLocation(true),
        requestLocation,
        setManualLocation,
    }

    return (
        <UserLocationContext.Provider value={value}>
            {children}
        </UserLocationContext.Provider>
    )
}
