import { useState, useEffect } from "react"
import { UtensilsCrossed, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import api from "@/lib/api"
import { getModuleToken } from "@/lib/utils/auth"
import { Button } from "@/components/ui/button"

export default function DiningBookings() {
    const [bookings, setBookings] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)

    const getAuthConfig = (additionalConfig = {}) => {
        const adminToken = getModuleToken('admin')
        if (!adminToken) return additionalConfig
        return {
            ...additionalConfig,
            headers: {
                ...additionalConfig.headers,
                Authorization: `Bearer ${adminToken.trim()}`,
            }
        }
    }

    const fetchAllBookings = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await api.get('/admin/dining/bookings/all', getAuthConfig());
            if (response.data.success) {
                setBookings(response.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch all bookings:", err);
            setError("Failed to load bookings");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchAllBookings()
    }, [])

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                                <UtensilsCrossed className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">Dining Bookings</h1>
                                <p className="text-sm text-slate-600 mt-1">Manage all dining table reservations across restaurants</p>
                            </div>
                        </div>
                        <Button onClick={fetchAllBookings} variant="outline" size="sm" className="flex items-center gap-2">
                            <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                {success && <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><CheckCircle2 className="w-5 h-5" />{success}</div>}
                {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2 max-w-2xl"><AlertCircle className="w-5 h-5" />{error}</div>}

                {/* Content */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden">
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 font-bold text-slate-700 capitalize">Restaurant</th>
                                    <th className="p-4 font-bold text-slate-700 capitalize">Customer</th>
                                    <th className="p-4 font-bold text-slate-700 capitalize">Date/Time</th>
                                    <th className="p-4 font-bold text-slate-700 capitalize">Table</th>
                                    <th className="p-4 font-bold text-slate-700 capitalize text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                                <span className="text-slate-500 font-medium">Loading reservations...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : bookings.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-slate-500 font-medium">
                                            No bookings found across any restaurant.
                                        </td>
                                    </tr>
                                ) : (
                                    bookings.map(booking => (
                                        <tr key={booking._id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-900 text-sm">
                                                    {booking.restaurantId?.name || 'N/A'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-900">{booking.guestName}</span>
                                                    <span className="text-xs text-slate-500">{booking.guestPhone}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-700 font-medium">{booking.date}</span>
                                                    <span className="text-xs text-slate-500">{booking.time}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800">#{booking.tableNumber}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${booking.bookingStatus === 'Confirmed' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                        booking.bookingStatus === 'Rejected' ? 'bg-red-100 text-red-700 border border-red-200' :
                                                            'bg-orange-100 text-orange-700 border border-orange-200'
                                                    }`}>
                                                    {booking.bookingStatus}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
