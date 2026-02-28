import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import DiningTable from '../../dining/models/DiningTable.js';

const ensureDiningEnabled = (restaurant, res) => {
    if (!restaurant?.diningEnabled) {
        errorResponse(res, 403, 'Dining is not enabled for this restaurant yet');
        return false;
    }
    return true;
};

// Get all tables for the authenticated restaurant
export const getTables = asyncHandler(async (req, res) => {
    try {
        if (!ensureDiningEnabled(req.restaurant, res)) return;

        const restaurantId = req.restaurant._id;
        const tables = await DiningTable.find({ restaurantId }).sort({ createdAt: -1 });

        return successResponse(res, 200, 'Tables retrieved successfully', {
            tables
        });
    } catch (error) {
        console.error('Error fetching tables:', error);
        return errorResponse(res, 500, 'Failed to fetch tables');
    }
});

// Add a new table
export const addTable = asyncHandler(async (req, res) => {
    try {
        if (!ensureDiningEnabled(req.restaurant, res)) return;

        const restaurantId = req.restaurant._id;
        const { tableNumber, capacity } = req.body;

        if (!tableNumber || !capacity) {
            return errorResponse(res, 400, 'Table number and capacity are required');
        }

        // Check if table number already exists for this restaurant
        const existingTable = await DiningTable.findOne({ restaurantId, tableNumber });
        if (existingTable) {
            return errorResponse(res, 400, 'Table number already exists. Please use a different number.');
        }

        const newTable = new DiningTable({
            restaurantId,
            tableNumber,
            capacity: Number(capacity),
            status: 'Active'
        });

        await newTable.save();

        return successResponse(res, 201, 'Table added successfully', {
            table: newTable
        });
    } catch (error) {
        console.error('Error adding table:', error);
        return errorResponse(res, 500, 'Failed to add table');
    }
});

// Delete a table
export const deleteTable = asyncHandler(async (req, res) => {
    try {
        if (!ensureDiningEnabled(req.restaurant, res)) return;

        const restaurantId = req.restaurant._id;
        const { id } = req.params;

        const table = await DiningTable.findOneAndDelete({ _id: id, restaurantId });

        if (!table) {
            return errorResponse(res, 404, 'Table not found');
        }

        return successResponse(res, 200, 'Table deleted successfully');
    } catch (error) {
        console.error('Error deleting table:', error);
        return errorResponse(res, 500, 'Failed to delete table');
    }
});
