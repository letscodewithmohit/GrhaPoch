import express from 'express';
import userAdvertisementRoutes from './userAdvertisement.routes.js';

const router = express.Router();

router.use('/', userAdvertisementRoutes);

export default router;
