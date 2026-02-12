import { useState, useEffect } from "react"
import { Search, Crown, Calendar, DollarSign, Edit2, Save, X } from "lucide-react"
import { adminAPI } from "../../../../lib/api"
import { toast } from "sonner"

export default function SubscriptionManagement() {
    const [restaurants, setRestaurants] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [editingId, setEditingId] = useState(null)
    const [editForm, setEditForm] = useState({
        planId: "",
        months: "",
        amount: ""
    })

    useEffect(() => {
        fetchRestaurants()
    }, [])

    const fetchRestaurants = async () => {
        try {
            setLoading(true)
            const res = await adminAPI.getSubscriptionRequests()
            if (res.data?.data?.restaurants) {
                setRestaurants(res.data.data.restaurants)
            }
        } catch (error) {
            console.error("Failed to fetch restaurants", error)
            toast.error("Failed to fetch restaurants")
        } finally {
            setLoading(false)
        }
    }

    const handleEdit = (restaurant) => {
        setEditingId(restaurant._id)
        setEditForm({
            planId: restaurant.subscription?.planId || "1_month",
            months: restaurant.subscription?.planId === "1_month" ? "1" :
                restaurant.subscription?.planId === "6_months" ? "6" : "12",
            amount: restaurant.subscription?.planId === "1_month" ? "999" :
                restaurant.subscription?.planId === "6_months" ? "4999" : "8999"
        })
    }

    const handleSave = async () => {
        if (!editingId) return

        try {
            await adminAPI.updateSubscriptionStatus(editingId, "active", editForm.planId)
            toast.success("Subscription updated successfully")
            setEditingId(null)
            fetchRestaurants()
        } catch (error) {
            console.error(error)
            toast.error(error.response?.data?.message || "Failed to update subscription")
        }
    }

    const handleCancel = () => {
        setEditingId(null)
        setEditForm({ planId: "", months: "", amount: "" })
    }

    const filteredRestaurants = restaurants.filter(restaurant => {
        if (searchQuery) {
            return restaurant.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                restaurant.email?.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return true
    })

    const getPlanDetails = (planId) => {
        switch (planId) {
            case "1_month": return { months: 1, amount: "₹999" }
            case "6_months": return { months: 6, amount: "₹4,999" }
            case "12_months": return { months: 12, amount: "₹8,999" }
            default: return { months: 0, amount: "N/A" }
        }
    }

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                            <Crown className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Subscription Management</h1>
                            <p className="text-sm text-slate-600">Manage restaurant subscription plans and pricing</p>
                        </div>
                    </div>

                    <div className="mb-6 relative max-w-sm">
                        <input
                            type="text"
                            placeholder="Search by restaurant name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Restaurant</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Current Plan</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Duration</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Amount</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Status</th>
                                    <th className="px-6 py-4 text-center text-xs font-bold text-slate-700 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={6} className="py-10 text-center text-slate-500">Loading...</td></tr>
                                ) : filteredRestaurants.length === 0 ? (
                                    <tr><td colSpan={6} className="py-10 text-center text-slate-500">No restaurants found</td></tr>
                                ) : (
                                    filteredRestaurants.map(restaurant => {
                                        const isEditing = editingId === restaurant._id
                                        const planDetails = getPlanDetails(restaurant.subscription?.planId)

                                        return (
                                            <tr key={restaurant._id} className={isEditing ? "bg-purple-50" : ""}>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-900">{restaurant.name}</div>
                                                    <div className="text-xs text-slate-500">{restaurant.email}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isEditing ? (
                                                        <select
                                                            value={editForm.planId}
                                                            onChange={(e) => {
                                                                const planId = e.target.value
                                                                setEditForm({
                                                                    planId,
                                                                    months: planId === "1_month" ? "1" : planId === "6_months" ? "6" : "12",
                                                                    amount: planId === "1_month" ? "999" : planId === "6_months" ? "4999" : "8999"
                                                                })
                                                            }}
                                                            className="px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                                        >
                                                            <option value="1_month">1 Month</option>
                                                            <option value="6_months">6 Months</option>
                                                            <option value="12_months">12 Months</option>
                                                        </select>
                                                    ) : (
                                                        <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
                                                            {restaurant.subscription?.planId?.replace('_', ' ') || 'None'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                value={editForm.months}
                                                                onChange={(e) => setEditForm({ ...editForm, months: e.target.value })}
                                                                className="w-20 px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                                            />
                                                            <span className="text-sm text-slate-600">months</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-sm text-slate-700">
                                                            <Calendar className="w-4 h-4 text-slate-400" />
                                                            {planDetails.months} {planDetails.months === 1 ? 'month' : 'months'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-slate-600">₹</span>
                                                            <input
                                                                type="number"
                                                                value={editForm.amount}
                                                                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                                                                className="w-24 px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                                                            <DollarSign className="w-4 h-4 text-green-600" />
                                                            {planDetails.amount}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${restaurant.subscription?.status === 'active' ? 'bg-green-100 text-green-700' :
                                                        restaurant.subscription?.status === 'pending_approval' ? 'bg-blue-100 text-blue-700' :
                                                            restaurant.subscription?.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {restaurant.subscription?.status || 'inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={handleSave}
                                                                className="p-1.5 bg-green-50 text-green-600 rounded-full hover:bg-green-100"
                                                                title="Save"
                                                            >
                                                                <Save size={16} />
                                                            </button>
                                                            <button
                                                                onClick={handleCancel}
                                                                className="p-1.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100"
                                                                title="Cancel"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleEdit(restaurant)}
                                                            className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100"
                                                            title="Edit"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
