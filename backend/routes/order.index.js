import express from 'express';
import orderRoutes from './orderRoutes.js';
import etaRoutes from './etaRoutes.js';

const router = express.Router();
router.use('/', orderRoutes);
router.use('/api', etaRoutes);

export default router;
