/**
 * FCM Token Management Routes
 * Handles saving and removing FCM push notification tokens for:
 *  - Users     (authenticated via user JWT)
 *  - Delivery  (authenticated via delivery JWT)
 *  - Restaurants (authenticated via restaurant JWT)
 *
 * All routes resolve to /api/notification/fcm/...
 */
import express from 'express';
import { authenticate as authenticateUser } from '../middleware/auth.js';
import { authenticate as authenticateDelivery } from '../middleware/delivery.auth.js';
import { authenticate as authenticateRestaurant } from '../middleware/restaurant.auth.js';
import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import Restaurant from '../models/Restaurant.js';

const router = express.Router();

const MAX_TOKENS = 10; // Max FCM tokens per entity

/** Helper: upsert token into array (dedup, cap at MAX_TOKENS) */
function upsertToken(arr = [], token) {
    if (!token || arr.includes(token)) return arr;
    const updated = [...arr, token];
    return updated.length > MAX_TOKENS ? updated.slice(-MAX_TOKENS) : updated;
}

/** Helper: remove token from array */
function removeToken(arr = [], token) {
    return arr.filter(t => t !== token);
}

/** Helper: determine which field to use based on platform */
function getTokenField(platform) {
    return platform === 'mobile' ? 'fcmTokensMobile' : 'fcmTokensWeb';
}

/* ─────────────────────────── USER ─────────────────────────── */

// POST /api/notification/fcm/user/save
router.post('/user/save', authenticateUser, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const field = getTokenField(platform);
        user[field] = upsertToken(user[field], token);
        await user.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token saved` });
    } catch (error) {
        console.error('[FCM] Error saving user token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to save token' });
    }
});

// DELETE /api/notification/fcm/user/remove
router.delete('/user/remove', authenticateUser, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const field = getTokenField(platform);
        user[field] = removeToken(user[field], token);
        await user.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token removed` });
    } catch (error) {
        console.error('[FCM] Error removing user token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to remove token' });
    }
});

/* ─────────────────────────── DELIVERY ─────────────────────────── */

// POST /api/notification/fcm/delivery/save
router.post('/delivery/save', authenticateDelivery, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const delivery = await Delivery.findById(req.delivery._id);
        if (!delivery) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

        const field = getTokenField(platform);
        delivery[field] = upsertToken(delivery[field], token);
        await delivery.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token saved` });
    } catch (error) {
        console.error('[FCM] Error saving delivery token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to save token' });
    }
});

// DELETE /api/notification/fcm/delivery/remove
router.delete('/delivery/remove', authenticateDelivery, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const delivery = await Delivery.findById(req.delivery._id);
        if (!delivery) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

        const field = getTokenField(platform);
        delivery[field] = removeToken(delivery[field], token);
        await delivery.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token removed` });
    } catch (error) {
        console.error('[FCM] Error removing delivery token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to remove token' });
    }
});

/* ─────────────────────────── RESTAURANT ─────────────────────────── */

// POST /api/notification/fcm/restaurant/save
router.post('/restaurant/save', authenticateRestaurant, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const restaurant = await Restaurant.findById(req.restaurant._id);
        if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

        const field = getTokenField(platform);
        restaurant[field] = upsertToken(restaurant[field], token);
        await restaurant.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token saved` });
    } catch (error) {
        console.error('[FCM] Error saving restaurant token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to save token' });
    }
});

// DELETE /api/notification/fcm/restaurant/remove
router.delete('/restaurant/remove', authenticateRestaurant, async (req, res) => {
    try {
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const restaurant = await Restaurant.findById(req.restaurant._id);
        if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

        const field = getTokenField(platform);
        restaurant[field] = removeToken(restaurant[field], token);
        await restaurant.save();

        return res.json({ success: true, message: `FCM ${platform || 'web'} token removed` });
    } catch (error) {
        console.error('[FCM] Error removing restaurant token:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to remove token' });
    }
});

export default router;
