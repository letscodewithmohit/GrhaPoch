/**
 * Normalize coordinate input to [longitude, latitude] array
 * Handles:
 * 1. [lng, lat] array
 * 2. { latitude, longitude } object
 * 3. { lat, lng } object
 * 4. { coordinates: [lng, lat] } GeoJSON object
 * 5. { location: { coordinates: [lng, lat] } } Nested GeoJSON
 * 6. { location: { latitude, longitude } } Nested flat object
 */
export const normalizeCoordinates = (input) => {
    if (!input) return null;

    // 1. If it's already an array [lng, lat]
    if (Array.isArray(input) && input.length >= 2) {
        return [Number(input[0]), Number(input[1])];
    }

    // 2. If it's a nested location object (like from address or restaurant model)
    if (input.location) {
        return normalizeCoordinates(input.location);
    }

    // 3. If it's a GeoJSON object { coordinates: [lng, lat] }
    if (input.coordinates && Array.isArray(input.coordinates)) {
        return [Number(input.coordinates[0]), Number(input.coordinates[1])];
    }

    // 4. If it's a flat object with latitude/longitude
    const lat = input.latitude ?? input.lat;
    const lng = input.longitude ?? input.lng;

    if (lat !== undefined && lng !== undefined) {
        return [Number(lng), Number(lat)];
    }

    return null;
};

/**
 * Calculate distance between two points (Haversine formula)
 * @param {Array|Object} point1 - First coordinate point
 * @param {Array|Object} point2 - Second coordinate point
 * @returns {number|null} - Distance in kilometers
 */
export const calculateDistance = (point1, point2) => {
    const coord1 = normalizeCoordinates(point1);
    const coord2 = normalizeCoordinates(point2);

    if (!coord1 || !coord2) return null;

    const [lng1, lat1] = coord1;
    const [lng2, lat2] = coord2;

    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
};

const testNormalization = () => {
    console.log('--- Testing normalizeCoordinates ---');

    const tests = [
        {
            name: 'Array [lng, lat]',
            input: [75.8577, 22.7196],
            expected: [75.8577, 22.7196]
        },
        {
            name: 'Object {latitude, longitude}',
            input: { latitude: 22.7196, longitude: 75.8577 },
            expected: [75.8577, 22.7196]
        },
        {
            name: 'Object {lat, lng}',
            input: { lat: 22.7196, lng: 75.8577 },
            expected: [75.8577, 22.7196]
        },
        {
            name: 'GeoJSON {coordinates: [lng, lat]}',
            input: { coordinates: [75.8577, 22.7196] },
            expected: [75.8577, 22.7196]
        },
        {
            name: 'Nested GeoJSON {location: {coordinates: [lng, lat]}}',
            input: { location: { coordinates: [75.8577, 22.7196] } },
            expected: [75.8577, 22.7196]
        },
        {
            name: 'Nested flat {location: {latitude, longitude}}',
            input: { location: { latitude: 22.7196, longitude: 75.8577 } },
            expected: [75.8577, 22.7196]
        }
    ];

    tests.forEach(t => {
        const result = normalizeCoordinates(t.input);
        const passed = JSON.stringify(result) === JSON.stringify(t.expected);
        console.log(`${passed ? '✅' : '❌'} ${t.name}: ${JSON.stringify(result)}`);
    });
};

const testDistance = () => {
    console.log('\n--- Testing calculateDistance ---');

    // Indore Junction to Rajwada Palace (~2.5km)
    const indoreJunction = { lat: 22.7177, lng: 75.8690 };
    const rajwadaPalace = { location: { coordinates: [75.8546, 22.7194] } };

    const distance = calculateDistance(indoreJunction, rajwadaPalace);
    console.log(`Distance between Indore Junction and Rajwada Palace: ${distance?.toFixed(2)} km`);

    if (distance > 1.5 && distance < 3.5) {
        console.log('✅ Distance calculation seems reasonable (~2.5km)');
    } else {
        console.log('❌ Distance calculation seems off');
    }
};

testNormalization();
testDistance();
