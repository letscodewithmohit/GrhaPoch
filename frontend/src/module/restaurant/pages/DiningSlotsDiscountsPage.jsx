import { useEffect, useState } from "react"
import { ArrowLeft, Clock, Plus, Save, Trash2, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AnimatedPage from "@/module/user/components/AnimatedPage"
import { restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function DiningSlotsDiscountsPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [diningSlots, setDiningSlots] = useState({ lunch: [], dinner: [] })
    const [diningGuests, setDiningGuests] = useState(6)

    useEffect(() => {
        fetchSlots()
    }, [])

    const getRestaurantAuthConfig = () => {
        const token = localStorage.getItem("restaurant_accessToken") || localStorage.getItem("accessToken")
        if (!token) return {}

        return {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    }

    const fetchSlots = async () => {
        try {
            const profileRes = await restaurantAPI.getProfile(getRestaurantAuthConfig())
            if (profileRes.data?.success) {
                const restaurant = profileRes.data.data.restaurant
                setDiningSlots(restaurant.diningSlots || { lunch: [], dinner: [] })
                setDiningGuests(Number(restaurant.diningGuests) > 0 ? Number(restaurant.diningGuests) : 6)
            }
        } catch (error) {
            console.error("Failed to fetch dining slots:", error)
        } finally {
            setLoading(false)
        }
    }

    const addSlot = (type) => {
        setDiningSlots((prev) => ({
            ...prev,
            [type]: [...prev[type], { time: "", discount: "", isAvailable: true }]
        }))
    }

    const removeSlot = (type, index) => {
        setDiningSlots((prev) => ({
            ...prev,
            [type]: prev[type].filter((_, i) => i !== index)
        }))
    }

    const updateSlot = (type, index, field, value) => {
        setDiningSlots((prev) => ({
            ...prev,
            [type]: prev[type].map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
        }))
    }

    const handleSaveSlots = async () => {
        setSaving(true)
        try {
            const safeGuests = Math.max(1, Math.min(Number(diningGuests) || 1, 20))
            const normalizeSlots = (slots = []) =>
                slots
                    .filter((slot) => slot?.time && String(slot.time).trim() !== "")
                    .map((slot) => ({
                        time: String(slot.time).trim(),
                        discount: slot?.discount ? String(slot.discount).trim() : "",
                        isAvailable: slot?.isAvailable !== false
                    }))

            const res = await restaurantAPI.updateDiningSettings({
                diningSlots: {
                    lunch: normalizeSlots(diningSlots.lunch),
                    dinner: normalizeSlots(diningSlots.dinner)
                },
                diningGuests: safeGuests
            }, getRestaurantAuthConfig())
            if (res.data?.success) {
                toast.success("Dining settings updated successfully")
            }
        } catch (error) {
            console.error("Failed to save slots:", error)
            toast.error("Failed to update dining settings")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <AnimatedPage className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 border-4 border-[#ef4f5f] border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-500 font-medium">Loading...</p>
                </div>
            </AnimatedPage>
        )
    }

    return (
        <AnimatedPage className="min-h-screen bg-gray-50 pb-20">
            <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
                <div className="max-w-6xl mx-auto w-full px-4 md:px-6 h-[72px] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/restaurant/dining-management")}
                            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5 text-gray-700" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Dining Slots & Discounts</h1>
                            <p className="text-xs font-medium text-gray-500">Set available time slots and optional discounts</p>
                        </div>
                    </div>
                    <Button
                        onClick={handleSaveSlots}
                        disabled={saving}
                        className="bg-[#ef4f5f] hover:bg-[#e03f4f] text-white font-bold h-9 rounded-xl text-xs flex items-center gap-1.5 px-3"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? "Saving..." : "Save All"}
                    </Button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto w-full p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm lg:col-span-2">
                        <div className="flex items-center gap-2 mb-5 pb-5 border-b border-gray-100">
                            <Users className="w-4 h-4 text-[#ef4f5f]" />
                            <h3 className="text-sm font-bold text-gray-700">Booking Guest Limit</h3>
                        </div>

                        <div className="rounded-xl border border-gray-200 px-3 flex items-center gap-3 max-w-sm">
                            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Max Guests</span>
                            <Input
                                type="number"
                                min="1"
                                max="20"
                                value={diningGuests}
                                onChange={(e) => setDiningGuests(e.target.value)}
                                className="h-10 border-0 shadow-none focus-visible:ring-0 px-0"
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-orange-500" />
                                Lunch Slots
                            </h3>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addSlot("lunch")}
                                className="h-8 border-gray-200 text-xs font-bold rounded-lg px-2"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {diningSlots.lunch.length === 0 ? (
                                <p className="text-center py-4 text-xs text-gray-400 font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    No lunch slots added.
                                </p>
                            ) : (
                                diningSlots.lunch.map((slot, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                        <Input
                                            placeholder="Time (e.g. 12:00 PM)"
                                            value={slot.time}
                                            onChange={(e) => updateSlot("lunch", index, "time", e.target.value)}
                                            className="h-10 rounded-xl text-sm border-gray-200"
                                        />
                                        <Input
                                            placeholder="Disc (e.g. 10% OFF)"
                                            value={slot.discount}
                                            onChange={(e) => updateSlot("lunch", index, "discount", e.target.value)}
                                            className="h-10 rounded-xl text-sm sm:w-40 border-gray-200"
                                        />
                                        <button
                                            onClick={() => removeSlot("lunch", index)}
                                            className="h-9 w-9 flex-shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-500" />
                                Dinner Slots
                            </h3>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addSlot("dinner")}
                                className="h-8 border-gray-200 text-xs font-bold rounded-lg px-2"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {diningSlots.dinner.length === 0 ? (
                                <p className="text-center py-4 text-xs text-gray-400 font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                    No dinner slots added.
                                </p>
                            ) : (
                                diningSlots.dinner.map((slot, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                        <Input
                                            placeholder="Time (e.g. 7:00 PM)"
                                            value={slot.time}
                                            onChange={(e) => updateSlot("dinner", index, "time", e.target.value)}
                                            className="h-10 rounded-xl text-sm border-gray-200"
                                        />
                                        <Input
                                            placeholder="Disc (e.g. 20% OFF)"
                                            value={slot.discount}
                                            onChange={(e) => updateSlot("dinner", index, "discount", e.target.value)}
                                            className="h-10 rounded-xl text-sm sm:w-40 border-gray-200"
                                        />
                                        <button
                                            onClick={() => removeSlot("dinner", index)}
                                            className="h-9 w-9 flex-shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </AnimatedPage>
    )
}
