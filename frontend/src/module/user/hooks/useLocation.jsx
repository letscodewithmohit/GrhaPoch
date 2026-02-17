import { useState, useEffect, useRef } from "react"
import { locationAPI, userAPI } from "@/lib/api"

export function useLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      // Check if location has placeholder values - don't save placeholders
      const hasPlaceholder =
        locationData?.city === "Current Location" ||
        locationData?.address === "Select location" ||
        locationData?.formattedAddress === "Select location" ||
        (!locationData?.city && !locationData?.address && !locationData?.formattedAddress);

      if (hasPlaceholder) {
        return;
      }

      // Check if user is authenticated before trying to update DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB update, just use localStorage
        return
      }

      // Prepare complete location data for database storage
      const locationPayload = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || "",
        city: locationData.city || "",
        state: locationData.state || "",
        area: locationData.area || "",
        formattedAddress: locationData.formattedAddress || locationData.address || "",
      }

      // Add optional fields if available
      if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
        locationPayload.accuracy = locationData.accuracy
      }
      if (locationData.postalCode) {
        locationPayload.postalCode = locationData.postalCode
      }
      if (locationData.street) {
        locationPayload.street = locationData.street
      }
      if (locationData.streetNumber) {
        locationPayload.streetNumber = locationData.streetNumber
      }

      await userAPI.updateLocation(locationPayload)
    } catch (err) {
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        // Log critical errors if needed, but for now removing for clean console
      }
    }
  }

  /* ===================== DIRECT REVERSE GEOCODE ===================== */
  const reverseGeocodeDirect = async (latitude, longitude) => {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000)

      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        { signal: controller.signal }
      )

      const data = await res.json()

      return {
        city: data.city || data.locality || "Unknown City",
        state: data.principalSubdivision || "",
        country: data.countryName || "",
        area: data.subLocality || "",
        address:
          data.formattedAddress ||
          `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        formattedAddress:
          data.formattedAddress ||
          `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      }
    } catch {
      return {
        city: "Current Location",
        address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      }
    }
  }

  /* ===================== GOOGLE MAPS REVERSE GEOCODE ===================== */
  const reverseGeocodeWithGoogleMaps = async (latitude, longitude) => {
    try {
      const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
      const GOOGLE_MAPS_API_KEY = await getGoogleMapsApiKey();

      if (!GOOGLE_MAPS_API_KEY) {
        return reverseGeocodeDirect(latitude, longitude);
      }

      const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

      if (!isInIndiaRange || longitude < 0) {
        throw new Error("Coordinates outside India range")
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 20000);

      let data;
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&language=en&region=in&result_type=premise|street_address|establishment|point_of_interest|route|sublocality`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        data = await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }

      if (!data) {
        throw new Error("Google Maps API returned null response");
      }

      if (data.status === "REQUEST_DENIED") {
        throw new Error(`Google Maps API REQUEST_DENIED: ${data.error_message || "Check API key and billing"}`);
      }

      if (data.status === "OVER_QUERY_LIMIT") {
        throw new Error("Google Maps API quota exceeded. Check billing.");
      }

      if (data.status === "ZERO_RESULTS") {
        throw new Error("No address found for these coordinates");
      }

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        throw new Error(`Invalid response from Google Maps API: ${data.status} - ${data.error_message || "No results"}`);
      }

      let exactResult = null;
      let bestResultIndex = 0;

      const indiaResults = data.results.filter(r => {
        const addressComponents = r.address_components || []
        return addressComponents.some(ac =>
          ac.types.includes('country') &&
          (ac.short_name === 'IN' || ac.long_name === 'India')
        )
      })

      if (indiaResults.length === 0) {
        const firstResult = data.results[0]
        const addressComponents = firstResult.address_components || []
        const countryComponent = addressComponents.find(ac => ac.types.includes('country'))

        if (countryComponent && countryComponent.short_name !== 'IN' && countryComponent.long_name !== 'India') {
          throw new Error("Address outside India")
        }
        exactResult = data.results[0]
      } else {
        for (let i = 0; i < Math.min(5, indiaResults.length); i++) {
          const result = indiaResults[i];
          const types = result.types || []
          const hasPremise = types.includes("premise") || result.address_components?.some(c => c.types.includes("premise"))
          const hasEstablishment = types.includes("establishment") || result.address_components?.some(c => c.types.includes("establishment"))
          const hasStreetAddress = types.includes("street_address") || result.address_components?.some(c => c.types.includes("street_address"))
          const hasPOI = types.includes("point_of_interest") || result.address_components?.some(c => c.types.includes("point_of_interest"))

          if (hasPremise || hasEstablishment || hasStreetAddress || hasPOI) {
            exactResult = result;
            bestResultIndex = i;
            break;
          }
        }

        if (!exactResult) {
          exactResult = indiaResults[0];
        }
      }

      const addressComponents = exactResult.address_components || [];
      const formattedAddress = exactResult.formatted_address || "";

      const foreignPattern = /\b(USA|United States|Los Angeles|California|CA \d{5}|New York|NY|UK|United Kingdom|London|Canada|Australia|Singapore|Dubai)\b/i
      if (foreignPattern.test(formattedAddress)) {
        throw new Error("Foreign address detected")
      }

      const addressPartsCount = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0).length;

      let city = "";
      let state = "";
      let area = "";
      let street = "";
      let streetNumber = "";
      let premise = "";
      let pointOfInterest = "";
      let sublocalityLevel1 = "";
      let sublocalityLevel2 = "";
      let postalCode = "";
      let floor = "";

      for (const component of addressComponents) {
        const types = component.types || [];
        const longName = component.long_name || "";
        const shortName = component.short_name || "";

        if (types.includes("postal_code") && !postalCode) {
          postalCode = longName;
        }
      }

      /* ===================== GOOGLE PLACES API - GET DETAILED PLACE INFORMATION ===================== */
      let placeDetails = null;
      let placeId = null;
      let placeName = "";
      let placePhone = "";
      let placeWebsite = "";
      let placeRating = null;
      let placeOpeningHours = null;
      let placePhotos = [];

      try {
        const { getGoogleMapsApiKey } = await import('@/lib/utils/googleMapsApiKey.js');
        const apiKey = await getGoogleMapsApiKey();

        if (!apiKey) {
          return null;
        }

        const nearbySearchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=50&key=${apiKey}&language=en`;

        const nearbyController = new AbortController();
        const nearbyTimeoutId = setTimeout(() => nearbyController.abort(), 15000);

        let nearbyResponse;
        try {
          const nearbyRes = await fetch(nearbySearchUrl, { signal: nearbyController.signal });
          clearTimeout(nearbyTimeoutId);
          if (!nearbyRes.ok) {
            throw new Error(`HTTP error! status: ${nearbyRes.status}`);
          }
          nearbyResponse = await nearbyRes.json();
        } catch (error) {
          clearTimeout(nearbyTimeoutId);
          throw error;
        }

        if (nearbyResponse.status === "OK" && nearbyResponse.results && nearbyResponse.results.length > 0) {
          // Find the closest place (first result is usually the closest)
          const closestPlace = nearbyResponse.results[0];
          placeId = closestPlace.place_id;
          placeName = closestPlace.name || "";
        }

        // Step 2: Get detailed place information using Place Details API
        if (placeId) {
          const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,opening_hours,photos,address_components,geometry,types&key=${apiKey}&language=en`;

          // Add timeout for Place Details
          const detailsController = new AbortController();
          const detailsTimeoutId = setTimeout(() => detailsController.abort(), 15000); // 15 seconds

          let detailsResponse;
          try {
            const detailsRes = await fetch(placeDetailsUrl, { signal: detailsController.signal });
            clearTimeout(detailsTimeoutId);
            if (!detailsRes.ok) {
              throw new Error(`HTTP error! status: ${detailsRes.status}`);
            }
            detailsResponse = await detailsRes.json();
          } catch (error) {
            clearTimeout(detailsTimeoutId);
            if (error.name === 'AbortError') {
              throw new Error("Google Places Details timeout");
            }
            throw error;
          }

          if (detailsResponse.status === "OK" && detailsResponse.result) {
            placeDetails = detailsResponse.result;
            placeName = placeDetails.name || placeName;
            placePhone = placeDetails.formatted_phone_number || "";
            placeWebsite = placeDetails.website || "";
            placeRating = placeDetails.rating || null;
            placeOpeningHours = placeDetails.opening_hours || null;

            // Get photo references (first 3 photos)
            if (placeDetails.photos && placeDetails.photos.length > 0) {
              placePhotos = placeDetails.photos.slice(0, 3).map(photo => ({
                reference: photo.photo_reference,
                width: photo.width,
                height: photo.height,
                url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${apiKey}`
              }));
            }
          }

          // If Places API has better address components, use them
          if (placeDetails?.address_components && placeDetails.address_components.length > addressComponents.length) {
            // Merge Places API address components with geocoding results
            const placesComponents = placeDetails.address_components;
            // Update missing components from Places API
            for (const comp of placesComponents) {
              const types = comp.types || [];
              if (types.includes("point_of_interest") && !pointOfInterest) {
                pointOfInterest = comp.long_name;
              }
              if (types.includes("premise") && !premise) {
                premise = comp.long_name;
              }
            }
          }
        }
      } catch (placesError) {
        // Continue with geocoding results even if Places API fails
      }

      // ZOMATO-STYLE: Extract exact building/cafe name (Mama Loca Cafe, Princess Center)
      // Priority: Places API name > point_of_interest > premise > sublocality_level_1
      let mainTitle = "";

      // First priority: Use name from Places API (most accurate)
      if (placeName && placeName.trim() !== "") {
        mainTitle = placeName;
        console.log("✅✅✅ ZOMATO-STYLE: Using Places API name:", mainTitle);
      } else {
        const building = addressComponents.find(c =>
          c.types.includes("point_of_interest") ||
          c.types.includes("premise") ||
          c.types.includes("sublocality_level_1")
        );

        if (building) {
          mainTitle = building.long_name;
        } else {
          mainTitle = "Location Found";
        }
      }

      let mainLocation = mainTitle;

      if (mainLocation && mainLocation !== "Location Found") {
        area = mainLocation;
      } else if (pointOfInterest) {
        area = pointOfInterest;
        mainLocation = pointOfInterest;
      } else if (premise) {
        area = premise;
        mainLocation = premise;
      } else if (sublocalityLevel1) {
        area = sublocalityLevel1;
        mainLocation = sublocalityLevel1;
      } else {
        area = city || "Location Found";
        mainLocation = city || "Location Found";
      }

      let completeAddressParts = [];

      if (pointOfInterest && pointOfInterest.trim() !== "") {
        completeAddressParts.push(pointOfInterest);
      }

      if (streetNumber && premise) {
        completeAddressParts.push(`${streetNumber} ${premise}`);
      } else if (premise && premise.trim() !== "") {
        completeAddressParts.push(premise);
      } else if (streetNumber && streetNumber.trim() !== "") {
        completeAddressParts.push(streetNumber);
      }

      if (floor && floor.trim() !== "") {
        completeAddressParts.push(floor);
      }

      if (sublocalityLevel1 && sublocalityLevel1.trim() !== "") {
        completeAddressParts.push(sublocalityLevel1);
      }

      if (city && city.trim() !== "") {
        completeAddressParts.push(city);
      }

      if (state && state.trim() !== "") {
        if (postalCode && postalCode.trim() !== "") {
          completeAddressParts.push(`${state} ${postalCode}`);
        } else {
          completeAddressParts.push(state);
        }
      } else if (postalCode && postalCode.trim() !== "") {
        completeAddressParts.push(postalCode);
      }

      const formattedParts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
      const hasCompleteFormattedAddress = formattedParts.length >= 4;

      let completeFormattedAddress = formattedAddress;

      if (hasCompleteFormattedAddress) {
        completeFormattedAddress = formattedAddress;
      } else if (completeAddressParts.length > 0 && (pointOfInterest || premise)) {
        completeFormattedAddress = completeAddressParts.join(', ');
      } else {
        completeFormattedAddress = formattedAddress;
      }

      let displayAddressParts = [];

      if (mainLocation && mainLocation.trim() !== "" && mainLocation !== "Location Found") {
        displayAddressParts.push(mainLocation);
      } else if (pointOfInterest && pointOfInterest.trim() !== "") {
        displayAddressParts.push(pointOfInterest);
      } else if (premise && premise.trim() !== "") {
        displayAddressParts.push(premise);
      }

      if (premise && premise.trim() !== "" && premise !== mainLocation && premise !== pointOfInterest) {
        if (streetNumber && streetNumber.trim() !== "") {
          displayAddressParts.push(`${streetNumber} ${premise}`);
        } else {
          displayAddressParts.push(premise);
        }
      } else if (streetNumber && streetNumber.trim() !== "" && !mainLocation) {
        displayAddressParts.push(streetNumber);
      }

      if (floor && floor.trim() !== "") {
        displayAddressParts.push(floor);
      }

      if (sublocalityLevel1 && sublocalityLevel1.trim() !== "" && sublocalityLevel1 !== mainLocation) {
        displayAddressParts.push(sublocalityLevel1);
      }

      if (displayAddressParts.length === 0 && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);

        const filteredParts = parts.filter(part => {
          if (/^\d{6}$/.test(part)) return false;
          if (/\s+\d{6}$/.test(part)) {
            return part.replace(/\s+\d{6}$/, '').trim();
          }
          if (part.toLowerCase() === "india" || part.length > 25) return false;
          if (city && part.toLowerCase() === city.toLowerCase()) return false;
          if (state && part.toLowerCase().includes(state.toLowerCase())) return false;
          return true;
        });

        let cityIndex = -1;
        if (city) {
          cityIndex = filteredParts.findIndex(part => part.toLowerCase() === city.toLowerCase());
        }
        if (cityIndex === -1) {
          const commonCities = ["Indore", "indore", "Bhopal", "bhopal", "Mumbai", "mumbai", "Delhi", "delhi"];
          cityIndex = filteredParts.findIndex(part =>
            commonCities.some(c => part.toLowerCase() === c.toLowerCase())
          );
        }

        if (cityIndex > 0) {
          displayAddressParts = filteredParts.slice(0, cityIndex);
        } else if (filteredParts.length >= 4) {
          displayAddressParts = filteredParts.slice(0, 4);
        } else if (filteredParts.length >= 3) {
          displayAddressParts = filteredParts.slice(0, 3);
        } else if (filteredParts.length >= 2) {
          displayAddressParts = filteredParts.slice(0, 2);
        } else if (filteredParts.length >= 1) {
          displayAddressParts = [filteredParts[0]];
        }
      }

      const displayAddress = displayAddressParts.length > 0
        ? displayAddressParts.join(', ')
        : (mainLocation || area || city || "Select location");

      if (!area) {
        if (sublocalityLevel1) {
          area = sublocalityLevel1;
        } else if (premise) {
          area = premise;
        } else if (pointOfInterest) {
          area = pointOfInterest;
        } else if (city) {
          area = city;
        } else {
          area = "Location Found";
        }
      }

      const locationResult = {
        city: city || "Unknown City",
        state: state || "",
        area: area || city || "Location Found",
        address: displayAddress,
        formattedAddress: completeFormattedAddress,
        street: street || "",
        streetNumber: streetNumber || "",
        postalCode: postalCode || "",
        mainTitle: mainTitle !== "Location Found" ? mainTitle : null,
        pointOfInterest: pointOfInterest || null,
        premise: premise || null,
        placeId: placeId || null,
        placeName: placeName || null,
        phone: placePhone || null,
        website: placeWebsite || null,
        rating: placeRating || null,
        openingHours: placeOpeningHours ? {
          openNow: placeOpeningHours.open_now,
          weekdayText: placeOpeningHours.weekday_text || []
        } : null,
        photos: placePhotos.length > 0 ? placePhotos : null,
        hasPlaceDetails: !!placeDetails,
        placeTypes: placeDetails?.types || []
      };

      return locationResult;
    } catch (error) {
      if (error.message.includes("REQUEST_DENIED") || error.message.includes("OVER_QUERY_LIMIT")) {
        return {
          city: "API Error",
          state: "",
          area: "",
          address: "Google Maps API configuration issue",
          formattedAddress: "Please check API key and billing",
          street: "",
          streetNumber: "",
          postalCode: "",
          mainTitle: null,
          pointOfInterest: null,
          premise: null,
          placeId: null,
          placeName: null,
          phone: null,
          website: null,
          rating: null,
          openingHours: null,
          photos: null,
          hasPlaceDetails: false,
          placeTypes: []
        };
      }

      return reverseGeocodeDirect(latitude, longitude);
    }
  };

  /* ===================== OLA MAPS REVERSE GEOCODE (DEPRECATED - KEPT FOR FALLBACK) ===================== */
  const reverseGeocodeWithOLAMaps = async (latitude, longitude) => {
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OLA Maps API timeout")), 10000)
      )

      const apiPromise = locationAPI.reverseGeocode(latitude, longitude)
      const res = await Promise.race([apiPromise, timeoutPromise])

      if (!res || !res.data) {
        throw new Error("Invalid response from OLA Maps API")
      }

      if (res.data.success === false) {
        throw new Error(res.data.message || "OLA Maps API returned error")
      }

      const backendData = res?.data?.data || {}

      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
      } else if (backendData.result && Array.isArray(backendData.result) && backendData.result.length > 0) {
        result = backendData.result[0];
      } else if (backendData.results && !Array.isArray(backendData.results)) {
        result = backendData.results;
      } else {
        result = backendData;
      }

      if (!result) {
        result = {};
      }

      let addressComponents = {};
      if (result.address_components) {
        if (Array.isArray(result.address_components)) {
          result.address_components.forEach(comp => {
            const types = comp.types || [];
            if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('neighborhood') && !addressComponents.area) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('locality')) {
              addressComponents.city = comp.long_name || comp.short_name;
            } else if (types.includes('administrative_area_level_1')) {
              addressComponents.state = comp.long_name || comp.short_name;
            } else if (types.includes('country')) {
              addressComponents.country = comp.long_name || comp.short_name;
            }
          });
        } else {
          addressComponents = result.address_components;
        }
      } else if (result.components) {
        addressComponents = result.components;
      }

      let city = addressComponents?.city ||
        result?.city ||
        result?.locality ||
        result?.address_components?.city ||
        ""

      let state = addressComponents?.state ||
        result?.state ||
        result?.administrative_area_level_1 ||
        result?.address_components?.state ||
        ""

      let country = addressComponents?.country ||
        result?.country ||
        result?.country_name ||
        result?.address_components?.country ||
        ""

      let formattedAddress = result?.formatted_address ||
        result?.formattedAddress ||
        result?.address ||
        ""

      let area = ""
      if (formattedAddress) {
        const addressParts = formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

        if (addressParts.length >= 3) {
          const firstPart = addressParts[0]
          const secondPart = addressParts[1]
          const thirdPart = addressParts[2]

          if (firstPart && firstPart.length > 2 && firstPart.length < 50) {
            const firstLower = firstPart.toLowerCase()
            const cityLower = (city || secondPart || "").toLowerCase()
            const stateLower = (state || thirdPart || "").toLowerCase()

            if (firstLower !== cityLower &&
              firstLower !== stateLower &&
              !firstPart.match(/^\d+/) &&
              !firstPart.match(/^\d+\s*(km|m|meters?)$/i) &&
              !firstLower.includes("district") &&
              !firstLower.includes("city")) {
              area = firstPart

              if (secondPart && (!city || secondPart.toLowerCase() !== city.toLowerCase())) {
                city = secondPart
              }
              if (thirdPart && (!state || thirdPart.toLowerCase() !== state.toLowerCase())) {
                state = thirdPart
              }
            }
          }
        } else if (addressParts.length === 2 && !area) {
          const firstPart = addressParts[0]
          const secondPart = addressParts[1]
          const isFirstCity = city && firstPart.toLowerCase() === city.toLowerCase()

          if (!isFirstCity &&
            firstPart.length > 2 &&
            firstPart.length < 50 &&
            !firstPart.toLowerCase().includes("district") &&
            !firstPart.toLowerCase().includes("city") &&
            !firstPart.match(/^\d+/)) {
            area = firstPart
            if (secondPart && !city) {
              city = secondPart
            }
          } else if (isFirstCity) {
            if (secondPart && !state) {
              state = secondPart
            }
          }
        }
      }

      if (!area && addressComponents) {
        const possibleAreaFields = [
          addressComponents.sublocality,
          addressComponents.sublocality_level_1,
          addressComponents.neighborhood,
          addressComponents.sublocality_level_2,
          addressComponents.locality,
          addressComponents.area,
        ].filter(field => {
          if (!field) return false
          const fieldLower = field.toLowerCase()
          return fieldLower !== state.toLowerCase() &&
            fieldLower !== city.toLowerCase() &&
            !fieldLower.includes("district") &&
            !fieldLower.includes("city") &&
            field.length > 3
        })

        if (possibleAreaFields.length > 0) {
          const fallbackArea = possibleAreaFields[0]
          if (!(formattedAddress && formattedAddress.toLowerCase().includes(fallbackArea.toLowerCase()))) {
            area = fallbackArea
          }
        }
      }

      if (!area && result?.address_components && Array.isArray(result.address_components)) {
        const components = result.address_components
        const sublocality = components.find(comp =>
          comp.types?.includes('sublocality') ||
          comp.types?.includes('sublocality_level_1') ||
          comp.types?.includes('neighborhood')
        )
        if (sublocality?.long_name || sublocality?.short_name) {
          area = sublocality.long_name || sublocality.short_name
        }
      }

      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        if (parts.length >= 2) {
          const potentialArea = parts[0]
          const potentialAreaLower = potentialArea.toLowerCase()
          const cityLower = (city || "").toLowerCase()
          const stateLower = (state || "").toLowerCase()

          if (potentialArea &&
            potentialArea.length > 2 &&
            potentialArea.length < 50 &&
            !potentialArea.match(/^\d+/) &&
            potentialAreaLower !== cityLower &&
            potentialAreaLower !== stateLower &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
          }
        }
      }

      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        if (parts.length >= 3) {
          const potentialArea = parts[0]
          const potentialAreaLower = potentialArea.toLowerCase()
          if (potentialAreaLower !== state.toLowerCase() &&
            potentialAreaLower !== city.toLowerCase() &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            if (!city && parts[1]) city = parts[1]
            if (!state && parts[2]) state = parts[2]
          }
        } else if (parts.length === 2) {
          if (result.locality && result.locality !== city) {
            area = result.locality
          } else if (result.neighborhood) {
            area = result.neighborhood
          } else {
            area = ""
          }
        }
      }

      if (area && state && area.toLowerCase() === state.toLowerCase()) {
        area = ""
      }

      if (area && area.toLowerCase().includes("district")) {
        area = ""
      }

      if (formattedAddress || city) {
        const finalLocation = {
          city: city || "Unknown City",
          state: state || "",
          country: country || "",
          area: area || "",
          address: formattedAddress || `${city || "Current Location"}`,
          formattedAddress: formattedAddress || `${city || "Current Location"}`,
        }

        return finalLocation
      }

      throw new Error("No valid address data from OLA Maps")
    } catch (err) {
      try {
        return await reverseGeocodeWithGoogleMaps(latitude, longitude)
      } catch (fallbackErr) {
        return {
          city: "Current Location",
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }
      }
    }
  }

  /* ===================== DB FETCH ===================== */
  const fetchLocationFromDB = async () => {
    try {
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        return null
      }

      const res = await userAPI.getLocation()
      const loc = res?.data?.data?.location
      if (loc?.latitude && loc?.longitude) {
        const isInIndiaRange = loc.latitude >= 6.5 && loc.latitude <= 37.1 && loc.longitude >= 68.7 && loc.longitude <= 97.4 && loc.longitude > 0

        if (!isInIndiaRange || loc.longitude < 0) {
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            state: "",
            country: "",
            area: "",
            address: "Select location",
            formattedAddress: "Select location",
          }
        }

        try {
          const addr = await reverseGeocodeWithGoogleMaps(
            loc.latitude,
            loc.longitude
          )
          return { ...addr, latitude: loc.latitude, longitude: loc.longitude }
        } catch (geocodeErr) {
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            area: "",
            state: "",
            address: "Select location",
            formattedAddress: "Select location",
          }
        }
      }
    } catch (err) {
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        // Silently fail for known non-critical errors
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false) => {
    let dbLocation = !forceFresh ? await fetchLocationFromDB() : null
    if (dbLocation && !forceFresh) {
      setLocation(dbLocation)
      if (showLoading) setLoading(false)
      return dbLocation
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported")
      if (showLoading) setLoading(false)
      return dbLocation
    }

    const getPositionWithRetry = (options, retryCount = 0) => {
      return new Promise((resolve, reject) => {
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000),
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude, accuracy } = pos.coords
              const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0

              let addr
              if (!isInIndiaRange || longitude < 0) {
                addr = {
                  city: "Current Location",
                  state: "",
                  country: "",
                  area: "",
                  address: "Select location",
                  formattedAddress: "Select location",
                }
              } else {
                try {
                  addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)
                } catch (geocodeErr) {
                  try {
                    addr = await reverseGeocodeDirect(latitude, longitude)
                    if (addr.city === "Current Location" || addr.address.includes(latitude.toFixed(4))) {
                      addr = {
                        city: "Current Location",
                        state: "",
                        country: "",
                        area: "",
                        address: "Select location",
                        formattedAddress: "Select location",
                      }
                    }
                  } catch (fallbackErr) {
                    addr = {
                      city: "Current Location",
                      state: "",
                      country: "",
                      area: "",
                      address: "Select location",
                      formattedAddress: "Select location",
                    }
                  }
                }
              }

              const completeFormattedAddress = addr.formattedAddress || "";
              let displayAddress = addr.address || "";

              const isCoordinatesPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());
              if (isCoordinatesPattern) {
                if (addr.area && addr.area.trim() !== "") {
                  displayAddress = addr.area;
                } else if (addr.city && addr.city.trim() !== "" && addr.city !== "Unknown City") {
                  displayAddress = addr.city;
                }
              }

              const finalLoc = {
                ...addr,
                latitude,
                longitude,
                accuracy: accuracy || null,
                address: displayAddress,
                formattedAddress: completeFormattedAddress || addr.formattedAddress || displayAddress
              }

              const hasPlaceholder =
                finalLoc.city === "Current Location" ||
                finalLoc.address === "Select location" ||
                finalLoc.formattedAddress === "Select location" ||
                (!finalLoc.city && !finalLoc.address && !finalLoc.formattedAddress && !finalLoc.area);

              if (hasPlaceholder) {
                const coordOnlyLoc = {
                  latitude,
                  longitude,
                  accuracy: accuracy || null,
                  city: finalLoc.city,
                  address: finalLoc.address,
                  formattedAddress: finalLoc.formattedAddress
                }
                setLocation(coordOnlyLoc)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                setError(null)
                resolve(coordOnlyLoc)
                return
              }

              localStorage.setItem("userLocation", JSON.stringify(finalLoc))
              setLocation(finalLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              setError(null)

              if (updateDB) {
                await updateLocationInDB(finalLoc).catch(() => { })
              }
              resolve(finalLoc)
            } catch (err) {
              const { latitude, longitude } = pos.coords
              try {
                const lastResortAddr = await reverseGeocodeDirect(latitude, longitude)

                if (lastResortAddr &&
                  lastResortAddr.city !== "Current Location" &&
                  !lastResortAddr.address.includes(latitude.toFixed(4)) &&
                  lastResortAddr.formattedAddress &&
                  !lastResortAddr.formattedAddress.includes(latitude.toFixed(4))) {
                  const lastResortLoc = {
                    ...lastResortAddr,
                    latitude,
                    longitude,
                    accuracy: pos.coords.accuracy || null
                  }
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  resolve(lastResortLoc)
                  return
                }
              } catch (lastErr) { }

              const fallbackLoc = {
                latitude,
                longitude,
                city: "Current Location",
                area: "",
                state: "",
                address: "Select location",
                formattedAddress: "Select location",
              }
              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              resolve(fallbackLoc)
            }
          },
          async (err) => {
            if (err.code === 3 && retryCount === 0 && options.enableHighAccuracy) {
              getPositionWithRetry({
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 300000
              }, 1).then(resolve).catch(reject)
              return
            }

            try {
              let fallback = dbLocation
              if (!fallback) {
                fallback = await fetchLocationFromDB()
              }

              if (!fallback) {
                const stored = localStorage.getItem("userLocation")
                if (stored) {
                  try {
                    fallback = JSON.parse(stored)
                  } catch (parseErr) { }
                }
              }

              if (fallback) {
                setLocation(fallback)
                if (err.code !== 3) {
                  setError(err.message)
                }
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                resolve(fallback)
              } else {
                const defaultLocation = {
                  city: "Select location",
                  address: "Select location",
                  formattedAddress: "Select location"
                }
                setLocation(defaultLocation)
                setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                resolve(defaultLocation)
              }
            } catch (fallbackErr) {
              setLocation(null)
              setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
              setPermissionGranted(false)
              if (showLoading) setLoading(false)
              resolve(null)
            }
          },
          options
        )
      })
    }

    return getPositionWithRetry({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: forceFresh ? 0 : 60000
    })
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (!navigator.geolocation) return;

    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    let retryCount = 0;
    const maxRetries = 2;

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            const { latitude, longitude, accuracy } = pos.coords;
            retryCount = 0;
            const isInIndiaRange = latitude >= 6.5 && latitude <= 37.1 && longitude >= 68.7 && longitude <= 97.4 && longitude > 0;

            let addr;
            if (!isInIndiaRange || longitude < 0) {
              addr = {
                city: "Current Location",
                state: "",
                country: "",
                area: "",
                address: "Select location",
                formattedAddress: "Select location",
              };
            } else {
              try {
                addr = await reverseGeocodeWithGoogleMaps(latitude, longitude);
              } catch (geocodeErr) {
                try {
                  addr = await reverseGeocodeDirect(latitude, longitude);
                } catch (fallbackErr) {
                  addr = {
                    city: "Current Location",
                    state: "",
                    country: "",
                    area: "",
                    address: "Select location",
                    formattedAddress: "Select location",
                  };
                }
              }
            }

            let completeFormattedAddress = addr.formattedAddress || "";
            let displayAddress = addr.address || "";
            const isFormattedAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(completeFormattedAddress.trim());
            const isDisplayAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());

            if (isFormattedAddressCoordinates || !completeFormattedAddress || completeFormattedAddress === "Select location") {
              const addressParts = [];
              if (addr.area && addr.area.trim() !== "") addressParts.push(addr.area);
              if (addr.city && addr.city.trim() !== "") addressParts.push(addr.city);
              if (addr.state && addr.state.trim() !== "") addressParts.push(addr.state);

              if (addressParts.length > 0) {
                completeFormattedAddress = addressParts.join(', ');
                displayAddress = addr.area || addr.city || "Select location";
              } else {
                completeFormattedAddress = addr.city || "Select location";
                displayAddress = addr.city || "Select location";
              }
            }

            if (isDisplayAddressCoordinates) {
              displayAddress = addr.area || addr.city || "Select location";
            }

            const loc = {
              ...addr,
              latitude,
              longitude,
              accuracy: accuracy || null,
              address: displayAddress,
              formattedAddress: completeFormattedAddress
            };

            const currentLoc = location;
            if (currentLoc && currentLoc.latitude && currentLoc.longitude) {
              const latDiff = latitude - currentLoc.latitude;
              const lngDiff = longitude - currentLoc.longitude;
              const distanceMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320;
              const currentParts = (currentLoc.formattedAddress || "").split(',').filter(p => p.trim()).length;
              const newParts = completeFormattedAddress.split(',').filter(p => p.trim()).length;
              const addressImproved = newParts > currentParts;

              if (distanceMeters <= 10 && !addressImproved) return;
            }

            if (loc.formattedAddress && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.formattedAddress.trim())) {
              loc.formattedAddress = loc.area || loc.city || "Select location";
              loc.address = loc.area || loc.city || "Select location";
            }

            const hasPlaceholder = loc.city === "Current Location" || loc.address === "Select location" || loc.formattedAddress === "Select location" || (!loc.city && !loc.address && !loc.formattedAddress && !loc.area);
            if (hasPlaceholder) return;

            const coordThreshold = 0.0001;
            const coordsChanged = !prevLocationCoordsRef.current.latitude || !prevLocationCoordsRef.current.longitude || Math.abs(prevLocationCoordsRef.current.latitude - loc.latitude) > coordThreshold || Math.abs(prevLocationCoordsRef.current.longitude - loc.longitude) > coordThreshold;

            if (coordsChanged) {
              prevLocationCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude };
              localStorage.setItem("userLocation", JSON.stringify(loc));
              setLocation(loc);
              setPermissionGranted(true);
              setError(null);
            } else {
              localStorage.setItem("userLocation", JSON.stringify(loc));
            }

            clearTimeout(updateTimerRef.current);
            updateTimerRef.current = setTimeout(() => {
              updateLocationInDB(loc).catch(() => { });
            }, 5000);
          } catch (err) {
            const { latitude, longitude } = pos.coords;
            const fallbackLoc = { latitude, longitude, city: "Current Location", area: "", state: "", address: "Select location", formattedAddress: "Select location" };
            setLocation(fallbackLoc);
            setPermissionGranted(true);
          }
        },
        (err) => {
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++;
            if (watchIdRef.current) {
              navigator.geolocation.clearWatch(watchIdRef.current);
              watchIdRef.current = null;
            }
            setTimeout(() => {
              startWatch({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
            }, 3000);
            return;
          }

          if (err.code !== 3) {
            setError(err.message);
            setPermissionGranted(false);
          }
        },
        options
      );
    }

    startWatch({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    clearTimeout(updateTimerRef.current);
  };

  /* ===================== INIT ===================== */
  useEffect(() => {
    const stored = localStorage.getItem("userLocation");
    let shouldForceRefresh = false;
    let hasInitialLocation = false;

    if (stored) {
      try {
        const parsedLocation = JSON.parse(stored);
        if (parsedLocation && (parsedLocation.latitude || parsedLocation.city) && parsedLocation.formattedAddress !== "Select location" && parsedLocation.city !== "Current Location") {
          setLocation(parsedLocation);
          setPermissionGranted(true);
          setLoading(false);
          hasInitialLocation = true;

          const hasCompleteAddress = parsedLocation?.formattedAddress && parsedLocation.formattedAddress !== "Select location" && !parsedLocation.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) && parsedLocation.formattedAddress.split(',').length >= 4;
          if (!hasCompleteAddress) shouldForceRefresh = true;
        } else {
          shouldForceRefresh = true;
        }
      } catch (err) {
        shouldForceRefresh = true;
      }
    }

    if (!hasInitialLocation) {
      fetchLocationFromDB().then((dbLoc) => {
        if (dbLoc && (dbLoc.latitude || dbLoc.city)) {
          setLocation(dbLoc);
          setPermissionGranted(true);
          setLoading(false);
          hasInitialLocation = true;
          const hasCompleteAddress = dbLoc?.formattedAddress && dbLoc.formattedAddress !== "Select location" && !dbLoc.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) && dbLoc.formattedAddress.split(',').length >= 4;
          if (!hasCompleteAddress) shouldForceRefresh = true;
        } else {
          setLoading(false);
          shouldForceRefresh = true;
        }
      }).catch(() => {
        setLoading(false);
        shouldForceRefresh = true;
      });
    }

    const loadingTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          setLocation((currentLocation) => {
            if (!currentLocation || (currentLocation.formattedAddress === "Select location" && !currentLocation.latitude && !currentLocation.city)) {
              return { city: "Select location", address: "Select location", formattedAddress: "Select location" };
            }
            return currentLocation;
          });
        }
        return false;
      });
    }, 5000);

    const currentLocation = location;
    const hasPlaceholder = currentLocation && (currentLocation.formattedAddress === "Select location" || currentLocation.city === "Current Location");
    const shouldFetch = shouldForceRefresh || !hasInitialLocation || hasPlaceholder;

    if (shouldFetch) {
      getLocation(true, shouldForceRefresh).then((location) => {
        if (location && location.formattedAddress !== "Select location" && location.city !== "Current Location") {
          setLocation(location);
          setPermissionGranted(true);
          startWatchingLocation();
        } else {
          setTimeout(() => {
            getLocation(true, true).then((retryLocation) => {
              if (retryLocation && retryLocation.formattedAddress !== "Select location" && retryLocation.city !== "Current Location") {
                setLocation(retryLocation);
                setPermissionGranted(true);
                startWatchingLocation();
              }
            }).catch(() => startWatchingLocation());
          }, 2000);
        }
      }).catch(() => startWatchingLocation());
    } else {
      startWatchingLocation();
    }

    return () => {
      clearTimeout(loadingTimeout);
      stopWatchingLocation();
    };
  }, []);

  const requestLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      localStorage.removeItem("userLocation");
      const location = await getLocation(true, true, true);
      startWatchingLocation();
      return location;
    } catch (err) {
      setError(err.message || "Failed to get location");
      startWatchingLocation();
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    location,
    loading,
    error,
    permissionGranted,
    requestLocation,
    startWatchingLocation,
    stopWatchingLocation,
  };
}
