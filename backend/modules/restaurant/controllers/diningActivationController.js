import Restaurant from '../models/Restaurant.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { createOrder, verifyPayment, fetchPayment } from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';

const isSubscriptionBasedModel = (businessModel = '') =>
    String(businessModel).toLowerCase().includes('subscription');

const isCommissionBasedModel = (businessModel = '') =>
    String(businessModel).toLowerCase().includes('commission');

const buildDiningActivationStatus = (restaurant, activationFeeAmount = 0) => {
    const businessModel = restaurant?.businessModel || 'None';
    const diningEnabled = Boolean(restaurant?.diningEnabled);
    const isCommissionBased = isCommissionBasedModel(businessModel);
    const isSubscriptionBased = isSubscriptionBasedModel(businessModel);

    return {
        diningEnabled,
        diningActivationPaid: Boolean(restaurant?.diningActivationPaid),
        diningActivationAmount: Number(restaurant?.diningActivationAmount) || 0,
        diningActivationDate: restaurant?.diningActivationDate || null,
        businessModel,
        activationFeeAmount: Number(activationFeeAmount) || 0,
        requiresPayment: !diningEnabled && isCommissionBased,
        canEnableWithoutPayment: !diningEnabled && isSubscriptionBased,
        restaurant: {
            name: restaurant?.name || '',
            email: restaurant?.ownerEmail || '',
            phone: restaurant?.ownerPhone || ''
        }
    };
};

const getRestaurantAndActivationFee = async (restaurantId) => {
    const [restaurant, settings] = await Promise.all([
        Restaurant.findById(restaurantId),
        BusinessSettings.getSettings()
    ]);

    return {
        restaurant,
        activationFeeAmount: Number(settings?.diningActivationFee) || 0
    };
};

export const getDiningActivationStatus = asyncHandler(async (req, res) => {
    const restaurantId = req.restaurant?._id;

    const { restaurant, activationFeeAmount } = await getRestaurantAndActivationFee(restaurantId);

    if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
    }

    return successResponse(res, 200, 'Dining activation status retrieved successfully', {
        ...buildDiningActivationStatus(restaurant, activationFeeAmount)
    });
});

export const requestDiningEnable = asyncHandler(async (req, res) => {
    const restaurantId = req.restaurant?._id;

    const { restaurant, activationFeeAmount } = await getRestaurantAndActivationFee(restaurantId);

    if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
    }

    if (restaurant.diningEnabled) {
        return successResponse(res, 200, 'Dining is already enabled for this restaurant', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    if (isSubscriptionBasedModel(restaurant.businessModel)) {
        return successResponse(res, 200, 'Dining can be enabled without any charges', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    if (isCommissionBasedModel(restaurant.businessModel)) {
        if (activationFeeAmount <= 0) {
            return errorResponse(res, 400, 'Dining activation fee is not configured by admin yet');
        }

        return successResponse(res, 200, 'Dining activation fee is required before enabling', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    return errorResponse(res, 400, 'Business model is not configured for this restaurant');
});

export const enableDiningWithoutPayment = asyncHandler(async (req, res) => {
    const restaurantId = req.restaurant?._id;

    const { restaurant, activationFeeAmount } = await getRestaurantAndActivationFee(restaurantId);

    if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
    }

    if (restaurant.diningEnabled) {
        return successResponse(res, 200, 'Dining is already enabled for this restaurant', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    if (!isSubscriptionBasedModel(restaurant.businessModel)) {
        return errorResponse(res, 400, 'Only subscription based restaurants can enable dining without payment');
    }

    restaurant.diningEnabled = true;
    restaurant.diningActivationPaid = false;
    restaurant.diningActivationAmount = 0;
    restaurant.diningActivationDate = new Date();
    await restaurant.save();

    return successResponse(res, 200, 'Dining enabled successfully without charges', {
        ...buildDiningActivationStatus(restaurant, activationFeeAmount)
    });
});

export const createDiningActivationOrder = asyncHandler(async (req, res) => {
    const restaurantId = req.restaurant?._id;

    const { restaurant, activationFeeAmount } = await getRestaurantAndActivationFee(restaurantId);

    if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
    }

    if (restaurant.diningEnabled) {
        return errorResponse(res, 400, 'Dining is already enabled for this restaurant');
    }

    if (!isCommissionBasedModel(restaurant.businessModel)) {
        return errorResponse(res, 400, 'Dining activation payment is only applicable for commission based restaurants');
    }

    if (activationFeeAmount <= 0) {
        return errorResponse(res, 400, 'Dining activation fee is not configured by admin yet');
    }

    const amountInPaise = Math.round(Number(activationFeeAmount) * 100);

    const order = await createOrder({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `dna_${restaurantId.toString().slice(-10)}_${Date.now()}`,
        notes: {
            type: 'dining_activation',
            restaurantId: restaurantId.toString(),
            restaurantName: restaurant.name || ''
        }
    });

    const credentials = await getRazorpayCredentials();

    return successResponse(res, 200, 'Dining activation order created successfully', {
        orderId: order.id,
        amount: order.amount,
        amountInRupees: Number(activationFeeAmount),
        currency: order.currency || 'INR',
        keyId: credentials.keyId || process.env.RAZORPAY_KEY_ID || ''
    });
});

export const verifyDiningActivationPayment = asyncHandler(async (req, res) => {
    const restaurantId = req.restaurant?._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return errorResponse(res, 400, 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required');
    }

    const { restaurant, activationFeeAmount } = await getRestaurantAndActivationFee(restaurantId);

    if (!restaurant) {
        return errorResponse(res, 404, 'Restaurant not found');
    }

    if (restaurant.diningEnabled && restaurant.diningActivationPaid) {
        return successResponse(res, 200, 'Dining is already activated for this restaurant', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    if (!isCommissionBasedModel(restaurant.businessModel)) {
        return errorResponse(res, 400, 'Dining activation payment is only applicable for commission based restaurants');
    }

    const isValidPayment = await verifyPayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
    );

    if (!isValidPayment) {
        return errorResponse(res, 400, 'Invalid payment signature');
    }

    let paidAmount = Number(activationFeeAmount) || 0;
    try {
        const paymentDetails = await fetchPayment(razorpay_payment_id);
        if (paymentDetails?.amount) {
            paidAmount = Number((Number(paymentDetails.amount) / 100).toFixed(2));
        }
    } catch (error) {
        // Fallback to configured amount when payment fetch fails (for mock/dev payments)
        paidAmount = Number(activationFeeAmount) || 0;
    }

    restaurant.diningEnabled = true;
    restaurant.diningActivationPaid = true;
    restaurant.diningActivationAmount = paidAmount;
    restaurant.diningActivationDate = new Date();
    await restaurant.save();

    return successResponse(res, 200, 'Dining activated successfully after payment', {
        ...buildDiningActivationStatus(restaurant, activationFeeAmount),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
    });
});
