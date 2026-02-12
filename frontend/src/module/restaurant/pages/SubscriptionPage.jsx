import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ArrowLeft, Crown, Sparkles, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const plans = [
    {
        id: '1_month',
        name: 'Starter',
        duration: '1 Month',
        price: 999,
        perMonth: 999,
        features: [
            'Standard restaurant listing',
            'Basic analytics dashboard',
            'Email support',
            'Order management system'
        ],
        recommended: false,
        gradient: 'from-slate-600 to-slate-700',
        icon: Crown,
        popular: false
    },
    {
        id: '6_months',
        name: 'Professional',
        duration: '6 Months',
        price: 4999,
        perMonth: 833,
        save: 17,
        features: [
            'Priority restaurant listing',
            'Advanced analytics & insights',
            'Priority customer support',
            'Marketing tools & badges',
            'Featured in search results',
            'Monthly performance reports'
        ],
        recommended: true,
        gradient: 'from-orange-500 to-orange-600',
        icon: Sparkles,
        popular: true
    },
    {
        id: '12_months',
        name: 'Enterprise',
        duration: '12 Months',
        price: 8999,
        perMonth: 750,
        save: 25,
        features: [
            'Premium listing placement',
            'Full analytics suite',
            '24/7 dedicated support',
            'Zero commission period (1 month)',
            'Homepage featured spot',
            'Custom marketing campaigns',
            'API access',
            'Dedicated account manager'
        ],
        recommended: false,
        gradient: 'from-purple-600 to-purple-700',
        icon: TrendingUp,
        popular: false
    }
];

