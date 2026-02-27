import express from 'express';
import { listPublicActiveAdvertisements } from './controllers/advertisementController.js';

const router = express.Router();

router.get('/active', listPublicActiveAdvertisements);

export default router