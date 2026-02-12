import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, Calendar, ArrowRight, Home } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function SubscriptionSuccess() {
    const navigate = useNavigate();
    const location = useLocation();
    const { planName, endDate } = location.state || { planName: 'Premium', endDate: new Date() };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100"
            >
                {/* Success Banner */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-8 text-center text-white relative">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
                        className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-4 border border-white/30"
                    >
                        <CheckCircle2 className="w-10 h-10 text-white" />
                    </motion.div>
                    <h1 className="text-2xl font-bold mb-1">Payment Successful!</h1>
                    <p className="opacity-90 text-sm">Your subscription is now active</p>

                    {/* Decorative elements */}
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                        <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    </div>
                </div>

                <div className="p-8">
                    {/* Subscription Details */}
                    <div className="space-y-4 mb-8">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Plan Name</p>
                                    <p className="text-sm font-bold text-slate-900">{planName}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Valid Until</p>
                                <p className="text-sm font-bold text-slate-900">
                                    {new Date(endDate).toLocaleDateString('en-IN', {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest pl-1">Next Steps</p>
                            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group" onClick={() => navigate('/restaurant/hub-menu')}>
                                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-800">Explore Premium Features</p>
                                    <p className="text-xs text-slate-500">Access advanced analytics and marketing tools.</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                            </div>
                            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group" onClick={() => navigate('/restaurant/edit')}>
                                <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-slate-800">Update Profile</p>
                                    <p className="text-xs text-slate-500">Add high-quality images and descriptions.</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                            </div>
                        </div>
                    </div>

                    {/* Back to Home Button */}
                    <Button
                        onClick={() => navigate('/restaurant')}
                        className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2 group"
                    >
                        <Home className="w-5 h-5" />
                        Go to Dashboard
                        <motion.span
                            animate={{ x: [0, 5, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                            <ArrowRight className="w-5 h-5 ml-1" />
                        </motion.span>
                    </Button>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400 uppercase tracking-widest">
                    Transaction ID: TXN_{Math.random().toString(36).substr(2, 9).toUpperCase()}
                </div>
            </motion.div>
        </div>
    );
}
