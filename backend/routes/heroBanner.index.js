import express from 'express';
import heroBannerRoutes from './heroBanner.routes.js';

const router = express.Router();
router.use('/hero-banners', heroBannerRoutes);

export default router;
