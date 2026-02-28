import Restaurant from '../models/Restaurant.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { createRestaurantFromOnboarding } from './restaurantController.js';

// Get current restaurant's onboarding data
export const getOnboarding = async (req, res) => {
  try {
    // Check if restaurant is authenticated
    if (!req.restaurant || !req.restaurant._id) {
      return errorResponse(res, 401, 'Restaurant not authenticated');
    }

    const restaurantId = req.restaurant._id;
    const restaurant = await Restaurant.findById(restaurantId).select('onboarding businessModel').lean();

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    return successResponse(res, 200, 'Onboarding data retrieved', {
      onboarding: {
        ...(restaurant.onboarding || {}),
        businessModel: restaurant.businessModel,
      },
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
      update['onboarding.step1'] = step1;
    }

    // Step2: Update if provided
    if (step2 !== undefined && step2 !== null) {
      update['onboarding.step2'] = step2;
    }

    // Step3: Update if provided
    if (step3 !== undefined && step3 !== null) {
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

    console.log('📝 Onboarding update payload:', {
      hasStep1: !!step1,
      hasStep2: step2 !== undefined,
      hasStep3: step3 !== undefined,
      hasStep4: !!step4,
      businessModel,
      completedSteps,
    });

    const restaurant = await Restaurant.findByIdAndUpdate(
      restaurantId,
      { $set: update },
      {
        new: true,
        upsert: false,
      }
    );

    if (!restaurant) {
      return errorResponse(res, 404, 'Restaurant not found');
    }

    const onboarding = restaurant.onboarding;
    const finalCompletedSteps = onboarding.completedSteps || completedSteps;



    // Sync fields to main restaurant document if onboarding steps are valid
    if (step1 || step2 || step4) {
      try {
        console.log('🔄 Syncing onboarding data to restaurant schema...');
        const syncData = {
          step1: step1 || onboarding.step1,
          step2: step2 || onboarding.step2,
          step4: step4 || onboarding.step4,
        };
        await createRestaurantFromOnboarding(syncData, restaurantId);
        console.log('✅ Onboarding data synced to restaurant schema successfully');
      } catch (syncError) {
        console.error('⚠️ Error syncing onboarding data to restaurant schema:', syncError);
        // We continue anyway so onboarding state is at least saved
      }
    }

    // Update restaurant schema when completing onboarding (step 5)
    if (finalCompletedSteps >= 5 && (step5 || businessModel)) {
      console.log('🔄 Step5/Final completed, updating restaurant schema with businessModel...');
      const modelToSave = (step5?.businessModel === 'Subscription Base' || businessModel === 'Subscription Base' || onboarding.businessModel === 'Subscription Base')
        ? 'Subscription Base'
        : 'Commission Base';

      console.log('📦 Business Model data received:', {
        businessModel: modelToSave,
      });
      try {
        const updateData = {};
        updateData.businessModel = modelToSave;

        if (Object.keys(updateData).length > 0) {
          const updated = await Restaurant.findByIdAndUpdate(restaurantId, { $set: updateData }, { new: true });
          console.log('✅ Restaurant schema updated with final data:', {
            businessModel: updated?.businessModel
          });
        }
      } catch (bmUpdateError) {
        console.error('⚠️ Error updating restaurant schema with final data:', bmUpdateError);
      }
    }

    console.log('🔍 Onboarding update check:', {
      requestCompletedSteps: completedSteps,
      savedCompletedSteps: onboarding.completedSteps,
      finalCompletedSteps,
      restaurantId: restaurantId.toString(),
      willUpdateRestaurant: finalCompletedSteps === 5,
    });

    // Update restaurant with final data if onboarding is complete (step 5)
    if (finalCompletedSteps === 5 || (step5 && completedSteps === 5)) {
      console.log('✅ Onboarding is complete (step 5), finalizing restaurant data...');

      // Fetch the complete restaurant to verify all data is saved
      const completeRestaurant = await Restaurant.findById(restaurantId).lean();

      console.log('📋 Final restaurant data verification:', {
        name: completeRestaurant?.name,
        businessModel: completeRestaurant?.businessModel
      });

      // Return success response with restaurant info
      return successResponse(res, 200, 'Onboarding data saved and restaurant updated', {
        onboarding,
        restaurant: {
          restaurantId: completeRestaurant?.restaurantId,
          _id: completeRestaurant?._id,
          name: completeRestaurant?.name,
          slug: completeRestaurant?.slug,
          isActive: completeRestaurant?.isActive,
          businessModel: completeRestaurant?.businessModel,
        },
      });
    }

    return successResponse(res, 200, 'Onboarding data saved', {
      onboarding,
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
          isActive: updatedRestaurant.isActive,
        },
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


