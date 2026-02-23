import { normalizeCoordinates, calculateDistance } from './modules/order/services/orderCalculationService.js';

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

    if (distance > 0 && distance < 5) {
        console.log('✅ Distance calculation seems reasonable (~2.5km)');
    } else {
        console.log('❌ Distance calculation seems off');
    }
};

testNormalization();
testDistance();
