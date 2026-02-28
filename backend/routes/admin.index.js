import express from 'express';
import adminAuthRoutes from './adminAuthRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = express.Router();
router.use('/auth', adminAuthRoutes);
router.use('/', adminRoutes);

export default router;
