import { useState, useEffect } from "react"
import { Search, Check, X, ArrowUpDown, Loader2, Store, Calendar, Shield, CreditCard, Clock } from "lucide-react"
import { adminAPI } from "../../../../lib/api"
import { toast } from "sonner"

export default function RestaurantSubscriptionRequests() {
    const [activeTab, setActiveTab] = useState("pending")
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Modal state
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editPlanId, setEditPlanId] = useState("");
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        fetchRequests()
    }, [])

    const fetchRequests = async () => {
        try {
            setLoading(true)
            const res = await adminAPI.getSubscriptionRequests()
            if (res.data?.data?.requests) {
                setRequests(res.data.data.requests)
            }
        } catch (error) {
            console.error("Failed to fetch requests", error)
            toast.error("Failed to fetch subscription requests")
        } finally {
            setLoading(false)
        }
    }

    const openManageModal = (req) => {
        setSelectedRequest(req);
        setEditPlanId(req.subscription?.planId || '1_month');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setSelectedRequest(null);
        setIsModalOpen(false);
        setProcessing(false);
    };

    const handleUpdateStatus = async (status) => {
        if (!selectedRequest) return;

        setProcessing(true);
        try {
            await adminAPI.updateSubscriptionStatus(selectedRequest._id, status, editPlanId)
            toast.success(`Subscription updated to ${status}`)
            fetchRequests()
            closeModal()
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Failed to update status")
        } finally {
            setProcessing(false);
        }
    }

    const filteredRequests = requests.filter(req => {
        const status = req.subscription?.status || 'inactive';
        if (activeTab === 'pending') {
            if (status !== 'pending_approval') return false;
        } else {
            if (status === 'pending_approval') return false;
        }

        if (searchQuery) {
            return req.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                req.email?.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return true;
    })

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">Restaurant Subscriptions</h1>
                    </div>

                    <div className="flex items-center gap-2 border-b border-slate-200 mb-6">
                        <button
                            onClick={() => setActiveTab("pending")}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "pending"
                                ? "border-orange-600 text-orange-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                                }`}
                        >
                            Pending Requests
                        </button>
                        <button
                            onClick={() => setActiveTab("history")}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "history"
                                ? "border-orange-600 text-orange-600"
                                : "border-transparent text-slate-600 hover:text-slate-900"
                                }`}
                        >
                            History
                        </button>
                    </div>

                    <div className="mb-4 relative max-w-sm">
                        <input
                            type="text"
                            placeholder="Search by restaurant name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Restaurant</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Current Plan</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Requested At</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Status</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-700 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={5} className="py-10 text-center text-slate-500">Loading...</td></tr>
                                ) : filteredRequests.length === 0 ? (
                                    <tr><td colSpan={5} className="py-10 text-center text-slate-500">No requests found</td></tr>
                                ) : (
                                    filteredRequests.map(req => (
                                        <tr key={req._id}>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">{req.name}</div>
                                                <div className="text-xs text-slate-500">{req.restaurantId}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-medium">
                                                    {req.subscription?.planId?.replace('_', ' ') || 'None'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {req.subscription?.requestedAt ? new Date(req.subscription.requestedAt).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${req.subscription?.status === 'active' ? 'bg-green-100 text-green-700' :
                                                        req.subscription?.status === 'pending_approval' ? 'bg-blue-100 text-blue-700' :
                                                            req.subscription?.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {req.subscription?.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => openManageModal(req)}
                                                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                                >
                                                    Manage
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Manage Modal */}
            {isModalOpen && selectedRequest && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg">Manage Subscription</h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant</label>
                                <div className="p-3 bg-gray-50 rounded-lg text-gray-900 font-medium">{selectedRequest.name}</div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                                <select
                                    value={editPlanId}
                                    onChange={(e) => setEditPlanId(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                >
                                    <option value="1_month">1 Month</option>
                                    <option value="6_months">6 Months</option>
                                    <option value="12_months">12 Months</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">You can change the requested plan here.</p>
                            </div>

                            {selectedRequest.subscription?.status === 'pending_approval' ? (
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button
                                        onClick={() => handleUpdateStatus('rejected')}
                                        disabled={processing}
                                        className="px-4 py-2 border border-red-500 text-red-600 rounded-lg hover:bg-red-50 font-medium disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus('active')}
                                        disabled={processing}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
                                    >
                                        {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Approve & Activate'}
                                    </button>
                                </div>
                            ) : (
                                <div className="pt-2">
                                    <button
                                        onClick={() => handleUpdateStatus('active')}
                                        disabled={processing}
                                        className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:opacity-50"
                                    >
                                        {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Update Subscription'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
