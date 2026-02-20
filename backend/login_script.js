import { normalizePhoneNumber } from '../shared/utils/phoneUtils.js';
import axios from 'axios';

const phone = "918817921168";
const otp = "110211"; // Default OTP for test numbers

const login = async () => {
    try {
        const normalizedPhone = normalizePhoneNumber(phone);
        console.log(`Logging in with phone: ${normalizedPhone}`);

        // Step 1: Send OTP (this will trigger the backend to recognize it as a test number)
        try {
            await axios.post('http://localhost:5000/api/restaurant/auth/send-otp', {
                phone: normalizedPhone
            });
            console.log('OTP sent successfully (simulated)');
        } catch (error) {
            console.log('Error sending OTP (might be expected for test numbers if SMS service fails):', error.message);
        }

        // Step 2: Verify OTP
        const response = await axios.post('http://localhost:5000/api/restaurant/auth/verify-otp', {
            phone: normalizedPhone,
            otp: otp
        });

        console.log('Login successful!');
        console.log('Access Token:', response.data.data.accessToken);
        console.log('Restaurant Name:', response.data.data.restaurant.name);

    } catch (error) {
        if (error.response) {
            console.error('Login failed:', error.response.data);
        } else {
            console.error('Login failed:', error.message);
        }
    }
};

login();
