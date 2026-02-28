import express from 'express';
import deliveryAuthRoutes from './deliveryAuthRoutes.js';
import deliveryDashboardRoutes from './deliveryDashboardRoutes.js';
import deliveryProfileRoutes from './deliveryProfileRoutes.js';
import deliveryOrdersRoutes from './deliveryOrdersRoutes.js';
import deliveryEarningsRoutes from './deliveryEarningsRoutes.js';
import deliveryLocationRoutes from './deliveryLocationRoutes.js';
import deliverySignupRoutes from './deliverySignupRoutes.js';
import deliveryWalletRoutes from './deliveryWalletRoutes.js';

const router = express.Router();
router.use('/auth', deliveryAuthRoutes);
router.use('/', deliverySignupRoutes);
router.use('/', deliveryDashboardRoutes);
router.use('/', deliveryProfileRoutes);
router.use('/', deliveryOrdersRoutes);
router.use('/', deliveryEarningsRoutes);
router.use('/', deliveryLocationRoutes);
router.use('/wallet', deliveryWalletRoutes);

export default router;
