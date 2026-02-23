import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft, Crown, Sparkles, TrendingUp, Loader2, History, Calendar, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { restaurantAPI } from '@/lib/api';

const ICONS = {
    'Starter': Crown,
    'Professional': Sparkles,
    'Enterprise': TrendingUp
};

const GRADIENTS = {
    'Starter': 'from-blue-500 to-indigo-600',
    'Professional': 'from-orange-500 to-amber-600',
    'Enterprise': 'from-purple-600 to-fuchsia-600'
};

const DEFAULT_ICON = Crown;
const DEFAULT_GRADIENT = 'from-slate-700 to-slate-900';

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submittingPlanId, setSubmittingPlanId] = useState(null);
    const [currentSubscription, setCurrentSubscription] = useState(null);
    const [restaurantData, setRestaurantData] = useState(null);
    const [subscriptionMeta, setSubscriptionMeta] = useState({ daysRemaining: null, showWarning: false, warningDays: 5 });
    const [subscriptionHistory, setSubscriptionHistory] = useState([]);
    const [businessModel, setBusinessModel] = useState(null);


    const fetchStatus = async () => {
        try {
            const res = await restaurantAPI.getSubscriptionStatus();
            const data = res.data?.data;
            if (data?.subscription) {
                setCurrentSubscription(data.subscription);
            }
            setBusinessModel(data?.businessModel || null);
            setSubscriptionMeta({
                daysRemaining: data?.daysRemaining ?? null,
                showWarning: data?.showWarning ?? false,
                warningDays: data?.warningDays ?? 5
            });
            if (Array.isArray(data?.subscriptionHistory)) {
                setSubscriptionHistory(data.subscriptionHistory);
            }
        } catch (error) {
            console.error('Failed to fetch subscription status', error);
        }
    };

    const fetchPlans = async () => {
        try {
            const res = await restaurantAPI.getSubscriptionPlans();
            if (res.data?.success) {
                const fetchedPlans = res.data.data.map(plan => ({
                    ...plan,
                    id: plan._id, // Map _id to id for easier usage
                    icon: ICONS[plan.name] || DEFAULT_ICON,
                    gradient: GRADIENTS[plan.name] || DEFAULT_GRADIENT,
                    perMonth: Math.round(plan.price / plan.durationMonths),
                }));
                // Sort by price or other factors if needed
                setPlans(fetchedPlans);
            }
        } catch (error) {
            console.error('Failed to fetch subscription plans', error);
            toast.error('Failed to load subscription plans');
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            await Promise.all([fetchStatus(), fetchPlans()]);
            try {
                if (restaurantAPI.getRestaurantByOwner) {
                    const ownerRes = await restaurantAPI.getRestaurantByOwner();
                    if (ownerRes.data?.data?.restaurant) {
                        setRestaurantData(ownerRes.data.data.restaurant);
                    }
                } else {
                    const meRes = await restaurantAPI.getCurrentRestaurant();
                    if (meRes.data?.data?.restaurant) {
                        setRestaurantData(meRes.data.data.restaurant);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch restaurant profile', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const handleSubscribe = async (plan) => {
        if (submittingPlanId) return;

        // Restriction: Cannot switch plans if one is already active (unless it's nearing expiry)
        const isNearExpiry = subscriptionMeta.showWarning;
        if (currentSubscription && currentSubscription.status === 'active' && !isNearExpiry) {
            const endDate = currentSubscription.endDate
                ? new Date(currentSubscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                : null;
            const warningDays = subscriptionMeta.warningDays ?? 5;
            const endDatePart = endDate ? ` Your plan expires on ${endDate}.` : '';
            toast.info(`You already have an active subscription.${endDatePart} You can switch plans in the last ${warningDays} day${warningDays !== 1 ? 's' : ''} before expiry.`);
            return;
        }

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
                name: "GrhaPoch Partner",
                description: `${plan.name} Subscription`,
                image: "/logo.png",
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
                    color: "#4F46E5" // Indigo primary color
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

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <p className="text-slate-500 font-medium animate-pulse">Loading best plans for you...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Header */}
            <div className="bg-white sticky top-0 z-30 border-b border-slate-200/80 backdrop-blur-md bg-white/90">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-slate-800"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">Subscription Plans</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-10 pb-20">
                {/* Hero Section */}
                <div className="text-center mb-10 space-y-4">
                    {/* Active Plan Indicator for Commission Base */}
                    {(!currentSubscription || currentSubscription.status !== 'active') && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg border border-amber-200"
                        >
                            <span className="font-semibold">Current Plan:</span> Commission Based
                        </motion.div>
                    )}

                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-2xl md:text-3xl font-bold text-slate-900 mt-8"
                    >
                        Choose Your Business Plan
                    </motion.h2>
                </div>

                {/* Plans Grid */}
                {plans.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Crown className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-medium text-slate-900">No active plans available</h3>
                        <p className="text-slate-500 mt-2">Please check back later or contact support.</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16 max-w-6xl mx-auto">
                        <AnimatePresence>
                            {plans.map((plan, index) => {
                                const Icon = plan.icon;
                                const isCurrentPlan = currentSubscription?.planId?.toString() === plan.id?.toString();
                                const status = currentSubscription?.status;
                                const isPending = status === 'pending_approval';
                                const isActive = status === 'active';
                                const isDisabled = submittingPlanId !== null || (isCurrentPlan && isPending);
                                const isPopular = plan.isPopular;

                                return (
                                    <motion.div
                                        key={plan.id}
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1, type: "spring", stiffness: 50 }}
                                        whileHover={{ y: -8, transition: { duration: 0.2 } }}
                                        className={`relative group bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 overflow-hidden border transition-all duration-300 flex flex-col 
                                            ${isPopular ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-100 hover:border-slate-300'}
                                            ${isCurrentPlan && isActive ? 'ring-4 ring-green-500/20 border-green-500' : ''}
                                        `}
                                    >
                                        {/* Ribbon for Popular */}
                                        {isPopular && (
                                            <div className="absolute top-6 right-0 bg-gradient-to-l from-indigo-600 to-violet-600 text-white text-xs font-bold px-4 py-1.5 rounded-l-full shadow-lg z-10">
                                                MOST POPULAR
                                            </div>
                                        )}

                                        {/* Ribbon for Active */}
                                        {isCurrentPlan && isActive && (
                                            <div className="absolute top-6 left-0 bg-green-500 text-white text-xs font-bold px-4 py-1.5 rounded-r-full shadow-lg z-10 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> ACTIVE PLAN
                                            </div>
                                        )}

                                        <div className="p-8 pb-0">
                                            {/* Icon Header */}
                                            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-6 shadow-lg shadow-indigo-100 group-hover:scale-110 transition-transform duration-300`}>
                                                <Icon className="w-7 h-7 text-white" />
                                            </div>

                                            <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                                            <div className="text-slate-500 font-medium mb-6 flex items-center gap-2">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded text-xs uppercase tracking-wide">{plan.durationMonths} Month{plan.durationMonths > 1 ? 's' : ''} Access</span>
                                            </div>

                                            {/* Price */}
                                            <div className="flex items-baseline gap-1 mb-8">
                                                <span className="text-5xl font-extrabold text-slate-900 tracking-tight">₹{plan.price.toLocaleString()}</span>
                                                <span className="text-slate-400 font-medium text-lg">/total</span>
                                            </div>

                                            <div className="w-full h-px bg-slate-100 mb-8"></div>

                                            {/* Features list */}
                                            <div className="space-y-4 mb-8">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Everything Included</p>
                                                <div className="flex items-start gap-3 text-slate-600 group/item">
                                                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5 group-hover/item:bg-indigo-500 group-hover/item:text-white transition-colors">
                                                        <Check className="w-3 h-3 text-indigo-600 group-hover/item:text-white" />
                                                    </div>
                                                    <span className="font-bold text-slate-900">Unlimited Menu Items</span>
                                                </div>
                                                {plan.features.map((feature, idx) => (
                                                    <div key={idx} className="flex items-start gap-3 text-slate-600 group/item">
                                                        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5 group-hover/item:bg-green-500 group-hover/item:text-white transition-colors">
                                                            <Check className="w-3 h-3 text-green-600 group-hover/item:text-white" />
                                                        </div>
                                                        <span className="font-medium">{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <div className="p-8 pt-0 mt-auto">
                                            <button
                                                onClick={() => handleSubscribe(plan)}
                                                disabled={isDisabled || (isCurrentPlan && isActive)}
                                                className={`w-full py-4 rounded-xl font-bold text-base transition-all transform active:scale-95 shadow-md flex items-center justify-center gap-2
                                                    ${isCurrentPlan && isActive
                                                        ? 'bg-green-100 text-green-800 border-2 border-green-500 cursor-default'
                                                        : isPopular
                                                            ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:shadow-lg hover:shadow-indigo-200'
                                                            : 'bg-slate-900 text-white hover:bg-slate-800'
                                                    } 
                                                    ${isDisabled && !isCurrentPlan ? 'opacity-50 cursor-not-allowed' : ''}
                                                `}
                                            >
                                                {submittingPlanId === plan.id ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        Processing...
                                                    </>
                                                ) : isCurrentPlan && isActive ? (
                                                    <><Check className="w-5 h-5" /> Current Active Plan</>
                                                ) : (
                                                    <>Get Started <ArrowLeft className="w-4 h-4 rotate-180" /></>
                                                )}
                                            </button>

                                            {!isActive && !isDisabled && (
                                                <p className="text-center text-xs text-slate-400 mt-4 font-medium">Secured by Razorpay</p>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}


                {/* My Subscriptions Section — only shows when there is an active plan OR real history */}
                {(currentSubscription?.status === 'active' || subscriptionHistory.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="max-w-4xl mx-auto mt-10 mb-16 px-4"
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2 bg-slate-100 rounded-xl">
                                <History className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">My Subscriptions</h3>
                                <p className="text-sm text-slate-500">Your current and past subscription plans</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Current Active Plan — only shown when actually active */}
                            {currentSubscription?.status === 'active' && currentSubscription?.planId && (
                                <div className="bg-white rounded-2xl border-2 border-green-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                                        <Crown className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="font-bold text-slate-900 text-sm">{currentSubscription.planName || 'Current Plan'}</span>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${currentSubscription.status === 'active'
                                                ? 'bg-green-100 text-green-700'
                                                : currentSubscription.status === 'expired'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {currentSubscription.status === 'active' ? '✓ Active' : currentSubscription.status}
                                            </span>
                                            {subscriptionMeta.daysRemaining !== null && currentSubscription.status === 'active' && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subscriptionMeta.showWarning ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
                                                    }`}>
                                                    {subscriptionMeta.daysRemaining} day{subscriptionMeta.daysRemaining !== 1 ? 's' : ''} remaining
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {currentSubscription.startDate
                                                    ? new Date(currentSubscription.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : 'N/A'}
                                                {' → '}
                                                {currentSubscription.endDate
                                                    ? new Date(currentSubscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                    {currentSubscription.paymentId && (
                                        <div className="text-xs text-slate-400 font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 truncate max-w-[180px]" title={currentSubscription.paymentId}>
                                            {currentSubscription.paymentId}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Past Plans */}
                            {subscriptionHistory.map((entry, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.07 }}
                                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                        <RefreshCw className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="font-bold text-slate-700 text-sm">{entry.planName || 'Plan'}</span>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.status === 'renewed' ? 'bg-blue-100 text-blue-700'
                                                : entry.status === 'expired' ? 'bg-red-100 text-red-700'
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {entry.status === 'renewed' ? 'Renewed' : entry.status === 'expired' ? 'Expired' : entry.status}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {entry.startDate ? new Date(entry.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                                {' → '}
                                                {entry.endDate ? new Date(entry.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                    {entry.paymentId && (
                                        <div className="text-xs text-slate-400 font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 truncate max-w-[180px]" title={entry.paymentId}>
                                            {entry.paymentId}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}


            </div>
        </div >
    );
}
