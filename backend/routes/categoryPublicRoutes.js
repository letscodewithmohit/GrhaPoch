import express from 'express';
import { getPublicCategories } from '../controllers/admin.category.controller.js';

const router = express.Router();

// Public route - no authentication required
router.get('/categories/public', getPublicCategories);

export default router;