import { restaurantAPI } from '@/lib/api';

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const [submittingPlanId, setSubmittingPlanId] = useState(null);
    const [currentSubscription, setCurrentSubscription] = useState(null);
    const [restaurantData, setRestaurantData] = useState(null);

    const fetchStatus = async () => {
        try {
            const res = await restaurantAPI.getSubscriptionStatus();
            if (res.data?.data?.subscription) {
                setCurrentSubscription(res.data.data.subscription);
            }
        } catch (error) {
            console.error('Failed to fetch subscription status', error);
        }
    };

    React.useEffect(() => {
        const fetchInitialData = async () => {
            await fetchStatus();
            try {
                const res = await restaurantAPI.getRestaurantByOwner();
                if (res.data?.data?.restaurant) {
                    setRestaurantData(res.data.data.restaurant);
                }
            } catch (error) {
                console.error('Failed to fetch restaurant profile', error);
            }
        };
        fetchInitialData();
    }, []);

    const handleSubscribe = async (plan) => {
        if (submittingPlanId) return;

        console.log('Initiating subscription for plan:', plan.id);

        if (!window.Razorpay) {
            toast.error("Razorpay SDK not loaded. Please refresh the page.");
            return;
        }

        setSubmittingPlanId(plan.id);
        try {
            // 1. Create Order on Backend
            const orderRes = await restaurantAPI.createSubscriptionOrder(plan.id);
            const { orderId, amount, currency, keyId } = orderRes.data.data;

            // 2. Open Razorpay Checkout
            const options = {
                key: keyId,
                amount: amount,
                currency: currency,
                name: "GrhaPoch",
                description: `${plan.name} Subscription`,
                image: "/logo.png", // Update with your actual logo path
                order_id: orderId,
                handler: async function (response) {
                    // 3. Verify Payment on Backend
                    try {
                        const verifyRes = await restaurantAPI.verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            planId: plan.id
                        });

                        toast.success('Subscription activated successfully!');
                        setSubmittingPlanId(null);

                        // Navigate to success page with data
                        const subData = verifyRes.data.data.subscription;
                        navigate('/restaurant/subscription-success', {
                            state: {
                                planName: plan.name,
                                endDate: subData.endDate
                            }
                        });
                    } catch (error) {
                        console.error('Payment verification failed:', error);
                        toast.error('Payment verification failed. Please contact support.');
                        setSubmittingPlanId(null);
                    }
                },
                prefill: {
                    name: restaurantData?.name || "",
                    email: restaurantData?.email || "",
                    contact: restaurantData?.phone || ""
                },
                theme: {
                    color: "#F97316" // Match orange theme
                },
                modal: {
                    ondismiss: function () {
                        setSubmittingPlanId(null);
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error('Subscription error:', error);
            const errorMsg = error.response?.data?.message || 'Failed to initiate payment';
            toast.error(errorMsg);
            setSubmittingPlanId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                <div className="max-w-6xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-slate-700" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Subscription Plans</h1>
                            <p className="text-xs text-slate-500">Choose the perfect plan for your business</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Hero Section */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
                        <Crown className="w-4 h-4" />
                        <span>Unlock Premium Features</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
                        Grow Your Restaurant Business
                    </h2>
                    <p className="text-slate-600 max-w-2xl mx-auto">
                        Get access to powerful tools, priority support, and exclusive features to boost your visibility and sales.
                    </p>
                </div>

                {/* Plans Grid */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    {plans.map((plan) => {
                        const Icon = plan.icon;
                        const isCurrentPlan = currentSubscription?.planId === plan.id;
                        const status = currentSubscription?.status;
                        const isPending = status === 'pending_approval';
                        const isActive = status === 'active';
                        const isDisabled = submittingPlanId !== null || (isCurrentPlan && isPending);

                        return (
                            <motion.div
                                key={plan.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: plans.indexOf(plan) * 0.1 }}
                                className={`relative bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all ${plan.popular
                                    ? 'border-orange-500 scale-105 md:scale-110'
                                    : 'border-slate-200 hover:border-slate-300'
                                    } ${isCurrentPlan && isActive ? 'ring-4 ring-green-200' : ''}`}
                            >
                                {/* Popular Badge */}
                                {plan.popular && (
                                    <div className="absolute top-0 right-0 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-1 text-xs font-bold rounded-bl-lg">
                                        MOST POPULAR
                                    </div>
                                )}

                                {/* Current Plan Badge */}
                                {isCurrentPlan && isActive && (
                                    <div className="absolute top-0 left-0 bg-green-500 text-white px-4 py-1 text-xs font-bold rounded-br-lg">
                                        ACTIVE
                                    </div>
                                )}

                                <div className="p-6">
                                    {/* Plan Header */}
                                    <div className="mb-6">
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-4`}>
                                            <Icon className="w-6 h-6 text-white" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                                        <p className="text-sm text-slate-500">{plan.duration}</p>
                                    </div>

                                    {/* Pricing */}
                                    <div className="mb-6">
                                        <div className="flex items-baseline gap-1 mb-1">
                                            <span className="text-4xl font-bold text-slate-900">₹{plan.price.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-600">₹{plan.perMonth}/month</span>
                                            {plan.save && (
                                                <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                    Save {plan.save}%
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Features */}
                                    <div className="mb-6 space-y-3">
                                        {plan.features.map((feature, idx) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <div className="mt-0.5">
                                                    <Check className="w-5 h-5 text-green-600" />
                                                </div>
                                                <span className="text-sm text-slate-700">{feature}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* CTA Button */}
                                    <motion.button
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => handleSubscribe(plan)}
                                        disabled={isDisabled}
                                        className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${isCurrentPlan && isActive
                                            ? 'bg-green-50 text-green-700 border-2 border-green-200 cursor-default'
                                            : isCurrentPlan && isPending
                                                ? 'bg-blue-50 text-blue-700 border-2 border-blue-200 cursor-default'
                                                : plan.popular
                                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-200'
                                                    : 'bg-slate-900 text-white hover:bg-slate-800'
                                            } ${isDisabled && !isCurrentPlan ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {submittingPlanId === plan.id ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                Processing...
                                            </span>
                                        ) : isCurrentPlan && isActive ? (
                                            'Current Plan'
                                        ) : isCurrentPlan && isPending ? (
                                            'Pending Approval'
                                        ) : (
                                            'Choose Plan'
                                        )}
                                    </motion.button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Trust Indicators */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                    <div className="grid md:grid-cols-3 gap-6 text-center">
                        <div>
                            <div className="text-3xl font-bold text-orange-600 mb-1">10,000+</div>
                            <div className="text-sm text-slate-600">Active Restaurants</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-orange-600 mb-1">24/7</div>
                            <div className="text-sm text-slate-600">Customer Support</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-orange-600 mb-1">99.9%</div>
                            <div className="text-sm text-slate-600">Uptime Guarantee</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
