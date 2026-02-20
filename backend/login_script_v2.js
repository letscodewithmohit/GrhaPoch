import axios from 'axios';

// Copy of normalizePhoneNumber from backend/shared/utils/phoneUtils.js
const normalizePhoneNumber = (phone) => {
    if (!phone || typeof phone !== 'string') {
        return null;
    }

    // Remove all non-digit characters (including +)
    const digitsOnly = phone.trim().replace(/\D/g, '');

    // If it's empty after cleaning, return null
    if (!digitsOnly) {
        return null;
    }

    // Handle Indian phone numbers (most common case)
    // If it's 10 digits, assume it's Indian and add country code 91
    if (digitsOnly.length === 10) {
        return `91${digitsOnly}`;
    }

    // If it's 11 digits and starts with 0, remove leading 0 and add 91
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
        return `91${digitsOnly.substring(1)}`;
    }

    // If it's 12 digits and starts with 91, return as is
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
        return digitsOnly;
    }

    // For other lengths, return as is (could be other country codes)
    return digitsOnly;
};

const phone = "8817921168"; // Your phone number
const otp = "110211"; // Default OTP for test numbers

const performLogin = async () => {
    try {
        const normalizedPhone = normalizePhoneNumber(phone);
        console.log(`Trying to login with phone: ${normalizedPhone} (normalised from ${phone})`);

        console.log('--- Step 1: Sending OTP (Simulated) ---');
        // We call send-otp first because the backend might expect an OTP record to exist 
        // even for test numbers, or at least to trigger the logic.
        // For test numbers, it won't actually send an SMS but will log it.
        try {
            const sendOtpResponse = await axios.post('http://localhost:5000/api/restaurant/auth/send-otp', {
                phone: normalizedPhone
            });
            console.log('Send OTP Response:', sendOtpResponse.data);
        } catch (error) {
            console.log('Error sending OTP (This might be okay if it just failed to send SMS):', error.message);
            if (error.response) console.log(error.response.data);
        }

        console.log('\n--- Step 2: Verifying OTP & Logging In ---');
        const verifyResponse = await axios.post('http://localhost:5000/api/restaurant/auth/verify-otp', {
            phone: normalizedPhone,
            otp: otp,
            name: "Sumit's Pizza" // Providing name for auto-registration
        });

        console.log('✅ Login Successful!');
        console.log('--------------------------------------------------');
        // Check structure
        const responseData = verifyResponse.data;
        if (responseData.data && responseData.data.accessToken) {
            console.log('ACCESS TOKEN:', responseData.data.accessToken);
            console.log('--------------------------------------------------');
            console.log('Restaurant Details:', JSON.stringify(responseData.data.restaurant, null, 2));
        } else if (responseData.accessToken) {
            console.log('ACCESS TOKEN:', responseData.accessToken);
            console.log('--------------------------------------------------');
            console.log('Restaurant Details:', JSON.stringify(responseData.restaurant, null, 2));
        } else {
            console.log('Full Response Data:', JSON.stringify(responseData, null, 2));
        }

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
