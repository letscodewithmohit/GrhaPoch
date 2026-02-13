import { useState, useEffect } from "react"
import { Search, Crown, Check, Plus, Edit2, Trash2, X, AlertCircle, Loader2, Sparkles, TrendingUp, Eye, Phone, Mail, Calendar, CreditCard, User, Building2, MapPin, Download, FileText, FileSpreadsheet, ChevronDown } from "lucide-react"
import { exportSubscriptionsToExcel, exportSubscriptionsToPDF } from "../../components/subscription/subscriptionExportUtils"
import { adminAPI } from "../../../../lib/api"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function SubscriptionManagement() {
    const [activeTab, setActiveTab] = useState("plans") // 'plans' or 'requests'
    const [plans, setPlans] = useState([])
    const [restaurants, setRestaurants] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Plan Modal State
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState(null)
    const [planForm, setPlanForm] = useState({
        name: "",
        durationMonths: "",
        price: "",
        description: "",
        features: [""],
        isPopular: false,
        isActive: true
    })
    const [savingPlan, setSavingPlan] = useState(false)

    // View Details Modal State
    const [viewDetailsOpen, setViewDetailsOpen] = useState(false)
    const [selectedRestaurant, setSelectedRestaurant] = useState(null)

    // Fetch Initial Data
    useEffect(() => {
        fetchData()
    }, [activeTab])

    const fetchData = async () => {
        setLoading(true)
        try {
            // Always fetch plans to ensure we have mapping data
            // In a real app we might cache this or optimize, but for now this ensures consistency
            const plansRes = await adminAPI.getSubscriptionPlans()
            if (plansRes.data?.success) {
                setPlans(plansRes.data.data)
            }

            if (activeTab === "requests") {
                const res = await adminAPI.getSubscriptionRequests()
                if (res.data?.data?.restaurants) {
                    setRestaurants(res.data.data.restaurants)
                }
            }
        } catch (error) {
            console.error("Error fetching data:", error)
            toast.error("Failed to load data")
        } finally {
            setLoading(false)
        }
    }

    const getPlanName = (planId) => {
        if (!planId) return 'No Plan';
        const plan = plans.find(p => p._id === planId);
        return plan ? plan.name : planId.replace(/_/g, ' '); // Fallback to formatted ID
    }

    const getPlanDetails = (planId) => {
        if (!planId) return null;
        return plans.find(p => p._id === planId);
    }

    // Plan Management Functions
    const handleAddFeature = () => {
        setPlanForm({ ...planForm, features: [...planForm.features, ""] })
    }

    const handleRemoveFeature = (index) => {
        const newFeatures = planForm.features.filter((_, i) => i !== index)
        setPlanForm({ ...planForm, features: newFeatures })
    }

    const handleFeatureChange = (index, value) => {
        const newFeatures = [...planForm.features]
        newFeatures[index] = value
        setPlanForm({ ...planForm, features: newFeatures })
    }

    const handleEditPlan = (plan) => {
        setEditingPlan(plan)
        setPlanForm({
            name: plan.name,
            durationMonths: plan.durationMonths,
            price: plan.price,
            description: plan.description || "",
            features: plan.features && plan.features.length > 0 ? plan.features : [""],
            isPopular: plan.isPopular || false,
            isActive: plan.isActive
        })
        setIsPlanModalOpen(true)
    }

    const handleCreatePlan = () => {
        setEditingPlan(null)
        setPlanForm({
            name: "",
            durationMonths: "",
            price: "",
            description: "",
            features: [""],
            isPopular: false,
            isActive: true
        })
        setIsPlanModalOpen(true)
    }

    const handleSavePlan = async () => {
        if (!planForm.name || !planForm.durationMonths || !planForm.price) {
            toast.error("Please fill in all required fields")
            return
        }

        const features = planForm.features.filter(f => f.trim() !== "")
        if (features.length === 0) {
            toast.error("Please add at least one feature")
            return
        }

        setSavingPlan(true)
        try {
            const payload = {
                ...planForm,
                durationMonths: Number(planForm.durationMonths),
                price: Number(planForm.price),
                features
            }

            if (editingPlan) {
                await adminAPI.updateSubscriptionPlan(editingPlan._id, payload)
                toast.success("Plan updated successfully")
            } else {
                await adminAPI.createSubscriptionPlan(payload)
                toast.success("Plan created successfully")
            }
            setIsPlanModalOpen(false)
            fetchData()
        } catch (error) {
            console.error("Error saving plan:", error)
            toast.error(error.response?.data?.message || "Failed to save plan")
        } finally {
            setSavingPlan(false)
        }
    }

    const handleDeletePlan = async (id) => {
        if (!window.confirm("Are you sure you want to delete this plan?")) return
        try {
            await adminAPI.deleteSubscriptionPlan(id)
            toast.success("Plan deleted successfully")
            fetchData()
        } catch (error) {
            console.error("Error deleting plan:", error)
            toast.error("Failed to delete plan")
        }
    }

    const handleTogglePlanStatus = async (id) => {
        try {
            await adminAPI.toggleSubscriptionPlanStatus(id)
            toast.success("Plan status updated")
            fetchData()
        } catch (error) {
            console.error("Error toggling status:", error)
            toast.error("Failed to update status")
        }
    }

    const handleViewDetails = (restaurant) => {
        setSelectedRestaurant(restaurant)
        setViewDetailsOpen(true)
    }

    // Restaurant List Functions
    const filteredRestaurants = restaurants.filter(restaurant => {
        // Filter out empty or inactive subscriptions
        if (!restaurant.subscription?.planId || restaurant.subscription?.status === 'inactive') {
            return false
        }

        if (searchQuery) {
            return restaurant.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                restaurant.email?.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return true
    })

    const handleCancelSubscription = async (restaurant) => {
        if (!window.confirm(`Are you sure you want to cancel the subscription for ${restaurant.name}?`)) return

        try {
            await adminAPI.updateSubscriptionStatus(restaurant._id || restaurant.id, 'inactive')
            toast.success("Subscription cancelled successfully")
            // Refresh list
            if (activeTab === "requests") {
                const res = await adminAPI.getSubscriptionRequests()
                if (res.data?.data?.restaurants) {
                    setRestaurants(res.data.data.restaurants)
                }
            }
        } catch (error) {
            console.error("Error cancelling subscription:", error)
            toast.error("Failed to cancel subscription")
        }
    }

    const handleExport = (type) => {
        const dataToExport = filteredRestaurants.length > 0 ? filteredRestaurants : restaurants
        if (type === 'excel') {
            exportSubscriptionsToExcel(dataToExport, plans, "subscription_list")
        } else if (type === 'pdf') {
            exportSubscriptionsToPDF(dataToExport, plans, "subscription_list")
        }
    }

    return (
        <div className="p-4 lg:p-8 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                            <Crown className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
                            <p className="text-slate-500">Manage pricing tiers and restaurant subscriptions</p>
                        </div>
                    </div>

                    <div className="flex bg-slate-100/50 p-1.5 rounded-xl border border-slate-200">
                        <button
                            onClick={() => setActiveTab("plans")}
                            className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === "plans"
                                ? "bg-white shadow-sm text-slate-900 ring-1 ring-slate-200"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                }`}
                        >
                            Plans Overview
                        </button>
                        <button
                            onClick={() => setActiveTab("requests")}
                            className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === "requests"
                                ? "bg-white shadow-sm text-slate-900 ring-1 ring-slate-200"
                                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                }`}
                        >
                            Subscribers
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                {activeTab === "plans" ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-800">Available Plans</h2>
                            <Button
                                onClick={handleCreatePlan}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 transition-all hover:-translate-y-0.5"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Create Plan
                            </Button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                            </div>
                        ) : plans.length === 0 ? (
                            <Card className="border-dashed border-2 py-12 bg-slate-50/50">
                                <div className="text-center space-y-3">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Sparkles className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="text-xl font-medium text-slate-900">No active plans</h3>
                                    <p className="text-slate-500 max-w-sm mx-auto">
                                        Start by creating flexible subscription tiers for your restaurant partners.
                                    </p>
                                    <Button onClick={handleCreatePlan} variant="outline" className="mt-4">
                                        Create First Plan
                                    </Button>
                                </div>
                            </Card>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {plans.map((plan) => (
                                    <Card
                                        key={plan._id}
                                        className={`relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 ${plan.isPopular ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-indigo-100' : 'border-slate-200'
                                            }`}
                                    >
                                        {plan.isPopular && (
                                            <div className="absolute top-0 right-0">
                                                <div className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm">
                                                    MOST POPULAR
                                                </div>
                                            </div>
                                        )}

                                        <CardContent className="p-0">
                                            <div className="p-6 space-y-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                                                        <p className="text-slate-500 text-sm font-medium">
                                                            {plan.durationMonths} {plan.durationMonths === 1 ? 'Month' : 'Months'} Duration
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={`border-0 font-medium ${plan.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-600"}`}
                                                    >
                                                        {plan.isActive ? 'Active' : 'Draft'}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl font-bold text-slate-900">₹{plan.price.toLocaleString()}</span>
                                                    <span className="text-slate-500 text-sm font-medium">/period</span>
                                                </div>

                                                {plan.description && (
                                                    <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5em]">
                                                        {plan.description}
                                                    </p>
                                                )}

                                                <div className="h-px bg-slate-100 my-4" />

                                                <div className="space-y-3 pt-2">
                                                    {plan.features.slice(0, 4).map((feature, idx) => (
                                                        <div key={idx} className="flex items-start gap-3">
                                                            <div className="mt-1 w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                                                <Check className="w-2.5 h-2.5 text-green-600" />
                                                            </div>
                                                            <span className="text-sm text-slate-600 leading-tight">{feature}</span>
                                                        </div>
                                                    ))}
                                                    {plan.features.length > 4 && (
                                                        <div className="text-xs text-slate-400 font-medium pl-7">
                                                            + {plan.features.length - 4} more features
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-slate-50/50 p-4 border-t border-slate-100 grid grid-cols-3 gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-slate-600 hover:text-slate-900 border-slate-200"
                                                    onClick={() => handleEditPlan(plan)}
                                                >
                                                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`w-full border-slate-200 ${plan.isActive
                                                        ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                                        : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                                        }`}
                                                    onClick={() => handleTogglePlanStatus(plan._id)}
                                                >
                                                    {plan.isActive ? 'Suspend' : 'Activate'}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-slate-200"
                                                    onClick={() => handleDeletePlan(plan._id)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="relative w-full max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Search by restaurant or email..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 w-full bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="hidden sm:flex items-center gap-2 border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm"
                                            disabled={restaurants.length === 0}
                                        >
                                            <Download className="w-4 h-4" /> Export <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200">
                                        <DropdownMenuLabel>Export As</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleExport('excel')} className="cursor-pointer hover:bg-slate-50">
                                            <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" /> Excel (.xls)
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer hover:bg-slate-50">
                                            <FileText className="w-4 h-4 mr-2 text-red-600" /> PDF (.file)
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                <span className="text-sm text-slate-500 font-medium">Showing {filteredRestaurants.length} results</span>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50/80 border-b border-slate-200 text-left">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan Details</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timeline</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={5} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" /></td></tr>
                                    ) : filteredRestaurants.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                                        <Search className="w-6 h-6 text-slate-400" />
                                                    </div>
                                                    <p className="text-slate-500 font-medium">No subscribed restaurants found</p>
                                                    <p className="text-slate-400 text-sm mt-1">Try adjusting your search terms</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRestaurants.map((res) => (
                                            <tr key={res._id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg">
                                                            {res.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-900">{res.name}</div>
                                                            <div className="text-xs text-slate-500">{res.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className="font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
                                                        {getPlanName(res.subscription?.planId)}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 text-sm text-slate-600">
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                                            Start: {res.subscription?.startDate ? new Date(res.subscription.startDate).toLocaleDateString() : '-'}
                                                        </span>
                                                        <span className="flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                                            End: {res.subscription?.endDate ? new Date(res.subscription.endDate).toLocaleDateString() : '-'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge className={`capitalize
                                                        ${res.subscription?.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                                            res.subscription?.status === 'expired' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                                                                'bg-slate-100 text-slate-700'}
                                                    `}>
                                                        {res.subscription?.status || 'Inactive'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-slate-400 hover:text-slate-600"
                                                        onClick={() => handleViewDetails(res)}
                                                    >
                                                        <Eye className="w-4 h-4 mr-1" /> View Details
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 ml-1"
                                                        onClick={() => handleCancelSubscription(res)}
                                                        title="Cancel Subscription"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Plan Modal */}
            <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
                <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden bg-white rounded-2xl border-0 shadow-2xl">
                    <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <Sparkles className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-slate-900">
                                    {editingPlan ? 'Edit Subscription Plan' : 'Create New Plan'}
                                </DialogTitle>
                                <DialogDescription className="text-slate-500 text-sm mt-0.5">
                                    Configure the details and features for this pricing tier.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Plan Name</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. Starter Plan"
                                    value={planForm.name}
                                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                                    className="h-10 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="price" className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Price (₹)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₹</span>
                                    <Input
                                        id="price"
                                        type="number"
                                        placeholder="999"
                                        value={planForm.price}
                                        onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                                        className="pl-8 h-10 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50/80 rounded-xl border border-slate-100">
                            <div className="space-y-2">
                                <Label htmlFor="duration" className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Duration (Months)</Label>
                                <Input
                                    id="duration"
                                    type="number"
                                    placeholder="1"
                                    value={planForm.durationMonths}
                                    onChange={(e) => setPlanForm({ ...planForm, durationMonths: e.target.value })}
                                    className="h-10 bg-white border-slate-200"
                                />
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-lg border border-slate-200 w-full hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setPlanForm({ ...planForm, isPopular: !planForm.isPopular })}>
                                    <Switch
                                        id="popular"
                                        checked={planForm.isPopular}
                                        onCheckedChange={(checked) => setPlanForm({ ...planForm, isPopular: checked })}
                                        className="data-[state=checked]:bg-indigo-600"
                                    />
                                    <Label htmlFor="popular" className="cursor-pointer font-medium text-slate-700 flex-1">Mask as Popular</Label>
                                    {planForm.isPopular && <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Brief description of what this plan offers..."
                                value={planForm.description}
                                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                                className="min-h-[80px] border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20 resize-none"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Plan Features</Label>
                                <span className="text-xs text-slate-400">{planForm.features.length} features added</span>
                            </div>

                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                {planForm.features.map((feature, index) => (
                                    <div key={index} className="flex gap-2 group">
                                        <div className="relative flex-1">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-300 group-focus-within:bg-indigo-500 transition-colors"></div>
                                            <Input
                                                value={feature}
                                                onChange={(e) => handleFeatureChange(index, e.target.value)}
                                                placeholder={`Detailed feature description ${index + 1}`}
                                                className="pl-7 border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10"
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleRemoveFeature(index)}
                                            disabled={planForm.features.length === 1}
                                            className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddFeature}
                                className="w-full border-dashed border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-all py-4"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Add Another Feature
                            </Button>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsPlanModalOpen(false)}
                            className="text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSavePlan}
                            disabled={savingPlan}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 px-6"
                        >
                            {savingPlan ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {editingPlan ? 'Save Changes' : 'Create Plan'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Details Modal */}
            <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
                <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
                    <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                        <DialogTitle className="text-xl font-bold text-slate-900">Subscription Details</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Comprehensive view of restaurant's subscription status
                        </DialogDescription>
                    </DialogHeader>

                    {selectedRestaurant && (
                        <div className="p-6">
                            {/* Profile Header */}
                            <div className="flex items-start gap-5 mb-8">
                                <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-3xl shadow-sm border border-orange-200">
                                    {selectedRestaurant.name.charAt(0)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h3 className="text-2xl font-bold text-slate-900">{selectedRestaurant.name}</h3>
                                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                                        <div className="flex items-center gap-1.5">
                                            <Mail className="w-4 h-4 text-slate-400" />
                                            {selectedRestaurant.email}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Phone className="w-4 h-4 text-slate-400" />
                                            {selectedRestaurant.phone || "N/A"}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 font-normal">
                                            ID: {selectedRestaurant._id}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Subscription Info Card */}
                                <Card className="border-slate-200 shadow-sm">
                                    <CardContent className="p-5 space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Crown className="w-5 h-5 text-indigo-600" />
                                            <h4 className="font-semibold text-slate-900">Current Plan</h4>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Plan Name</div>
                                                <div className="font-medium text-slate-900 flex justify-between items-center">
                                                    {getPlanName(selectedRestaurant.subscription?.planId)}
                                                    <Badge className={selectedRestaurant.subscription?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                                        {selectedRestaurant.subscription?.status || 'Inactive'}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Start Date</div>
                                                    <div className="text-sm font-medium text-slate-900">
                                                        {selectedRestaurant.subscription?.startDate ? new Date(selectedRestaurant.subscription.startDate).toLocaleDateString() : 'N/A'}
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                    <div className="text-xs text-slate-500 uppercase font-semibold mb-1">End Date</div>
                                                    <div className="text-sm font-medium text-slate-900">
                                                        {selectedRestaurant.subscription?.endDate ? new Date(selectedRestaurant.subscription.endDate).toLocaleDateString() : 'N/A'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Payment Info Card */}
                                <Card className="border-slate-200 shadow-sm">
                                    <CardContent className="p-5 space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CreditCard className="w-5 h-5 text-indigo-600" />
                                            <h4 className="font-semibold text-slate-900">Payment Details</h4>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Transaction ID</div>
                                                <div className="flex items-center gap-2 font-mono text-sm bg-slate-50 p-2 rounded border border-slate-100 text-slate-600 break-all">
                                                    {selectedRestaurant.subscription?.paymentId || 'N/A'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Order ID</div>
                                                <div className="flex items-center gap-2 font-mono text-sm bg-slate-50 p-2 rounded border border-slate-100 text-slate-600 break-all">
                                                    {selectedRestaurant.subscription?.orderId || 'N/A'}
                                                </div>
                                            </div>

                                            <div className="pt-2">
                                                <div className="text-xs text-slate-500 text-center italic">
                                                    Payment processed securely via Razorpay
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                        <Button
                            onClick={() => setViewDetailsOpen(false)}
                            className="bg-slate-900 text-white hover:bg-slate-800"
                        >
                            Close Details
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
