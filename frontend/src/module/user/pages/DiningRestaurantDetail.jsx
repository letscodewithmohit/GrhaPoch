import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Bookmark, Share2, Phone, Navigation, Clock, Star, X, Check, CalendarDays, ChevronLeft, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import AnimatedPage from "../components/AnimatedPage"
import { diningAPI, restaurantAPI, userAPI } from "@/lib/api"
import OptimizedImage from "@/components/OptimizedImage"
import { toast } from "sonner"
import axios from "axios"
import { getRazorpayKeyId } from "@/lib/utils/razorpayKey"
import { mergeDiningBookings, normalizeDiningBooking, readDiningBookings, writeDiningBookings } from "../utils/diningBookings"

export default function DiningRestaurantDetail() {
    const { category, slug } = useParams()
    const navigate = useNavigate()
    const [restaurant, setRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isBookingOpen, setIsBookingOpen] = useState(false)
    const [bookingStep, setBookingStep] = useState(1)
    const [guestCount, setGuestCount] = useState(2)
    const [selectedDate, setSelectedDate] = useState("Today")
    const [selectedTimePeriod, setSelectedTimePeriod] = useState("Lunch")
    const [selectedTimeSlot, setSelectedTimeSlot] = useState(null)

    // New states for Step 4-6
    const [tables, setTables] = useState([])
    const [selectedTable, setSelectedTable] = useState(null)
    const [customerDetails, setCustomerDetails] = useState({ name: "", phone: "" })
    const [bookingLoading, setBookingLoading] = useState(false)
    const [showMyBookings, setShowMyBookings] = useState(false)
    const [myBookings, setMyBookings] = useState([])
    const [platformFee, setPlatformFee] = useState(0)

    const syncMyBookings = async () => {
        const cachedBookings = readDiningBookings()
        if (cachedBookings.length > 0) {
            setMyBookings(cachedBookings)
        }

        try {
            const response = await diningAPI.getMyBookings()
            if (response.data?.success) {
                const apiBookings = Array.isArray(response.data.data) ? response.data.data : []
                const normalizedApiBookings = apiBookings.map((booking) => normalizeDiningBooking(booking))
                const mergedBookings = mergeDiningBookings(cachedBookings, normalizedApiBookings)
                setMyBookings(mergedBookings)
                writeDiningBookings(mergedBookings)
            }
        } catch (error) {
            console.log("Dining bookings sync failed, using cached bookings")
        }
    }

    const fetchPlatformFee = async () => {
        const restaurantId = restaurant?.id || restaurant?._id;
        if (!restaurantId) return;
        try {
            const res = await diningAPI.getPlatformFee(restaurantId);
            if (res.data?.success) {
                setPlatformFee(res.data.data.platformFee);
            }
        } catch (error) {
            console.error("Failed to fetch platform fee", error);
        }
    };

    useEffect(() => {
        if (restaurant?._id) {
            fetchPlatformFee();
        }
    }, [restaurant]);

    const [dates, setDates] = useState([])

    useEffect(() => {
        const generateDates = () => {
            const days = []
            const today = new Date()
            for (let i = 0; i < 7; i++) {
                const date = new Date(today)
                date.setDate(today.getDate() + i)

                const label = i === 0 ? "TODAY" : i === 1 ? "TOMORROW" : date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
                // Format: "Feb 27" to match backend expectations and existing UI style
                const month = date.toLocaleDateString('en-US', { month: 'short' })
                const day = date.getDate()
                const dateStr = `${month} ${day}`
                const id = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dateStr

                days.push({ id, label, date: dateStr })
            }
            setDates(days)
        }
        generateDates()
    }, [])

    const lunchSlots = Array.isArray(restaurant?.diningSlots?.lunch) ? restaurant.diningSlots.lunch : []
    const dinnerSlots = Array.isArray(restaurant?.diningSlots?.dinner) ? restaurant.diningSlots.dinner : []
    const activeSlots = selectedTimePeriod === "Lunch" ? lunchSlots : dinnerSlots

    const maxGuests = Math.max(1, Math.min(Number(restaurant?.diningGuests) || 6, 20))
    const guestOptions = Array.from({ length: maxGuests }, (_, idx) => idx + 1)

    useEffect(() => {
        if (guestCount > maxGuests) {
            setGuestCount(maxGuests)
        }
        if (guestCount < 1) {
            setGuestCount(1)
        }
    }, [guestCount, maxGuests])

    useEffect(() => {
        if (!activeSlots.some((slot) => slot?.time === selectedTimeSlot)) {
            setSelectedTimeSlot(null)
        }
    }, [selectedTimePeriod, restaurant?.diningSlots, selectedTimeSlot])

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const res = await userAPI.getProfile();
                if (res.data?.success) {
                    const userData = res.data.data.user || res.data.data;
                    setCustomerDetails(prev => ({
                        ...prev,
                        name: userData.name || "",
                        phone: userData.phone || ""
                    }));
                }
            } catch (err) {
                console.log("User profile fetch failed for dining booking");
            }
        };
        fetchUserProfile();

        const fetchRestaurant = async () => {
            setLoading(true)
            try {
                let res = null
                try {
                    res = await diningAPI.getRestaurantBySlug(slug)
                } catch (err) {
                    if (err.response?.status === 404) {
                        const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                        if (normalizedSlug !== slug) {
                            try {
                                res = await diningAPI.getRestaurantBySlug(normalizedSlug)
                            } catch (fallbackErr) {
                                res = await restaurantAPI.getRestaurantById(slug)
                            }
                        } else {
                            res = await restaurantAPI.getRestaurantById(slug)
                        }
                    } else {
                        throw err
                    }
                }

                if (res?.data?.success && res.data.data) {
                    const restaurantData = res.data.data.restaurant || res.data.data
                    setRestaurant(restaurantData)
                }
            } catch (error) {
                console.error("Failed to fetch restaurant", error)
            } finally {
                setLoading(false)
            }
        }
        fetchRestaurant()
    }, [slug])

    useEffect(() => {
        syncMyBookings()

        const onBookingsUpdated = () => {
            syncMyBookings()
        }

        window.addEventListener("diningBookingsUpdated", onBookingsUpdated)
        return () => {
            window.removeEventListener("diningBookingsUpdated", onBookingsUpdated)
        }
    }, [])

    const fetchAvailableTables = async () => {
        const restaurantId = restaurant?.id || restaurant?._id;
        if (!restaurantId) return;
        setBookingLoading(true);
        try {
            const parsedDate = dates.find(d => d.id === selectedDate)?.date || selectedDate;
            const res = await diningAPI.getAvailableTables(restaurantId, { date: parsedDate, time: selectedTimeSlot, guests: guestCount });
            if (res.data?.success) {
                setTables(res.data.data);
            }
        } catch (error) {
            console.error("Failed to fetch tables", error);
        } finally {
            setBookingLoading(false);
        }
    }

    const handleNextFromTime = () => {
        fetchAvailableTables();
        setBookingStep(4);
    }

    const handleConfirmBooking = async () => {
        if (!customerDetails.name || !customerDetails.phone) {
            toast.error("Please enter your name and phone number");
            return;
        }
        const restaurantId = restaurant?.id || restaurant?._id;
        setBookingLoading(true);
        try {
            const parsedDate = dates.find(d => d.id === selectedDate)?.date || selectedDate;
            const bookingDetails = {
                tableId: selectedTable.id,
                tableNumber: selectedTable.tableNumber,
                guests: guestCount,
                date: parsedDate,
                time: selectedTimeSlot,
                customerDetails: customerDetails
            };

            const res = await diningAPI.createBooking(restaurantId, bookingDetails);
            if (res.data?.success) {
                const createdBooking = normalizeDiningBooking({
                    ...res.data.data,
                    restaurantName: restaurant?.name,
                    restaurantSlug: restaurant?.slug,
                    restaurantImage: restaurant?.profileImage?.url || restaurant?.image || null
                })
                const mergedBookings = mergeDiningBookings(myBookings, [createdBooking])
                setMyBookings(mergedBookings)
                writeDiningBookings(mergedBookings)
                window.dispatchEvent(new Event("diningBookingsUpdated"))
                setBookingStep(6);
                toast.success("Your table booking request has been sent to the restaurant");
            }
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Failed to confirm booking.");
        } finally {
            setBookingLoading(false);
        }
    }

    const openBookingModal = () => {
        const hasLunchSlots = lunchSlots.length > 0
        const hasDinnerSlots = dinnerSlots.length > 0
        const defaultPeriod = hasLunchSlots ? "Lunch" : hasDinnerSlots ? "Dinner" : "Lunch"

        setBookingStep(1)
        setGuestCount((prev) => Math.max(1, Math.min(prev, maxGuests)))
        setSelectedTimePeriod(defaultPeriod)
        setSelectedTimeSlot(null)
        setSelectedTable(null)
        setTables([])
        setIsBookingOpen(true)
    }

    const resetBooking = () => {
        setIsBookingOpen(false);
        setTimeout(() => {
            setBookingStep(1);
            setGuestCount(2);
            setSelectedDate("Today");
            setSelectedTimePeriod("Lunch");
            setSelectedTimeSlot(null);
            setSelectedTable(null);
            setCustomerDetails({ name: "", phone: "" });
        }, 300);
    }

    if (loading) {
        return (
            <AnimatedPage className="bg-white min-h-screen flex items-center justify-center">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-500 font-medium">Loading restaurant details...</p>
                </div>
            </AnimatedPage>
        )
    }

    if (!restaurant) {
        return (
            <AnimatedPage className="bg-white min-h-screen flex flex-col items-center justify-center p-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Restaurant not found</h2>
                <p className="text-gray-500 mb-6 font-medium text-center">The restaurant you are looking for might be unavailable or removed.</p>
                <Button onClick={() => navigate(-1)} className="bg-orange-600 hover:bg-orange-700 text-white rounded-full px-8 py-2 font-bold">
                    Go Back
                </Button>
            </AnimatedPage>
        )
    }

    const bgImage = restaurant.image || restaurant.profileImage?.url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"

    if (showMyBookings) {
        return (
            <AnimatedPage className="bg-gray-50 min-h-screen pb-24">
                <div className="bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-4 sticky top-0 z-10 shadow-sm">
                    <button onClick={() => setShowMyBookings(false)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-900">My Bookings</h1>
                </div>

                <div className="p-4 space-y-4">
                    {myBookings.length === 0 ? (
                        <div className="text-center py-20">
                            <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">No bookings found</p>
                        </div>
                    ) : myBookings.map((b, idx) => (
                        <div key={b._id || b.id || idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative">
                            <span className="absolute top-4 right-4 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                                {b.bookingStatus || 'Pending'}
                            </span>
                            <h3 className="font-bold text-lg text-gray-900 mb-4">{b.restaurantName || restaurant.name}</h3>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                                <div><span className="text-gray-500 block text-xs">Date</span><span className="font-medium">{b.date}</span></div>
                                <div><span className="text-gray-500 block text-xs">Time</span><span className="font-medium">{b.time}</span></div>
                                <div><span className="text-gray-500 block text-xs">Guests</span><span className="font-medium">{b.guests} Guests</span></div>
                                <div><span className="text-gray-500 block text-xs">Table</span><span className="font-medium">{b.tableNumber}</span></div>
                            </div>
                            <div className="pt-4 mt-4 border-t border-gray-50 flex gap-3">
                                <Button className="flex-1 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl h-10 text-sm">View Details</Button>
                                <Button className="flex-1 bg-white border border-red-200 text-red-500 font-bold rounded-xl h-10 text-sm hover:bg-red-50">Cancel Booking</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </AnimatedPage>
        );
    }

    return (
        <AnimatedPage className="bg-white min-h-screen pb-24 relative overflow-x-hidden">
            {/* Hero Header Section */}
            <div className="relative w-full h-[35vh] sm:h-[40vh] md:h-[45vh] lg:h-[50vh]">
                <div className="absolute inset-0">
                    <OptimizedImage
                        src={bgImage}
                        alt={restaurant.name}
                        className="w-full h-full"
                        objectFit="cover"
                        priority={true}
                    />
                </div>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30"></div>

                {/* Top Navbar */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                        className="h-10 w-10 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50"
                        >
                            <Bookmark className="h-5 w-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50"
                        >
                            <Share2 className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Details over image */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-1 shadow-sm">
                        {restaurant.name}
                    </h1>
                    <p className="text-white/90 text-sm sm:text-base font-medium mb-1 drop-shadow-md">
                        {restaurant.location && restaurant.location !== "Location" ? restaurant.location : "Location not available"}
                    </p>
                    <div className="flex items-center gap-2 text-white/90 text-sm mb-3 font-medium">
                        {restaurant.distance && <span>{restaurant.distance} away</span>}
                        {restaurant.distance && restaurant.priceRange && <span className="w-1 h-1 bg-white/60 rounded-full mx-1"></span>}
                        {restaurant.priceRange && <span>{
                            restaurant.priceRange === '$' ? '₹200 for two' :
                                restaurant.priceRange === '$$' ? '₹500 for two' :
                                    restaurant.priceRange === '$$$' ? '₹1000 for two' :
                                        '₹1500+ for two'
                        }</span>}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        {restaurant.deliveryTimings ? (
                            <div className="flex items-center gap-2 text-orange-400 text-xs sm:text-sm font-bold bg-orange-500/10 px-2 py-1 rounded backdrop-blur-sm">
                                <Clock className="w-3.5 h-3.5" />
                                <span>OPEN {restaurant.deliveryTimings.openingTime} - {restaurant.deliveryTimings.closingTime}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-orange-400 text-xs sm:text-sm font-bold bg-orange-500/10 px-2 py-1 rounded backdrop-blur-sm">
                                <Clock className="w-3.5 h-3.5" />
                                <span>OPEN NOW</span>
                            </div>
                        )}

                        <div className="bg-green-600 text-white px-2 py-1 rounded-lg flex flex-col items-center shadow-lg border border-green-500/30">
                            <div className="flex items-center gap-1 font-bold text-sm">
                                <span>{restaurant.rating || "0.0"}</span>
                                <Star className="w-3 h-3 fill-white" />
                            </div>
                            <span className="text-[9px] font-medium opacity-90 uppercase tracking-wider">{restaurant.totalRatings || "0"} Reviews</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-t-3xl -mt-4 relative z-20 pt-6 px-4">

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mb-8">
                    <Button
                        onClick={openBookingModal}
                        className="flex-1 bg-white border border-orange-200 text-orange-600 hover:bg-orange-50 font-bold py-6 rounded-xl shadow-sm text-sm"
                    >
                        Book a table
                    </Button>
                    <Button variant="outline" size="icon" className="h-[52px] w-[52px] rounded-xl border-gray-200 text-orange-500 hover:bg-gray-50 flex-shrink-0 shadow-sm">
                        <Navigation className="h-5 w-5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-[52px] w-[52px] rounded-xl border-gray-200 text-orange-500 hover:bg-gray-50 flex-shrink-0 shadow-sm">
                        <Phone className="h-5 w-5" />
                    </Button>
                </div>

                <div className="mb-8">
                    {/* Dynamic Offer Banner */}
                    {restaurant.offer && (
                        <div className="bg-gradient-to-r from-orange-50 hover:from-orange-100 to-orange-100/50 rounded-2xl p-5 border border-orange-200/50 text-center mb-6 cursor-pointer transition-colors shadow-sm">
                            <h4 className="text-xl font-extrabold text-orange-600 mb-1">{restaurant.offer}</h4>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">LIMITED TIME OFFER</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Fixed Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40 flex items-center gap-3 w-full lg:max-w-md lg:mx-auto lg:rounded-t-2xl">
                <Button
                    onClick={openBookingModal}
                    className="flex-1 bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700 font-bold py-6 rounded-xl text-sm transition-all"
                >
                    Book a table
                </Button>
                {myBookings.length > 0 && (
                    <Button
                        onClick={() => setShowMyBookings(true)}
                        className="flex-1 bg-white border border-gray-200 text-gray-700 font-bold py-6 rounded-xl text-sm shadow-sm"
                    >
                        My Bookings
                    </Button>
                )}
            </div>

            {/* Booking Modal */}
            <Dialog open={isBookingOpen} onOpenChange={resetBooking}>
                <DialogContent className="sm:max-w-[400px] p-0 rounded-[28px] overflow-hidden bg-white border-0 shadow-2xl">
                    <DialogTitle className="sr-only">Book a Table Modal</DialogTitle>
                    <DialogDescription className="sr-only">Reserve a dining table by selecting guests, date, time, and table capacity.</DialogDescription>

                    <div className="p-5 pb-0">
                        {/* Header */}
                        {bookingStep < 6 && (
                            <div className="flex items-center justify-between mb-4 relative h-8">
                                {bookingStep > 1 ? (
                                    <button
                                        onClick={() => setBookingStep(bookingStep - 1)}
                                        className="absolute left-0 p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition-colors"
                                    >
                                        <ChevronLeft className="h-6 w-6 text-gray-700" />
                                    </button>
                                ) : <div></div>}

                                <h2 className="text-xl font-extrabold text-[#1c1c1c] font-sans absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                                    {bookingStep === 4 ? "Select a Table" : bookingStep === 5 ? "Confirm Booking" : "Book a table"}
                                </h2>
                            </div>
                        )}

                        {/* Sub Header info based on step */}
                        {bookingStep === 2 || bookingStep === 3 ? (
                            <div className="flex flex-col gap-2 mb-6">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full">
                                        {guestCount} {guestCount === 1 ? 'Guest' : 'Guests'}
                                    </div>
                                    {bookingStep > 2 && (
                                        <div className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                                            <CalendarDays className="h-3.5 w-3.5" />
                                            {dates.find(d => d.id === selectedDate)?.date || selectedDate}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : bookingStep === 4 ? (
                            <div className="mb-6 space-y-1">
                                <p className="text-center font-bold text-gray-500">{restaurant.name}</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full">
                                        {guestCount} Guests - {selectedTimeSlot}
                                    </span>
                                    <span className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full">
                                        {dates.find(d => d.id === selectedDate)?.date || selectedDate}
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        {/* Step 1: Guests Selection */}
                        {bookingStep === 1 && (
                            <div className="space-y-6 mt-6">
                                <div>
                                    <p className="text-[15px] font-bold text-[#1c1c1c] mb-4">Select number of guests</p>

                                    <div className="flex justify-start items-center gap-2 flex-wrap">
                                        {guestOptions.map((num) => (
                                            <button
                                                key={num}
                                                onClick={() => setGuestCount(num)}
                                                className={`h-11 w-11 rounded-full flex items-center justify-center text-[15px] font-bold transition-all border ${guestCount === num
                                                    ? "bg-[#ef4f5f] border-[#ef4f5f] text-white shadow-md shadow-red-200"
                                                    : "bg-white border-gray-200 text-gray-600 hover:border-[#ef4f5f]"
                                                    }`}
                                            >
                                                {num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Date Selection */}
                        {bookingStep === 2 && (
                            <div className="space-y-6 mt-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <CalendarDays className="h-4 w-4 text-[#ef4f5f]" />
                                        <p className="text-[15px] font-bold text-[#1c1c1c]">Select date</p>
                                    </div>

                                    <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
                                        {dates.map((date) => (
                                            <button
                                                key={date.id}
                                                onClick={() => setSelectedDate(date.id)}
                                                className={`flex-shrink-0 flex flex-col items-center justify-center w-[85px] h-[75px] rounded-xl border-2 transition-all ${selectedDate === date.id
                                                    ? "bg-[#fff2f2] border-[#ef4f5f] shadow-[0_4px_12px_rgba(239,79,95,0.15)]"
                                                    : "bg-white border-gray-100/80 hover:border-gray-200"
                                                    }`}
                                            >
                                                <span className={`text-[11px] font-extrabold tracking-wider ${selectedDate === date.id ? "text-[#ef4f5f]" : "text-gray-400"}`}>
                                                    {date.label}
                                                </span>
                                                <span className={`text-[15px] font-bold mt-1 ${selectedDate === date.id ? "text-[#1c1c1c]" : "text-gray-700"}`}>
                                                    {date.date}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Time Selection */}
                        {bookingStep === 3 && (
                            <div className="space-y-6 mt-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Clock className="h-4 w-4 text-[#ef4f5f]" />
                                        <p className="text-[15px] font-bold text-[#1c1c1c]">Select time of day</p>
                                    </div>

                                    {/* Lunch/Dinner Toggle */}
                                    <div className="flex bg-gray-100 p-1 rounded-2xl mb-5">
                                        <button
                                            onClick={() => setSelectedTimePeriod("Lunch")}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedTimePeriod === "Lunch"
                                                ? "bg-white text-[#1c1c1c] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                                                : "text-gray-500 hover:text-gray-800"
                                                }`}
                                        >
                                            Lunch
                                        </button>
                                        <button
                                            onClick={() => setSelectedTimePeriod("Dinner")}
                                            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedTimePeriod === "Dinner"
                                                ? "bg-white text-[#1c1c1c] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                                                : "text-gray-500 hover:text-gray-800"
                                                }`}
                                        >
                                            Dinner
                                        </button>
                                    </div>

                                    {/* Time Slots Grid */}
                                    <div className="max-h-[220px] overflow-y-auto hide-scrollbar -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
                                        {activeSlots.length === 0 ? (
                                            <div className="py-8 text-center text-sm text-gray-500 font-medium">
                                                No {selectedTimePeriod.toLowerCase()} slots available for this restaurant.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 gap-3 pb-4">
                                                {activeSlots.map((slot, idx) => {
                                                    const isDisabled = slot?.isAvailable === false
                                                    const slotTime = slot?.time
                                                    return (
                                                        <button
                                                            key={`${slotTime}-${idx}`}
                                                            disabled={isDisabled || !slotTime}
                                                            onClick={() => setSelectedTimeSlot(slotTime)}
                                                            className={`py-3 rounded-[14px] border border-gray-100 flex flex-col items-center justify-center transition-all ${(isDisabled || !slotTime)
                                                                ? "bg-gray-50/80 text-gray-300 cursor-not-allowed border-gray-50"
                                                                : selectedTimeSlot === slotTime
                                                                    ? "bg-[#ef4f5f] text-white border-[#ef4f5f] shadow-md shadow-red-200"
                                                                    : "bg-white hover:border-gray-300 text-[#1c1c1c]"
                                                                }`}
                                                        >
                                                            <span className="text-sm font-bold">{slotTime}</span>
                                                            {!isDisabled && slot?.discount && (
                                                                <span className={`text-[9px] font-bold mt-0.5 ${selectedTimeSlot === slotTime ? "text-white/90" : "text-blue-500"}`}>
                                                                    {slot.discount}
                                                                </span>
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Table Selection */}
                        {bookingStep === 4 && (
                            <div className="space-y-4 mt-2">
                                <div>
                                    <p className="text-[15px] font-bold text-[#1c1c1c] mb-4">Available Tables</p>
                                    <div className="grid grid-cols-2 gap-3 max-h-[250px] overflow-y-auto pb-4" style={{ scrollbarWidth: 'none' }}>
                                        {bookingLoading ? (
                                            <div className="col-span-2 flex justify-center py-6">
                                                <div className="h-8 w-8 border-3 border-[#ef4f5f] border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : tables.length === 0 ? (
                                            <p className="col-span-2 text-center text-gray-500 text-sm py-8">No tables available for selected time.</p>
                                        ) : tables.map((table) => (
                                            <button
                                                key={table.id}
                                                disabled={!table.isAvailable}
                                                onClick={() => setSelectedTable(table)}
                                                className={`p-4 rounded-2xl border-2 text-left transition-all ${!table.isAvailable
                                                    ? 'bg-gray-100 border-gray-200 opacity-60 grayscale cursor-not-allowed'
                                                    : selectedTable?.id === table.id
                                                        ? 'bg-[#fff2f2] border-[#ef4f5f]'
                                                        : 'bg-white border-gray-100 hover:border-[#ef4f5f]'}`}
                                            >
                                                <div className="flex flex-col items-center text-center">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${selectedTable?.id === table.id ? 'bg-[#ef4f5f] text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        <Star className={`w-5 h-5 ${!table.isAvailable ? 'text-gray-400' : 'fill-current'}`} />
                                                    </div>
                                                    <p className={`font-bold text-base ${!table.isAvailable ? 'text-gray-400' : 'text-gray-900'}`}>{table.tableNumber}</p>
                                                    <p className="text-xs text-gray-500 mt-1">Seats {table.capacity} Guests</p>
                                                    {!table.isAvailable && <span className="text-[10px] font-bold text-gray-500 uppercase mt-2">Booked</span>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Confirm Booking */}
                        {bookingStep === 5 && (
                            <div className="space-y-3 mt-2 max-h-[350px] overflow-y-auto pb-4" style={{ scrollbarWidth: 'none' }}>
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <p className="font-bold text-gray-900 text-lg mb-4">{restaurant.name}</p>
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm items-center border-b border-gray-200 pb-2">
                                            <span className="text-gray-500 font-medium">Guests</span>
                                            <span className="font-bold text-gray-900">{guestCount} Guests</span>
                                        </div>
                                        <div className="flex justify-between text-sm items-center border-b border-gray-200 pb-2">
                                            <span className="text-gray-500 font-medium">Date</span>
                                            <span className="font-bold text-gray-900">{dates.find(d => d.id === selectedDate)?.date || selectedDate}</span>
                                        </div>
                                        <div className="flex justify-between text-sm items-center border-b border-gray-200 pb-2">
                                            <span className="text-gray-500 font-medium">Time</span>
                                            <span className="font-bold text-gray-900">{selectedTimeSlot}</span>
                                        </div>
                                        <div className="flex justify-between text-sm items-center">
                                            <span className="text-gray-500 font-medium">Table</span>
                                            <span className="font-bold text-gray-900">{selectedTable?.tableNumber}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-bold text-[#1c1c1c] mb-3 mt-4 text-[15px]">Customer Details</h3>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="Full Name"
                                            value={customerDetails.name}
                                            onChange={e => setCustomerDetails({ ...customerDetails, name: e.target.value })}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#ef4f5f] focus:ring-1 focus:ring-[#ef4f5f]"
                                        />
                                        <input
                                            type="tel"
                                            placeholder="Phone Number"
                                            value={customerDetails.phone}
                                            onChange={e => setCustomerDetails({ ...customerDetails, phone: e.target.value })}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#ef4f5f] focus:ring-1 focus:ring-[#ef4f5f]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 6: Success */}
                        {bookingStep === 6 && (
                            <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center">
                                <div className="w-20 h-20 bg-[#e5f8ed] text-[#24963f] rounded-full flex items-center justify-center mb-5">
                                    <Check className="w-10 h-10" strokeWidth={3} />
                                </div>
                                <h2 className="text-2xl font-extrabold text-[#1c1c1c] mb-2">Request Sent</h2>
                                <p className="text-gray-500 text-[15px] mb-8">Your table booking request has been sent to the restaurant</p>

                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 w-full text-left space-y-3 mb-6">
                                    <p className="font-bold text-gray-900 mb-1">{restaurant.name}</p>
                                    <div className="flex justify-between text-sm border-b border-gray-200 pb-2"><span className="text-gray-500">Date</span><span className="font-bold">{dates.find(d => d.id === selectedDate)?.date || selectedDate}</span></div>
                                    <div className="flex justify-between text-sm border-b border-gray-200 pb-2"><span className="text-gray-500">Time</span><span className="font-bold">{selectedTimeSlot}</span></div>
                                    <div className="flex justify-between text-sm border-b border-gray-200 pb-2"><span className="text-gray-500">Table</span><span className="font-bold">{selectedTable?.tableNumber}</span></div>
                                    <div className="flex justify-between text-sm"><span className="text-gray-500">Guests</span><span className="font-bold">{guestCount} Guests</span></div>
                                </div>

                                <div className="w-full space-y-3">
                                    <Button onClick={() => { resetBooking(); setShowMyBookings(true); }} className="w-full bg-white border border-gray-200 text-[#1c1c1c] font-bold h-12 rounded-xl text-[15px]">
                                        View Booking
                                    </Button>
                                    <Button onClick={resetBooking} className="w-full bg-[#ef4f5f] hover:bg-[#e03f4f] text-white font-bold h-12 rounded-xl text-[15px]">
                                        Back to Home
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Action for steps 1-5 */}
                    {bookingStep < 6 && (
                        <div className="p-5 pt-4 bg-white border-t border-gray-50 mt-2">
                            {bookingStep === 3 ? (
                                <Button
                                    onClick={handleNextFromTime}
                                    disabled={!selectedTimeSlot}
                                    className={`w-full font-bold h-12 rounded-2xl text-[15px] transition-all ${!selectedTimeSlot
                                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                        : "bg-[#ef4f5f] hover:bg-[#e03f4f] text-white shadow-[0_4px_14px_rgba(239,79,95,0.3)]"
                                        }`}
                                >
                                    Next
                                </Button>
                            ) : bookingStep === 4 ? (
                                <Button
                                    onClick={() => setBookingStep(5)}
                                    disabled={!selectedTable}
                                    className={`w-full font-bold h-12 rounded-2xl text-[15px] transition-all ${!selectedTable
                                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                        : `bg-[#ef4f5f] hover:bg-[#e03f4f] text-white shadow-[0_4px_14px_rgba(239,79,95,0.3)]`
                                        }`}
                                >
                                    Continue with {selectedTable?.tableNumber || ""}
                                </Button>
                            ) : bookingStep === 5 ? (
                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => setBookingStep(4)}
                                        variant="outline"
                                        className="flex-1 bg-white font-bold h-12 rounded-2xl text-[#1c1c1c] text-[15px]"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleConfirmBooking}
                                        disabled={bookingLoading}
                                        className="flex-[2] bg-[#ef4f5f] hover:bg-[#e03f4f] text-white font-bold h-12 rounded-2xl text-[15px] shadow-[0_4px_14px_rgba(239,79,95,0.3)]"
                                    >
                                        {bookingLoading ? "Processing..." : "Book a Table"}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    onClick={() => setBookingStep(bookingStep + 1)}
                                    className="w-full bg-[#ef4f5f] hover:bg-[#e03f4f] text-white font-bold h-12 rounded-2xl text-[15px] shadow-[0_4px_14px_rgba(239,79,95,0.3)] transition-all active:scale-[0.98]"
                                >
                                    Next
                                </Button>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <style dangerouslySetInnerHTML={{
                __html: `
    .hide-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
`}} />
        </AnimatedPage>
    )
}
