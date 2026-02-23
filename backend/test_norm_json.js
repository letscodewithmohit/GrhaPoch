export const normalizeCoordinates = (input) => {
    if (!input) return null;
    if (Array.isArray(input) && input.length >= 2) {
        return [Number(input[0]), Number(input[1])];
    }
    if (input.location) {
        return normalizeCoordinates(input.location);
    }
    if (input.coordinates && Array.isArray(input.coordinates)) {
        return [Number(input.coordinates[0]), Number(input.coordinates[1])];
    }
    const lat = input.latitude ?? input.lat;
    const lng = input.longitude ?? input.lng;
    if (lat !== undefined && lng !== undefined) {
        return [Number(lng), Number(lat)];
    }
    return null;
};

const tests = [
    { name: 'Array', input: [75.8, 22.7], expected: [75.8, 22.7] },
    { name: 'Flat LatLng', input: { latitude: 22.7, longitude: 75.8 }, expected: [75.8, 22.7] },
    { name: 'Flat lat/lng', input: { lat: 22.7, lng: 75.8 }, expected: [75.8, 22.7] },
    { name: 'GeoJSON', input: { coordinates: [75.8, 22.7] }, expected: [75.8, 22.7] },
    { name: 'Nested GeoJSON', input: { location: { coordinates: [75.8, 22.7] } }, expected: [75.8, 22.7] },
    { name: 'Nested Flat', input: { location: { latitude: 22.7, longitude: 75.8 } }, expected: [75.8, 22.7] }
];

const results = tests.map(t => {
    const result = normalizeCoordinates(t.input);
    return { name: t.name, result, passed: JSON.stringify(result) === JSON.stringify(t.expected) };
});

console.log(JSON.stringify(results, null, 2));
