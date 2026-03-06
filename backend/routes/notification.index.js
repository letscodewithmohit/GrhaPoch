import express from 'express';
import fcmTokenRoutes from './fcmTokenRoutes.js';

const router = express.Router();

// FCM push notification token management
router.use('/fcm', fcmTokenRoutes);

router.get('/', (req, res) => {
  res.json({ message: 'Notification module: use /fcm/* endpoints for push notification token management' });
});

export default router;
