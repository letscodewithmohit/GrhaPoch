import { useEffect, useMemo, useState } from "react"
import { motion as Motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, CalendarDays, IndianRupee } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { campaignAPI, restaurantAPI } from "@/lib/api"
import { optimizeBannerForUpload } from "@/lib/utils/bannerUpload"

const toInputDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseInputDate = (value) => {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getDaysInclusive = (startDate, endDate) => {
  if (!startDate || !endDate) return 0
  const start = parseInputDate(startDate)
  const end = parseInputDate(endDate)
  if (!start || !end) return 0
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  if (end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

const normalizeSubmitError = (message) => {
  const text = String(message || "").toLowerCase()
  if (text.includes("overlap")) {
    return "Dates overlap. Choose different dates."
  }
  if (text.includes("2mb") || text.includes("file size")) {
    return "Banner file size must be 2MB or less."
  }
  if (text.includes("dimensions")) {
    return "Banner dimensions too small. Minimum 1200x500 required."
  }
  if (text.includes("aspect ratio") || text.includes("2.4:1")) {
    return "Banner aspect ratio must be around 2.4:1 (for example 1200x500)."
  }
  if (text.includes("only image") || text.includes("image banner")) {
    return "Only JPG/PNG image banner is allowed."
  }
  return message || "Failed to submit advertisement"
}

const isBannerRelatedError = (message) => {
  const text = String(message || "").toLowerCase()
  return (
    text.includes("banner") ||
    text.includes("image") ||
    text.includes("aspect ratio") ||
    text.includes("dimensions") ||
    text.includes("2mb") ||
    text.includes("file size")
  )
}

const formatDateLabel = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const doDateRangesOverlap = (startA, endA, startB, endB) => {
  if (!startA || !endA || !startB || !endB) return false
  const aStart = parseInputDate(startA)
  const aEnd = parseInputDate(endA)
  const bStart = parseInputDate(startB)
  const bEnd = parseInputDate(endB)
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return aStart <= bEnd && bStart <= aEnd
}

export default function NewAdvertisementPage() {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const minStartDate = useMemo(() => {
    const value = new Date(today)
    value.setHours(0, 0, 0, 0)
    value.setDate(value.getDate() + 1)
    return value
  }, [today])
  const [pricePerDay, setPricePerDay] = useState(150)
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState("")
  const [bannerOptimizationMessage, setBannerOptimizationMessage] = useState("")
  const [isOptimizingBanner, setIsOptimizingBanner] = useState(false)
  const [startDate, setStartDate] = useState(() => toInputDate(minStartDate))
  const [endDate, setEndDate] = useState(() => {
    const nextWeek = new Date(minStartDate)
    nextWeek.setDate(nextWeek.getDate() + 6)
    return toInputDate(nextWeek)
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingBookedDates, setLoadingBookedDates] = useState(false)
  const [bookedRanges, setBookedRanges] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [dynamicTitle, setDynamicTitle] = useState("")

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      setLoadingBookedDates(true)
      setErrorMessage("")
      try {
        const bookedEndDate = new Date(minStartDate)
        bookedEndDate.setDate(bookedEndDate.getDate() + 365)
        const [pricingResult, restaurantResult, bookedDatesResult] = await Promise.allSettled([
          campaignAPI.getAdvertisementPricing(),
          restaurantAPI.getCurrentRestaurant(),
          campaignAPI.getRestaurantAdvertisementBookedDates({
            startDate: toInputDate(minStartDate),
            endDate: toInputDate(bookedEndDate),
          }),
        ])

        if (pricingResult.status === "fulfilled") {
          const apiPrice = Number(pricingResult.value?.data?.data?.pricePerDay || 150)
          if (Number.isFinite(apiPrice) && apiPrice > 0) {
            setPricePerDay(apiPrice)
          }
        }

        if (restaurantResult.status === "fulfilled") {
          const restaurantData =
            restaurantResult.value?.data?.data?.restaurant || restaurantResult.value?.data?.restaurant
          const restaurantName = String(restaurantData?.name || "").trim()
          setDynamicTitle(restaurantName || "Restaurant Advertisement")
        } else {
          setDynamicTitle("Restaurant Advertisement")
        }

        if (bookedDatesResult.status === "fulfilled") {
          setBookedRanges(bookedDatesResult.value?.data?.data?.bookedRanges || [])
        } else {
          setBookedRanges([])
        }

        if (pricingResult.status === "rejected") {
          setErrorMessage("Failed to load pricing. Default price is applied.")
        }
      } catch (error) {
        setDynamicTitle("Restaurant Advertisement")
        setBookedRanges([])
        setErrorMessage(error?.response?.data?.message || "Failed to load advertisement data")
      } finally {
        setLoading(false)
        setLoadingBookedDates(false)
      }
    }
    loadInitialData()
  }, [minStartDate])

  useEffect(() => {
    return () => {
      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview)
      }
    }
  }, [bannerPreview])

  const totalDays = useMemo(() => getDaysInclusive(startDate, endDate), [startDate, endDate])
  const totalPrice = useMemo(() => Number((totalDays * pricePerDay).toFixed(2)), [totalDays, pricePerDay])
  const bannerErrorMessage = useMemo(
    () => (isBannerRelatedError(errorMessage) ? errorMessage : ""),
    [errorMessage]
  )
  const overlappingBookedRanges = useMemo(() => {
    return bookedRanges.filter((range) =>
      doDateRangesOverlap(startDate, endDate, range?.startDate, range?.endDate)
    )
  }, [bookedRanges, startDate, endDate])

  const handleBannerChange = async (event) => {
    const file = event.target.files?.[0]
    const inputElement = event.target
    if (!file) return

    setIsOptimizingBanner(true)
    setErrorMessage("")
    setBannerOptimizationMessage("")
    try {
      const optimized = await optimizeBannerForUpload(file)
      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview)
      }
      setBannerFile(optimized.file)
      setBannerPreview(optimized.previewUrl)
      setBannerOptimizationMessage(optimized.summary)
    } catch (error) {
      setErrorMessage(error?.message || "Failed to process banner image")
      if (inputElement) inputElement.value = ""
    } finally {
      setIsOptimizingBanner(false)
    }
  }

  const handleSubmit = async () => {
    setErrorMessage("")

    if (!bannerFile) {
      setErrorMessage("Banner upload is required.")
      return
    }
    if (isOptimizingBanner) {
      setErrorMessage("Please wait, banner optimization is in progress.")
      return
    }

    if (!dynamicTitle.trim()) {
      setErrorMessage("Title is required.")
      return
    }

    if (!startDate || !endDate) {
      setErrorMessage("Start date and end date are required.")
      return
    }

    const parsedStartDate = parseInputDate(startDate)
    const minAllowedStartDate = new Date(minStartDate)
    minAllowedStartDate.setHours(0, 0, 0, 0)
    if (!parsedStartDate || parsedStartDate < minAllowedStartDate) {
      setErrorMessage("Start date must be at least tomorrow.")
      return
    }

    if (totalDays <= 0) {
      setErrorMessage("End date must be after or equal to start date.")
      return
    }

    if (totalDays > 365) {
      setErrorMessage("Date range must be within 365 days.")
      return
    }

    if (overlappingBookedRanges.length > 0) {
      setErrorMessage("Selected dates overlap with booked dates. Choose a different range.")
      return
    }

    const payload = new FormData()
    payload.append("banner", bannerFile)
    payload.append("startDate", startDate)
    payload.append("endDate", endDate)
    payload.append("title", dynamicTitle)

    setIsSubmitting(true)
    try {
      const response = await campaignAPI.createRestaurantBannerAdvertisement(payload)
      const createdAd = response?.data?.data?.advertisement
      navigate(createdAd?.id ? `/restaurant/advertisements/${createdAd.id}` : "/restaurant/advertisements")
    } catch (error) {
      const message = error?.response?.data?.message
      setErrorMessage(normalizeSubmitError(message))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Add Advertisement</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        <Motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-white border border-gray-100">
            <CardContent className="p-4 space-y-4">
              <h2 className="text-base font-bold text-gray-900">Advertisement Setup</h2>

              {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <input
                      type="text"
                      value={dynamicTitle}
                      onChange={(e) => setDynamicTitle(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">Auto-filled from your restaurant name, you can edit it.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Accepted: JPG/PNG | Auto-optimized to 1200x500 (2.4:1) | Max size: 2MB
                    </p>
                    <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 block cursor-pointer hover:border-gray-900">
                      <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                      {bannerPreview ? (
                        <div className="w-full rounded-md overflow-hidden border border-gray-200 bg-gray-50 aspect-[12/5]">
                          <img src={bannerPreview} alt="Banner preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">
                            {isOptimizingBanner ? "Optimizing banner..." : "Click to upload banner"}
                          </p>
                        </div>
                      )}
                    </label>
                    {bannerOptimizationMessage && (
                      <p className="text-xs text-emerald-700 mt-2">{bannerOptimizationMessage}</p>
                    )}
                    {bannerErrorMessage && <p className="text-xs text-red-600 mt-2">{bannerErrorMessage}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <div className="relative">
                        <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="date"
                          min={toInputDate(minStartDate)}
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                      <div className="relative">
                        <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="date"
                          min={startDate || toInputDate(minStartDate)}
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Booked Dates (Cannot Select)</p>
                    {loadingBookedDates ? (
                      <p className="text-xs text-amber-800 mt-1">Loading booked dates...</p>
                    ) : bookedRanges.length === 0 ? (
                      <p className="text-xs text-amber-800 mt-1">No booked ranges found for the selected window.</p>
                    ) : (
                      <div className="mt-1 space-y-1 max-h-28 overflow-auto">
                        {bookedRanges.slice(0, 8).map((range, index) => (
                          <p key={`${range?.source || "ad"}-${range?.id || index}`} className="text-xs text-amber-800">
                            {formatDateLabel(range?.startDate)} - {formatDateLabel(range?.endDate)}
                          </p>
                        ))}
                        {bookedRanges.length > 8 && (
                          <p className="text-xs text-amber-800">+ {bookedRanges.length - 8} more ranges</p>
                        )}
                      </div>
                    )}
                    {overlappingBookedRanges.length > 0 && (
                      <p className="text-xs text-red-600 mt-2">
                        Selected range overlaps with booked dates. Please change start/end date.
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600">Price Per Day (Admin Set)</p>
                    <p className="text-sm font-semibold text-gray-900">INR {pricePerDay.toFixed(2)}</p>
                    <p className="text-xs text-gray-600 mt-1">Selected Days: {totalDays}</p>
                    <div className="mt-2 flex items-center gap-2 text-gray-900">
                      <IndianRupee className="w-4 h-4" />
                      <p className="font-bold">Total: INR {totalPrice.toFixed(2)}</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || isOptimizingBanner}
                    className="w-full bg-black text-white hover:bg-gray-800 disabled:text-white"
                  >
                    {isOptimizingBanner
                      ? "Optimizing Banner..."
                      : isSubmitting
                      ? "Submitting..."
                      : "Submit Advertisement"}
                  </Button>
                </>
              )}

              {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            </CardContent>
          </Card>
        </Motion.div>
      </div>

    </div>
  )
}
