import { useEffect, useMemo, useState } from "react"
import { motion as Motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, CalendarDays, IndianRupee } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { campaignAPI, restaurantAPI } from "@/lib/api"

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
  return message || "Failed to submit advertisement"
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
  const [startDate, setStartDate] = useState(() => toInputDate(minStartDate))
  const [endDate, setEndDate] = useState(() => {
    const nextWeek = new Date(minStartDate)
    nextWeek.setDate(nextWeek.getDate() + 6)
    return toInputDate(nextWeek)
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [dynamicTitle, setDynamicTitle] = useState("")

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      setErrorMessage("")
      try {
        const [pricingResult, restaurantResult] = await Promise.allSettled([
          campaignAPI.getAdvertisementPricing(),
          restaurantAPI.getCurrentRestaurant()
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

        if (pricingResult.status === "rejected") {
          setErrorMessage("Failed to load pricing. Default price is applied.")
        }
      } catch (error) {
        setDynamicTitle("Restaurant Advertisement")
        setErrorMessage(error?.response?.data?.message || "Failed to load advertisement data")
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    return () => {
      if (bannerPreview) {
        URL.revokeObjectURL(bannerPreview)
      }
    }
  }, [bannerPreview])

  const totalDays = useMemo(() => getDaysInclusive(startDate, endDate), [startDate, endDate])
  const totalPrice = useMemo(() => Number((totalDays * pricePerDay).toFixed(2)), [totalDays, pricePerDay])

  const handleBannerChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload an image file.")
      return
    }

    const objectUrl = URL.createObjectURL(file)
    if (bannerPreview) {
      URL.revokeObjectURL(bannerPreview)
    }

    setErrorMessage("")
    setBannerFile(file)
    setBannerPreview(objectUrl)
  }

  const handleSubmit = async () => {
    setErrorMessage("")

    if (!bannerFile) {
      setErrorMessage("Banner upload is required.")
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image (Any size - testing mode)</label>
                    <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 block cursor-pointer hover:border-gray-900">
                      <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                      {bannerPreview ? (
                        <img src={bannerPreview} alt="Banner preview" className="w-full h-44 object-cover rounded-md" />
                      ) : (
                        <div className="text-center py-6">
                          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">Click to upload banner</p>
                        </div>
                      )}
                    </label>
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

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-gray-600">Price Per Day (Admin Set)</p>
                    <p className="text-sm font-semibold text-gray-900">INR {pricePerDay.toFixed(2)}</p>
                    <p className="text-xs text-gray-600 mt-1">Selected Days: {totalDays}</p>
                    <div className="mt-2 flex items-center gap-2 text-gray-900">
                      <IndianRupee className="w-4 h-4" />
                      <p className="font-bold">Total: INR {totalPrice.toFixed(2)}</p>
                    </div>
                  </div>

                  <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-black hover:bg-gray-800">
                    {isSubmitting ? "Submitting..." : "Submit Advertisement"}
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
