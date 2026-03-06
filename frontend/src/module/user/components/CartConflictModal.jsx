import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { Button } from '@/components/ui/button';

const CartConflictModal = () => {
    const { cartConflict, resolveCartConflict } = useCart();

    if (!cartConflict) return null;

    return (
        <AnimatePresence>
            {cartConflict && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
                        onClick={() => resolveCartConflict(false)}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl z-[10000] overflow-hidden"
                    >
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                                    <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Replace cart item?
                                </h3>
                            </div>

                            <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                                Your cart already contains items from <span className="font-semibold text-gray-900 dark:text-white">"{cartConflict.existingRestaurant}"</span>.
                                Would you like to clear your cart and add this item from <span className="font-semibold text-gray-900 dark:text-white">"{cartConflict.newRestaurant}"</span> instead?
                            </p>

                            <div className="flex flex-col gap-3">
                                <Button
                                    onClick={() => resolveCartConflict(true)}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Trash2 className="w-5 h-5" />
                                    Clear Cart & Add
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={() => resolveCartConflict(false)}
                                    className="w-full h-12 rounded-xl font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                                >
                                    Keep Current Cart
                                </Button>
                            </div>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={() => resolveCartConflict(false)}
                            className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default CartConflictModal;
