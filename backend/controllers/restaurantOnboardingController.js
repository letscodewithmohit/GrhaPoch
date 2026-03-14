import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { createRestaurantFromOnboarding } from './restaurantController.js';

// Validation constants
const NAME_REGEX = /^[A-Za-z\s]+$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const validateName = (name) => {
  if (!name) return false;
  const v = name.trim();
  return v.length >= 3 && v.length <= 50 && NAME_REGEX.test(v);
};

// Get current restaurant's onboarding data
export const getOnboarding = async (req, res) => {
  try {
    // Check if restaurant is authenticated
    if (!req.restaurant || !req.restaurant._id) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId).select('onboarding businessModel subscription onboardingCompleted').lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    return successResponse(res, 200, 'Onboarding data retrieved', {
      onboarding: {
        ...(restaurant.onboarding || {}),
        businessModel: restaurant.businessModel
      },
      subscription: restaurant.subscription || null,
      onboardingCompleted: restaurant.onboardingCompleted === true
    });
  } catch (error) {
    console.error('Error fetching restaurant onboarding:', error);
    return errorResponse(res, 500, 'Failed to fetch onboarding data');
  }
};

// Upsert onboarding data (all steps in one payload)
export const upsertOnboarding = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;
    const { step1, step2, step3, step4, step5, completedSteps, businessModel } = req.body;

    // Get existing restaurant data to merge if needed
    const existingRestaurant = await Restaurant.findById(restaurantId).lean();
    const existingOnboarding = existingRestaurant?.onboarding || {};

    const update = {};

    // Step1: Always update if provided
    if (step1) {
      if (step1.ownerName && !validateName(step1.ownerName)) {
        return errorResponse(res, 400, 'Name must contain only letters (3???50 characters).');
      }
      update['onboarding.step1'] = step1;
    }

    // Step2: Update if provided
    if (step2 !== undefined && step2 !== null) {
      update['onboarding.step2'] = step2;
    }

    // Step3: Update if provided
    if (step3 !== undefined && step3 !== null) {
      // PAN Validation
      if (step3.panNumber && !PAN_REGEX.test(step3.panNumber)) {
        if (step3.panNumber.length < 10) {
          return errorResponse(res, 400, 'PAN number must be exactly 10 characters (Format: AAAAA9999A)');
        }
        return errorResponse(res, 400, 'Invalid PAN format. Example: ABCDE1234F');
      }
      if (step3.nameOnPan && !validateName(step3.nameOnPan)) {
        return errorResponse(res, 400, 'Name must contain only letters (3???50 characters).');
      }

      // GST Validation
      if (step3.gstRegistered) {
        if (step3.gstNumber && !GST_REGEX.test(step3.gstNumber)) {
          return errorResponse(res, 400, 'Invalid GST number. Example: 22ABCDE1234F1Z5');
        }
        if (step3.gstLegalName && !validateName(step3.gstLegalName)) {
          return errorResponse(res, 400, 'Legal name must contain only letters.');
        }
      }

      // FSSAI Validation
      if (step3.fssaiNumber && (step3.fssaiNumber.length !== 14 || !/^\d+$/.test(step3.fssaiNumber))) {
        return errorResponse(res, 400, 'Invalid FSSAI number. It must contain exactly 14 digits.');
      }

      // Bank Account Validation
      if (step3.accountNumber) {
        if (step3.accountNumber.length < 9 || step3.accountNumber.length > 18 || !/^\d+$/.test(step3.accountNumber)) {
          return errorResponse(res, 400, 'Invalid account number. Only numbers are allowed.');
        }
      }
      if (step3.confirmAccountNumber && step3.confirmAccountNumber !== step3.accountNumber) {
        return errorResponse(res, 400, 'Account numbers do not match. Please re-enter correctly.');
      }
      if (step3.ifscCode && !IFSC_REGEX.test(step3.ifscCode)) {
        return errorResponse(res, 400, 'Invalid IFSC code. Example: SBIN0001234');
      }
      if (step3.accountHolderName && !validateName(step3.accountHolderName)) {
        return errorResponse(res, 400, 'Name must contain only letters (3???50 characters).');
      }

      // Normalize account type to match enum: 'Saving' or 'Current'
      if (step3.bank && step3.bank.accountType) {
        const at = step3.bank.accountType.toLowerCase();
        if (at === 'saving' || at === 'savings') {
          step3.bank.accountType = 'Saving';
        } else if (at === 'current') {
          step3.bank.accountType = 'Current';
        }
      } else if (step3.accountType) {
        // Handle cases where accountType might be at the root of step3 object
        const at = step3.accountType.toLowerCase();
        if (at === 'saving' || at === 'savings') {
          step3.accountType = 'Saving';
        } else if (at === 'current') {
          step3.accountType = 'Current';
        }
      }

      update['onboarding.step3'] = step3;
    }

    // Step4: Always update if provided
    if (step4 !== undefined && step4 !== null) {
      update['onboarding.step4'] = step4;
    }

    // Step5: Update if provided
    if (step5 !== undefined && step5 !== null) {
      update['onboarding.step5'] = step5;
    }

    // Update completedSteps if provided
    if (typeof completedSteps === 'number' && completedSteps !== null && completedSteps !== undefined) {
      update['onboarding.completedSteps'] = completedSteps;
    }










    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: update },
      {
        new: true,
        upsert: false
      }
    );

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const onboarding = restaurant.onboarding;
    const finalCompletedSteps = onboarding.completedSteps || completedSteps;



    // Sync fields to main restaurant document ONLY when onboarding is complete (step 5)
    if (finalCompletedSteps === 5) {
      try {
        const syncData = {
          step1: step1 || onboarding.step1,
          step2: step2 || onboarding.step2,
          step4: step4 || onboarding.step4
        };
        await createRestaurantFromOnboarding(syncData, restaurantId);
      } catch (syncError) {
        console.error('⚠️ Error syncing onboarding data to restaurant schema:', syncError);
        // We continue anyway so onboarding state is at least saved
      }
    }

    // Update restaurant schema when completing onboarding (step 5)
    if (finalCompletedSteps >= 5 && (step5 || businessModel)) {

      const requestedModel = step5?.businessModel || businessModel || onboarding.businessModel;
      const hasActiveSubscription =
        existingRestaurant?.subscription?.status === 'active' &&
        existingRestaurant?.subscription?.endDate &&
        new Date(existingRestaurant.subscription.endDate) > new Date();

      // Only allow Subscription Base if a paid/active subscription exists
      const modelToSave =
        requestedModel === 'Subscription Base' && hasActiveSubscription ?
        'Subscription Base' :
        'Commission Base';




      try {
        const updateData = {};
        updateData.businessModel = modelToSave;

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(restaurantId, { $set: updateData }, { new: true });



        }
      } catch (bmUpdateError) {
        console.error('⚠️ Error updating restaurant schema with final data:', bmUpdateError);
      }
    }









    // Update restaurant with final data if onboarding is complete (step 5)
    if (finalCompletedSteps === 5 || step5 && completedSteps === 5) {


      // Fetch the complete restaurant to verify all data is saved
      const completeRestaurant = await Restaurant.findById(restaurantId).lean();






      // Return success response with restaurant info
      // Mark onboarding completed flag
      await Restaurant.findByIdAndUpdate(restaurantId, {
        $set: {
          onboardingCompleted: true,
          'onboarding.completedSteps': 5
        }
      });

      return successResponse(res, 200, 'Onboarding data saved and restaurant updated', {
        onboarding,
        restaurant: {
          restaurantId: completeRestaurant?.restaurantId,
          _id: completeRestaurant?._id,
          name: completeRestaurant?.name,
          slug: completeRestaurant?.slug,
          isActive: completeRestaurant?.isActive,
          businessModel: completeRestaurant?.businessModel
        }
      });
    }

    return successResponse(res, 200, 'Onboarding data saved', {
      onboarding
    });
  } catch (error) {
    console.error('Error saving restaurant onboarding:', error);
    return errorResponse(res, 500, 'Failed to save onboarding data');
  }
};

