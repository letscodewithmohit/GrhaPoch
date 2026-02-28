import express from 'express';
import {
  getRestaurantComplaints,
  getComplaintDetails,
  respondToComplaint
} from '../controllers/restaurant.complaint.controller.js';
import { authenticate } from '../middleware/restaurant.auth.js';

const router = express.Router();

// All routes require restaurant authentication
router.use(authenticate);

// Complaint routes
router.get('/', getRestaurantComplaints);
router.get('/:id', getComplaintDetails);
router.put('/:id/respond', respondToComplaint);

export default router;
