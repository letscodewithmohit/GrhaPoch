import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/lib/api";

const ITEMS_PER_PAGE = 6;

const normalizeAmounts = (values, fallback = []) => {
    if (!Array.isArray(values)) return fallback;
    const normalized = [...new Set(
        values
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
    )].sort((a, b) => a - b);
    return normalized.length > 0 ? normalized : fallback;
};

const formatDateTime = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
};

export default function DonationManagement() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("donation");
    const [newAmount, setNewAmount] = useState("");

    const [donationAmounts, setDonationAmounts] = useState([]);
    const [tipAmounts, setTipAmounts] = useState([]);

    const [donations, setDonations] = useState([]);
    const [tips, setTips] = useState([]);
    const [donationTotalAmount, setDonationTotalAmount] = useState(0);
    const [tipTotalAmount, setTipTotalAmount] = useState(0);

    const [currentPage, setCurrentPage] = useState(1);

    const isDonationMode = activeTab === "donation";
    const activeAmounts = isDonationMode ? donationAmounts : tipAmounts;
    const activeRecords = isDonationMode ? donations : tips;
    const activeTotalAmount = isDonationMode ? donationTotalAmount : tipTotalAmount;

    const totalPages = useMemo(
        () => Math.max(1, Math.ceil(activeRecords.length / ITEMS_PER_PAGE)),
        [activeRecords.length]
    );

    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return activeRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [activeRecords, currentPage]);

    const startIndex = activeRecords.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, activeRecords.length);

    useEffect(() => {
        loadPageData();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, activeRecords.length]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const fetchBusinessSettings = async ({ silent = false } = {}) => {
        try {
            const response = await adminAPI.getBusinessSettings();
            const settings = response?.data?.data || response?.data || {};

            setDonationAmounts(normalizeAmounts(settings.donationAmounts, [20, 50, 100]));
            setTipAmounts(normalizeAmounts(settings.deliveryTipAmounts, [10, 20, 30]));
        } catch (error) {
            console.error("Error fetching tip/donation settings:", error);
            if (!silent) toast.error("Failed to load tip and donation settings");
        }
    };

    const fetchDonations = async ({ silent = false } = {}) => {
        try {
            const response = await adminAPI.getDonations();
            setDonations(response?.data?.data?.donations || []);
            setDonationTotalAmount(Number(response?.data?.data?.totalAmount || 0));
        } catch (error) {
            console.error("Error fetching donations:", error);
            if (!silent) toast.error("Failed to load donation history");
        }
    };

    const fetchTips = async ({ silent = false } = {}) => {
        try {
            const response = await adminAPI.getTips();
            setTips(response?.data?.data?.tips || []);
            setTipTotalAmount(Number(response?.data?.data?.totalAmount || 0));
        } catch (error) {
            console.error("Error fetching tips:", error);
            if (!silent) toast.error("Failed to load tip history");
        }
    };

    const loadPageData = async () => {
        setLoading(true);
        await Promise.all([
            fetchBusinessSettings({ silent: true }),
            fetchDonations({ silent: true }),
            fetchTips({ silent: true })
        ]);
        setLoading(false);
    };

    const handleAddAmount = () => {
        const value = Number(newAmount);
        if (!Number.isFinite(value) || value <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        if (activeAmounts.includes(value)) {
            toast.error("Amount already exists");
            return;
        }

        if (isDonationMode) {
            setDonationAmounts((prev) => [...prev, value].sort((a, b) => a - b));
        } else {
            setTipAmounts((prev) => [...prev, value].sort((a, b) => a - b));
        }
        setNewAmount("");
    };

    const handleRemoveAmount = (amount) => {
        if (isDonationMode) {
            setDonationAmounts((prev) => prev.filter((item) => item !== amount));
        } else {
            setTipAmounts((prev) => prev.filter((item) => item !== amount));
        }
    };

    const handleReset = async () => {
        await fetchBusinessSettings();
        setNewAmount("");
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            if (activeAmounts.length === 0) {
                toast.error(`At least one ${isDonationMode ? "donation" : "tip"} amount is required`);
                return;
            }

            const payload = isDonationMode
                ? { donationAmounts: activeAmounts }
                : { deliveryTipAmounts: activeAmounts };

            await adminAPI.updateBusinessSettings(payload);
            toast.success(`${isDonationMode ? "Donation" : "Tip"} settings updated successfully`);
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error(error?.response?.data?.message || "Failed to save settings");
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
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-xl lg:text-2xl font-bold text-slate-900">
                        Tip and Donation Management
                    </h1>
                </div>

                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 w-full lg:w-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab("donation")}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${isDonationMode
                            ? "bg-blue-600 text-white"
                            : "text-slate-700 hover:bg-slate-100"
                            }`}
                    >
                        Donation Management
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("tip")}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${!isDonationMode
                            ? "bg-blue-600 text-white"
                            : "text-slate-700 hover:bg-slate-100"
                            }`}
                    >
                        Tip Management
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 mb-6">
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[190px]">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Total {isDonationMode ? "Donations" : "Tips"} Collected
                    </p>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">
                        {"\u20B9"}{Number(activeTotalAmount || 0).toLocaleString("en-IN")}
                    </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[190px]">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Successful {isDonationMode ? "Donations" : "Tips"}
                    </p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{activeRecords.length}</p>
                </div>
            </div>

            <div className="max-w-2xl">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6">
                        <h3 className="text-sm font-semibold text-slate-900 mb-6">
                            Preset {isDonationMode ? "Donation" : "Tip"} Amounts
                        </h3>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {activeAmounts.map((amount) => (
                                    <div
                                        key={amount}
                                        className="group relative bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center transition-all hover:border-red-200 hover:bg-red-50"
                                    >
                                        <span className="text-lg font-bold text-slate-700 group-hover:text-red-600">
                                            {"\u20B9"}{amount}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAmount(amount)}
                                            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-6 border-t border-slate-100">
                                <label className="block text-xs font-semibold text-slate-700 mb-2">
                                    Add New Amount
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                            {"\u20B9"}
                                        </span>
                                        <input
                                            type="number"
                                            placeholder="Enter amount"
                                            value={newAmount}
                                            onChange={(e) => setNewAmount(e.target.value)}
                                            className="w-full pl-7 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        type="button"
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

                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-[11px] text-slate-500 italic">
                            * Users can also enter a custom {isDonationMode ? "donation" : "tip"} amount if they wish.
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleReset}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                Reset
                            </button>
                            <button
                                type="button"
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

            <div className="max-w-5xl mt-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-900">
                            {isDonationMode ? "Donation History" : "Tip History"}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Showing {startIndex}-{endIndex} of {activeRecords.length} {isDonationMode ? "donations" : "tips"}.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">User</th>
                                    {!isDonationMode && <th className="px-6 py-4">Rider</th>}
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Transaction ID</th>
                                    <th className="px-6 py-4">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeRecords.length > 0 ? (
                                    paginatedRecords.map((record) => {
                                        const user = record?.userId || {};
                                        const rider = record?.rider || {};
                                        const transactionLabel = record?.paymentReference || record?.razorpayPaymentId || "N/A";
                                        const paymentMethodLabel = record?.paymentMethod ? String(record.paymentMethod).toUpperCase() : "";
                                        return (
                                            <tr key={`${activeTab}-${record._id}`} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-900">{user?.name || "Anonymous"}</span>
                                                        <span className="text-slate-500">{user?.phone || user?.email || ""}</span>
                                                    </div>
                                                </td>
                                                {!isDonationMode && (
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-slate-900">{rider?.name || "Not Assigned"}</span>
                                                            <span className="text-slate-500">
                                                                {rider?.phone || rider?.deliveryId || "N/A"}
                                                            </span>
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="px-6 py-4">
                                                    <span className="font-bold text-slate-900">{"\u20B9"}{record?.amount || 0}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-mono text-slate-500">{transactionLabel}</span>
                                                        {paymentMethodLabel && (
                                                            <span className="text-[10px] text-slate-400 mt-0.5">{paymentMethodLabel}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-500">
                                                    {formatDateTime(record?.tippedAt || record?.donatedAt || record?.createdAt)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={isDonationMode ? 4 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                                            No {isDonationMode ? "donations" : "tips"} received yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {activeRecords.length > ITEMS_PER_PAGE && (
                        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-xs text-slate-500">
                                Page {currentPage} of {totalPages}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Prev
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
