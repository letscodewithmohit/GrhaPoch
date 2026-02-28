import { useEffect, useState } from "react"
import { ArrowLeft, Calendar, Check, Hash, Phone, User, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import AnimatedPage from "@/module/user/components/AnimatedPage"
import { diningAPI, restaurantAPI } from "@/lib/api"
import { toast } from "sonner"

export default function TableBookingsPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [bookings, setBookings] = useState([])
    const [restaurantId, setRestaurantId] = useState("")

    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        try {
            const activationRes = await restaurantAPI.getDiningActivationStatus()
            if (!activationRes.data?.data?.diningEnabled) {
                toast.error("Complete dining activation to access this section")
                navigate("/restaurant/dining-management")
                return
            }

            const profileRes = await restaurantAPI.getProfile()
            if (profileRes.data?.success) {
                const restaurant = profileRes.data.data.restaurant
                setRestaurantId(restaurant._id)
                const res = await diningAPI.getRestaurantBookings(restaurant._id)
                if (res.data?.success) {
                    setBookings(res.data.data || [])
                }
            }
        } catch (error) {
            console.error("Failed to fetch bookings:", error)
            toast.error("Failed to load booking requests")
        } finally {
            setLoading(false)
        }
    }

    const fetchBookings = async () => {
        if (!restaurantId) return
        try {
            const res = await diningAPI.getRestaurantBookings(restaurantId)
            if (res.data?.success) {
                setBookings(res.data.data || [])
            }
        } catch (error) {
            console.error("Failed to refresh bookings:", error)
        }
    }

    const handleUpdateStatus = async (bookingId, status) => {
        try {
            const res = await diningAPI.updateBookingStatus(bookingId, status)
            if (res.data?.success) {
                toast.success(`Booking ${status.toLowerCase()} successfully`)
                fetchBookings()
            }
        } catch (error) {
            console.error("Failed to update status:", error)
            toast.error("Failed to update booking status")
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
                            <h1 className="text-lg font-bold text-gray-900">Table Bookings</h1>
                            <p className="text-xs font-medium text-gray-500">Approve or reject customer requests</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto w-full p-4 md:p-6">
                <div className="space-y-4">
                    {bookings.length === 0 ? (
                        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                            <div className="text-center py-6 text-sm text-gray-500 font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                No booking requests found.
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {bookings.map((booking) => (
                                <div key={booking._id} className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{booking.guestName}</p>
                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                    <Phone className="w-3 h-3" />
                                                    <span>{booking.guestPhone}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${booking.bookingStatus === "Confirmed"
                                                ? "bg-green-100 text-green-700"
                                                : booking.bookingStatus === "Rejected"
                                                    ? "bg-red-100 text-red-700"
                                                    : "bg-orange-100 text-orange-700"
                                                }`}
                                        >
                                            {booking.bookingStatus}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase">
                                                <Calendar className="w-3 h-3" />
                                                <span>Date & Time</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-700">{booking.date} • {booking.time}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase">
                                                <Hash className="w-3 h-3" />
                                                <span>Table No</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-700">Table {booking.tableNumber}</p>
                                        </div>
                                    </div>

                                    {booking.bookingStatus === "Pending" && (
                                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                            <Button
                                                onClick={() => handleUpdateStatus(booking._id, "Confirmed")}
                                                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold h-10 rounded-xl text-xs flex items-center justify-center gap-1.5"
                                            >
                                                <Check className="w-4 h-4" />
                                                Confirm
                                            </Button>
                                            <Button
                                                onClick={() => handleUpdateStatus(booking._id, "Rejected")}
                                                variant="outline"
                                                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 font-bold h-10 rounded-xl text-xs flex items-center justify-center gap-1.5"
                                            >
                                                <X className="w-4 h-4" />
                                                Reject
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </AnimatedPage>
    )
}
