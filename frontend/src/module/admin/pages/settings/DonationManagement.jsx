import { useState, useEffect } from "react";
import { Info, Loader2, Plus, Trash2, Heart } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/lib/api";

export default function DonationManagement() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [amounts, setAmounts] = useState([]);
    const [newAmount, setNewAmount] = useState("");
    const [donations, setDonations] = useState([]);
    const [totalAmount, setTotalAmount] = useState(0);

    useEffect(() => {
        fetchDonationSettings();
        fetchDonations();
    }, []);

    const fetchDonations = async () => {
        try {
            const response = await adminAPI.getDonations();
            setDonations(response?.data?.data?.donations || []);
            setTotalAmount(response?.data?.data?.totalAmount || 0);
        } catch (error) {
            console.error("Error fetching donations:", error);
        }
    };

    const fetchDonationSettings = async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getBusinessSettings();
            const settings = response?.data?.data || response?.data;
            if (settings?.donationAmounts) {
                setAmounts(settings.donationAmounts.sort((a, b) => a - b));
            } else {
                setAmounts([20, 50, 100]);
            }
        } catch (error) {
            console.error("Error fetching donation settings:", error);
            toast.error("Failed to load donation settings");
        } finally {
            setLoading(false);
        }
    };

    const handleAddAmount = () => {
        const val = parseFloat(newAmount);
        if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }
        if (amounts.includes(val)) {
            toast.error("Amount already exists");
            return;
        }
        setAmounts(prev => [...prev, val].sort((a, b) => a - b));
        setNewAmount("");
    };

    const handleRemoveAmount = (amount) => {
        setAmounts(prev => prev.filter(a => a !== amount));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            if (amounts.length === 0) {
                toast.error("At least one donation amount is required");
                return;
            }
            await adminAPI.updateBusinessSettings({ donationAmounts: amounts });
            toast.success("Donation settings updated successfully");
        } catch (error) {
            console.error("Error saving donation settings:", error);
            toast.error(error?.response?.data?.message || "Failed to save donation settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            {/* Page header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Heart className="w-6 h-6 text-red-500 fill-current" />
                        Donation Management
                    </h1>
                    <p className="text-xs lg:text-sm text-slate-500 mt-1">
                        Configure preset donation amounts shown to users in their profile.
                    </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3 max-w-md">
                    <div className="mt-0.5">
                        <Info className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="text-xs lg:text-sm text-slate-700">
                        <p className="font-semibold text-amber-700 mb-0.5">Note</p>
                        <p>Users will see these amounts as quick-select options in the donation popup.</p>
                    </div>
                </div>
            </div>

            <div className="max-w-2xl">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6">
                        <h3 className="text-sm font-semibold text-slate-900 mb-6">Preset Donation Amounts</h3>

                        <div className="space-y-6">
                            {/* Current Amounts Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {amounts.map((amount) => (
                                    <div
                                        key={amount}
                                        className="group relative bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center transition-all hover:border-red-200 hover:bg-red-50"
                                    >
                                        <span className="text-lg font-bold text-slate-700 group-hover:text-red-600">₹{amount}</span>
                                        <button
                                            onClick={() => handleRemoveAmount(amount)}
                                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add New Amount */}
                            <div className="pt-6 border-t border-slate-100">
                                <label className="block text-xs font-semibold text-slate-700 mb-2">Add New Amount</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                        <input
                                            type="number"
                                            placeholder="Enter amount"
                                            value={newAmount}
                                            onChange={(e) => setNewAmount(e.target.value)}
                                            className="w-full pl-7 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddAmount}
                                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer with actions */}
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-[11px] text-slate-500 italic">
                            * Users can also enter a custom amount if they wish.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={fetchDonationSettings}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                Reset
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    "Save Changes"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Donation History Table */}
            <div className="max-w-4xl mt-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Donation History</h3>
                            <p className="text-xs text-slate-500 mt-1">Recently received contributions from users.</p>
                        </div>
                        <div className="bg-green-50 px-4 py-2 rounded-lg border border-green-100 flex flex-col items-end">
                            <span className="text-[10px] font-medium text-green-600 uppercase tracking-wider">Total Collected</span>
                            <p className="text-xl font-bold text-green-700">₹{totalAmount.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {donations.length > 0 ? (
                                    donations.map((donation) => (
                                        <tr key={donation._id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-900">{donation.userId?.name || "Anonymous"}</span>
                                                    <span className="text-slate-500">{donation.userId?.phone || donation.userId?.email || ""}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-bold text-slate-900">₹{donation.amount}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-slate-400">{donation.razorpayPaymentId || "N/A"}</span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {new Date(donation.donatedAt || donation.createdAt).toLocaleDateString(undefined, {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-slate-400 italic">
                                            No donations received yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
