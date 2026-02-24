
/**
 * Common utility for displaying location in a consistent way across the app (Zomato-style)
 * Consistently shows:
 * Main: POI/Building/Area name
 * Sub: City, State
 */

const isCoordinates = (str) => {
    if (!str) return false
    const coordPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/
    return coordPattern.test(str.trim())
}

const isPlusCode = (str) => {
    if (!str) return false
    return /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(str.trim())
}

const isJunk = (str) => !str || isCoordinates(str) || isPlusCode(str) ||
    ["Select location", "Current Location", "Location Found", "Unknown City", "Address", "Location"].includes(str)

export const getLocationDisplayParts = (location) => {
    if (!location) return { main: "Select location", sub: "" }

    let mainLocation = ""
    let subLocation = ""

    // 1. Label Priority (Home/Office)
    if (location.label && !isJunk(location.label) &&
        !["Current Location", "Selected Location", "Address", "Home", "Office", "Work"].some(l => location.label.includes(l) && location.label.length < 15)) {
        // If it's a specific label but not a generic one
        mainLocation = location.label;
    }

    // Explicit Home/Office labels are good
    if (!mainLocation && ["Home", "Office", "Work"].includes(location.label)) {
        mainLocation = location.label;
    }

    // 2. mainTitle Priority (ZOMATO-STYLE) - Exact building/cafe name
    if (!mainLocation && location.mainTitle && !isJunk(location.mainTitle)) {
        mainLocation = location.mainTitle;
        if (location.area && !isJunk(location.area) &&
            location.area.toLowerCase() !== location.mainTitle.toLowerCase() &&
            location.area.toLowerCase() !== location.city?.toLowerCase()) {
            mainLocation = `${location.mainTitle}, ${location.area}`;
        }
    }

    // 3. FormattedAddress or Address Extraction
    const candidateAddresses = [location.formattedAddress, location.address].filter(addr => addr && !isCoordinates(addr) && !isPlusCode(addr) && !isJunk(addr));

    if (!mainLocation && candidateAddresses.length > 0) {
        const addressToProcess = candidateAddresses[0];
        const parts = addressToProcess.split(',').map(p => p.trim()).filter(p => p.length > 0 && !isPlusCode(p))

        if (parts.length >= 2) {
            let cityIndex = -1
            if (location.city) {
                cityIndex = parts.findIndex(part => part.toLowerCase() === location.city.toLowerCase())
            }

            if (cityIndex > 0) {
                // Everything before the city is the locality
                mainLocation = parts.slice(0, cityIndex).join(', ')
            } else {
                // Take first 2-3 parts
                mainLocation = parts.slice(0, Math.min(3, parts.length)).join(', ')
            }
        } else {
            mainLocation = parts[0]
        }
    }

    // 4. Fallback to Area or City
    if (!mainLocation || isJunk(mainLocation)) {
        if (location.area && !isJunk(location.area)) {
            mainLocation = location.area;
            if (location.city && !isJunk(location.city) && location.city !== location.area) {
                mainLocation = `${location.area}, ${location.city}`;
            }
        } else {
            mainLocation = location.city || "Select location";
        }
    }

    // Ensure we don't return junk
    if (isJunk(mainLocation)) {
        mainLocation = "Select location";
    }

    // Sub Location Logic
    const hasCity = location.city && !isJunk(location.city)
    const hasState = location.state && !isJunk(location.state)

    if (hasCity && hasState) {
        subLocation = `${location.city}, ${location.state}`
    } else if (hasCity) {
        subLocation = location.city
    } else if (hasState) {
        subLocation = location.state
    }

    return {
        main: mainLocation,
        sub: subLocation || ""
    }
}
