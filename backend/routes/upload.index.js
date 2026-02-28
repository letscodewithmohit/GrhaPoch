import express from 'express';
import uploadRoutes from './upload.routes.js';

const router = express.Router();
router.use('/upload', uploadRoutes);

export default router;