// Manual trigger to update restaurant from onboarding (for debugging/fixing)
export const createRestaurantFromOnboardingManual = async (req, res) => {
  try {
    const restaurantId = req.restaurant._id;

    // Fetch the complete restaurant with onboarding data
    const restaurant = await Restaurant.findById(restaurantId).lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    if (!restaurant.onboarding) {
      return errorResponse(res, 404, 'Onboarding data not found');
    }

    if (!restaurant.onboarding.step1 || !restaurant.onboarding.step2) {
      return errorResponse(res, 400, 'Incomplete onboarding data. Please complete all steps first.');
    }

    if (restaurant.onboarding.completedSteps !== 3) {
      return errorResponse(res, 400, `Onboarding not complete. Current step: ${restaurant.onboarding.completedSteps}/3`);
    }

    try {
      const updatedRestaurant = await createRestaurantFromOnboarding(restaurant.onboarding, restaurantId);

      return successResponse(res, 200, 'Restaurant updated successfully', {
        restaurant: {
          restaurantId: updatedRestaurant.restaurantId,
          _id: updatedRestaurant._id,
          name: updatedRestaurant.name,
          slug: updatedRestaurant.slug,
          isActive: updatedRestaurant.isActive
        }
      });
    } catch (error) {
      console.error('Error updating restaurant:', error);
      return errorResponse(res, 500, `Failed to update restaurant: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in createRestaurantFromOnboardingManual:', error);
    return errorResponse(res, 500, 'Failed to process request');
  }
};
