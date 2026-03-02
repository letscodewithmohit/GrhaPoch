import express from 'express';
import subscriptionRoutes from './subscriptionRoutes.js';

const router = express.Router();
router.use('/', subscriptionRoutes);

export default router;
