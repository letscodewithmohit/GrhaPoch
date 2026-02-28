import Restaurant from '../models/Restaurant.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { createOrder, verifyPayment, fetchPayment } from '../../payment/services/razorpayService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';

export const DINING_STATUSES = {
    REQUESTED: 'Requested',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    PAYMENT_PENDING: 'Payment Pending',
    PAYMENT_SUCCESSFUL: 'Payment Successful'
};

const isSubscriptionBasedModel = (businessModel = '') =>
    String(businessModel).toLowerCase().includes('subscription');

const isCommissionBasedModel = (businessModel = '') =>
    String(businessModel).toLowerCase().includes('commission');

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

const getEffectiveDiningStatus = (restaurant) => {
    if (!restaurant) return null;
    if (restaurant.diningStatus) return restaurant.diningStatus;
    if (restaurant.diningRequested) return DINING_STATUSES.REQUESTED;
    if (restaurant.diningEnabled) return DINING_STATUSES.PAYMENT_SUCCESSFUL;
    return null;
};

const getRestaurantStatusLabel = (restaurant) => {
    const status = getEffectiveDiningStatus(restaurant);

    if (restaurant?.diningEnabled) return 'Dining Enabled';
    if (status === DINING_STATUSES.REQUESTED) return 'Pending Approval';
    if (status) return status;
    return 'Not Requested';
};

const buildDiningActivationStatus = (restaurant, activationFeeAmount = 0) => {
    const businessModel = restaurant?.businessModel || 'None';
    const diningEnabled = Boolean(restaurant?.diningEnabled);
    const isCommissionBased = isCommissionBasedModel(businessModel);
    const isSubscriptionBased = isSubscriptionBasedModel(businessModel);
    const diningStatus = getEffectiveDiningStatus(restaurant);
    const isApproved = diningStatus === DINING_STATUSES.APPROVED;
    const isEligibleForPayment =
        diningStatus === DINING_STATUSES.APPROVED || diningStatus === DINING_STATUSES.PAYMENT_PENDING;

    return {
        diningEnabled,
        diningRequested: Boolean(restaurant?.diningRequested),
        diningStatus,
        diningStatusLabel: getRestaurantStatusLabel(restaurant),
        diningRequestDate: restaurant?.diningRequestDate || null,
        diningActivationPaid: Boolean(restaurant?.diningActivationPaid),
        diningActivationAmount: Number(restaurant?.diningActivationAmount) || 0,
        diningActivationDate: restaurant?.diningActivationDate || null,
        businessModel,
        activationFeeAmount: Number(activationFeeAmount) || 0,
        requiresPayment: isEligibleForPayment && !diningEnabled && isCommissionBased,
        canEnableWithoutPayment: isApproved && !diningEnabled && isSubscriptionBased,
        restaurant: {
            name: restaurant?.name || '',
            email: restaurant?.ownerEmail || '',
            phone: restaurant?.ownerPhone || ''
        }
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

    const currentStatus = getEffectiveDiningStatus(restaurant);
    if (
        currentStatus === DINING_STATUSES.REQUESTED ||
        currentStatus === DINING_STATUSES.APPROVED ||
        currentStatus === DINING_STATUSES.PAYMENT_PENDING
    ) {
        return successResponse(res, 200, 'Dining request is already in progress', {
            ...buildDiningActivationStatus(restaurant, activationFeeAmount)
        });
    }

    restaurant.diningRequested = true;
    restaurant.diningRequestDate = new Date();
    restaurant.diningStatus = DINING_STATUSES.REQUESTED;
    restaurant.diningEnabled = false;
    restaurant.diningActivationPaid = false;

    await restaurant.save();

    return successResponse(res, 200, 'Dining enable request submitted successfully', {
        ...buildDiningActivationStatus(restaurant, activationFeeAmount)
    });
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

    if (getEffectiveDiningStatus(restaurant) !== DINING_STATUSES.APPROVED) {
        return errorResponse(res, 400, 'Dining request is not approved by admin yet');
    }

    restaurant.diningEnabled = true;
    restaurant.diningActivationPaid = false;
    restaurant.diningActivationAmount = 0;
    restaurant.diningActivationDate = new Date();
    restaurant.diningStatus = DINING_STATUSES.PAYMENT_SUCCESSFUL;
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

    const currentStatus = getEffectiveDiningStatus(restaurant);
    if (currentStatus !== DINING_STATUSES.APPROVED && currentStatus !== DINING_STATUSES.PAYMENT_PENDING) {
        return errorResponse(res, 400, 'Dining request is not approved by admin yet');
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

    restaurant.diningStatus = DINING_STATUSES.PAYMENT_PENDING;
    await restaurant.save();

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

    const currentStatus = getEffectiveDiningStatus(restaurant);
    if (currentStatus !== DINING_STATUSES.APPROVED && currentStatus !== DINING_STATUSES.PAYMENT_PENDING) {
        return errorResponse(res, 400, 'Dining request is not approved by admin yet');
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
        paidAmount = Number(activationFeeAmount) || 0;
    }

    restaurant.diningEnabled = true;
    restaurant.diningActivationPaid = true;
    restaurant.diningActivationAmount = paidAmount;
    restaurant.diningActivationDate = new Date();
    restaurant.diningStatus = DINING_STATUSES.PAYMENT_SUCCESSFUL;
    await restaurant.save();

    return successResponse(res, 200, 'Dining activated successfully after payment', {
        ...buildDiningActivationStatus(restaurant, activationFeeAmount),
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
    });
});
