
import axios from 'axios';

// Based on DB inspection, the login email is this one:
const email = '712choudharymohit@gmail.com';
const password = '12345678';

const performLogin = async () => {
    try {
        console.log(`Attempting login for: ${email} with password authentication`);

        const response = await axios.post('http://localhost:5000/api/restaurant/auth/login', {
            email: email,
            password: password
        });

        console.log('✅ Login Successful!');
        console.log('--------------------------------------------------');

        const responseData = response.data;
        let accessToken, restaurant;

        if (responseData.data) {
            accessToken = responseData.data.accessToken;
            restaurant = responseData.data.restaurant;
        } else {
            accessToken = responseData.accessToken;
            restaurant = responseData.restaurant;
        }

        console.log('ACCESS TOKEN:', accessToken);
        console.log('--------------------------------------------------');
        console.log('Restaurant Details:', JSON.stringify(restaurant, null, 2));

    } catch (error) {
        console.error('❌ Login Failed');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
};

performLogin();
