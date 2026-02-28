import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, CalendarDays, Clock, Users, Building2 } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { diningAPI } from "@/lib/api"
import { isDiningBookingActive, mergeDiningBookings, normalizeDiningBooking, readDiningBookings, writeDiningBookings } from "../../utils/diningBookings"

export default function DiningBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  const syncBookings = useCallback(async () => {
    const cachedBookings = readDiningBookings()
    if (cachedBookings.length > 0) {
      setBookings(cachedBookings)
    }

    const hasUserToken = !!(localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken"))
    if (!hasUserToken) {
      setLoading(false)
      return
    }

    try {
      const response = await diningAPI.getMyBookings()
      if (response.data?.success) {
        const apiBookings = Array.isArray(response.data.data) ? response.data.data : []
        const normalizedApiBookings = apiBookings.map((booking) => normalizeDiningBooking(booking))
        const mergedBookings = mergeDiningBookings(cachedBookings, normalizedApiBookings)
        setBookings(mergedBookings)
        writeDiningBookings(mergedBookings)
      }
    } catch {
      // Keep cached data when API fails.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    syncBookings()

    const onDiningBookingsUpdated = () => {
      syncBookings()
    }

    window.addEventListener("diningBookingsUpdated", onDiningBookingsUpdated)
    return () => {
      window.removeEventListener("diningBookingsUpdated", onDiningBookingsUpdated)
    }
  }, [syncBookings])

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime()
      const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime()
      return bTime - aTime
    })
  }, [bookings])

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/user/profile">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Dining Bookings</h1>
        </div>

        {loading ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500">Loading bookings...</p>
            </CardContent>
          </Card>
        ) : sortedBookings.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center">
              <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No dining bookings found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedBookings.map((booking) => {
              const isActive = isDiningBookingActive(booking)
              return (
                <Card key={booking._id || booking.id} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {booking.restaurantName || "Restaurant"}
                        </p>
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <CalendarDays className="h-3.5 w-3.5" />
                            <span>{booking.date || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{booking.time || "-"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <Users className="h-3.5 w-3.5" />
                            <span>{booking.guests || 0} Guests</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>Table {booking.tableNumber || "-"}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                        }`}>
                        {booking.bookingStatus || "Pending"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
