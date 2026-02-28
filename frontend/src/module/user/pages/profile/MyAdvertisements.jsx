import { useEffect, useMemo, useState } from "react"
import { motion as Motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Plus, Upload, IndianRupee, CalendarDays, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { userAdvertisementAPI } from "@/lib/api"

const ITEMS_PER_PAGE = 6

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const formatStatus = (status) => {
  const text = String(status || "pending").replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const statusBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "active" || value === "running") return "bg-emerald-100 text-emerald-700"
  if (value === "scheduled") return "bg-indigo-100 text-indigo-700"
  if (value === "payment_pending" || value === "approved") return "bg-amber-100 text-amber-700"
  if (value === "rejected") return "bg-red-100 text-red-700"
  if (value === "expired") return "bg-slate-300 text-slate-700"
  return "bg-slate-200 text-slate-700"
}

const toDateInputValue = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getTomorrowInputDate = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 1)
  return toDateInputValue(date)
}

const parseInputDate = (value) => {
  if (!value) return null
  const [year, month, day] = String(value).split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

const getRangeDays = (startDate, endDate) => {
  const start = parseInputDate(startDate)
  const end = parseInputDate(endDate)
  if (!start || !end || end < start) return 0
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1
}

const buildFilterCountsFromAdvertisements = (advertisements) => {
  const base = { all: advertisements.length, pending: 0, active: 0, rejected: 0, expired: 0 }
  advertisements.forEach((ad) => {
    const status = String(ad.status || "pending").toLowerCase()
    const effectiveStatus = String(ad.effectiveStatus || ad.status || "pending").toLowerCase()
    if (["pending", "payment_pending"].includes(status)) base.pending += 1
    if (["active", "running", "approved", "paused", "scheduled"].includes(effectiveStatus)) base.active += 1
    if (status === "rejected") base.rejected += 1
    if (effectiveStatus === "expired") base.expired += 1
  })
  return base
}

export default function MyAdvertisements() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [pricePerDay, setPricePerDay] = useState(150)
  const [ads, setAds] = useState([])
  const [filterCounts, setFilterCounts] = useState({ all: 0, pending: 0, active: 0, rejected: 0, expired: 0 })
  const [errorMessage, setErrorMessage] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const [title, setTitle] = useState("")
  const [startDate, setStartDate] = useState(() => getTomorrowInputDate())
  const [endDate, setEndDate] = useState(() => getTomorrowInputDate())
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState("")

  const selectedDays = useMemo(
    () => getRangeDays(startDate, endDate),
    [startDate, endDate]
  )

  const totalAmount = useMemo(() => {
    if (!Number.isFinite(selectedDays) || selectedDays <= 0) return 0
    return Number((selectedDays * pricePerDay).toFixed(2))
  }, [selectedDays, pricePerDay])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pricingResponse, adsResponse] = await Promise.all([
        userAdvertisementAPI.getUserAdvertisementPricing(),
        userAdvertisementAPI.getMyAdvertisements({ status: "all" }),
      ])

      const price = Number(pricingResponse?.data?.data?.pricePerDay || 150)
      const list = adsResponse?.data?.data?.advertisements || []
      const backendFilterCounts = adsResponse?.data?.data?.filterCounts

      setPricePerDay(Number.isFinite(price) && price > 0 ? price : 150)
      setAds(list)
      setFilterCounts(backendFilterCounts || buildFilterCountsFromAdvertisements(list))
      setErrorMessage("")
    } catch (error) {
      setAds([])
      setFilterCounts({ all: 0, pending: 0, active: 0, rejected: 0, expired: 0 })
      setErrorMessage(error?.response?.data?.message || "Failed to load advertisements")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    }
  }, [bannerPreview])

  const filteredAds = useMemo(() => {
    if (activeFilter === "all") return ads
    if (activeFilter === "pending") {
      return ads.filter((ad) => ["pending", "payment_pending"].includes(String(ad.status || "").toLowerCase()))
    }
    if (activeFilter === "active") {
      return ads.filter((ad) =>
        ["active", "running", "approved", "paused", "scheduled"].includes(
          String(ad.effectiveStatus || ad.status || "").toLowerCase()
        )
      )
    }
    if (activeFilter === "rejected") {
      return ads.filter((ad) => String(ad.status || "").toLowerCase() === "rejected")
    }
    if (activeFilter === "expired") {
      return ads.filter((ad) => String(ad.effectiveStatus || ad.status || "").toLowerCase() === "expired")
    }
    return ads
  }, [ads, activeFilter])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAds.length / ITEMS_PER_PAGE)),
    [filteredAds.length]
  )

  const paginatedAds = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredAds.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredAds, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeFilter])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const resetForm = () => {
    setTitle("")
    const tomorrow = getTomorrowInputDate()
    setStartDate(tomorrow)
    setEndDate(tomorrow)
    setBannerFile(null)
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setBannerPreview("")
  }

  const handleBannerChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Only image banner is allowed")
      return
    }

    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
    setErrorMessage("")
  }

  const handleCreate = async () => {
    const parsedStartDate = parseInputDate(startDate)
    const parsedEndDate = parseInputDate(endDate)
    const tomorrow = parseInputDate(getTomorrowInputDate())
    const rangeDays = getRangeDays(startDate, endDate)

    if (!bannerFile) {
      setErrorMessage("Banner image is required")
      return
    }
    if (!title.trim()) {
      setErrorMessage("Title is required")
      return
    }
    if (!parsedStartDate || !parsedEndDate) {
      setErrorMessage("Valid start date and end date are required")
      return
    }
    if (parsedEndDate < parsedStartDate) {
      setErrorMessage("End date cannot be before start date")
      return
    }
    if (tomorrow && parsedStartDate < tomorrow) {
      setErrorMessage("Start date must be tomorrow or later")
      return
    }
    if (!Number.isFinite(rangeDays) || rangeDays < 1 || rangeDays > 365) {
      setErrorMessage("Date range must be between 1 and 365 days")
      return
    }

    setCreating(true)
    try {
      const payload = new FormData()
      payload.append("banner", bannerFile)
      payload.append("title", title.trim())
      payload.append("startDate", startDate)
      payload.append("endDate", endDate)
      await userAdvertisementAPI.createMyAdvertisement(payload)
      resetForm()
      setFormOpen(false)
      await loadData()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to submit advertisement request")
    } finally {
      setCreating(false)
    }
  }

  const filters = [
    { id: "all", label: "All", count: filterCounts.all },
    { id: "pending", label: "Pending", count: filterCounts.pending },
    { id: "active", label: "Active", count: filterCounts.active },
    { id: "rejected", label: "Rejected", count: filterCounts.rejected },
    { id: "expired", label: "Expired", count: filterCounts.expired },
  ]

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 overflow-x-hidden pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">My Advertisements</h1>
        <button
          onClick={() => setFormOpen((prev) => !prev)}
          className="px-3 py-1.5 rounded-lg bg-black text-white text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        {formOpen && (
          <Card className="bg-white border border-gray-100">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Create Advertisement Request</h2>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <div className="relative">
                  <CalendarDays className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="date"
                    value={startDate}
                    min={getTomorrowInputDate()}
                    onChange={(e) => {
                      const nextStartDate = e.target.value
                      setStartDate(nextStartDate)
                      if (getRangeDays(nextStartDate, endDate) <= 0) {
                        setEndDate(nextStartDate)
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <div className="relative">
                  <CalendarDays className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || getTomorrowInputDate()}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Banner Image</label>
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-3 block cursor-pointer hover:border-gray-500">
                  <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                  {bannerPreview ? (
                    <img src={bannerPreview} alt="Banner preview" className="w-full h-36 object-cover rounded-md" />
                  ) : (
                    <div className="text-center py-4">
                      <Upload className="h-6 w-6 text-gray-500 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Click to upload banner</p>
                    </div>
                  )}
                </label>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs text-gray-600">Price Per Day: INR {pricePerDay.toFixed(2)}</p>
                <p className="text-xs text-gray-600">Selected Days: {selectedDays}</p>
                <div className="mt-1 flex items-center gap-1 text-gray-900">
                  <IndianRupee className="h-4 w-4" />
                  <p className="text-sm font-semibold">Total: INR {totalAmount.toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleCreate} disabled={creating} className="bg-black hover:bg-gray-800 text-white">
                  {creating ? "Submitting..." : "Submit Request"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm()
                    setFormOpen(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filters.map((filter, index) => (
            <Motion.button
              key={filter.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveFilter(filter.id)}
              className={`relative z-10 flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeFilter === filter.id ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {activeFilter === filter.id && (
                <Motion.div
                  layoutId="userActiveFilter"
                  className="absolute inset-0 bg-black rounded-full z-0"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10 font-bold">
                {filter.label} {filter.count > 0 ? filter.count : ""}
              </span>
            </Motion.button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 text-center py-10">Loading advertisements...</p>
        ) : filteredAds.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No advertisements found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedAds.map((ad, index) => (
              <Motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
              >
                <Card
                  className="bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/user/profile/advertisements/${ad.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900">Ads ID #{ad.adId || ad.id}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(ad.effectiveStatus || ad.status)}`}>
                            {formatStatus(ad.effectiveStatus || ad.status)}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${String(ad.paymentStatus || "").toLowerCase() === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                          >
                            {formatStatus(ad.paymentStatus)}
                          </span>
                        </div>

                        <p className="text-sm text-gray-700 mb-2">Banner Promotion</p>

                        <div className="space-y-1 text-xs text-gray-600">
                          <p>Ads Placed: {formatDate(ad.createdAt)}</p>
                          <p>Duration: {formatDate(ad.startDate)} - {formatDate(ad.endDate)}</p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/user/profile/advertisements/${ad.id}`)
                        }}
                        className="p-2 bg-black hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
                      >
                        <ChevronRight className="w-5 h-5 text-white" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </Motion.div>
            ))}
          </div>
        )}

        {!loading && filteredAds.length > 0 && (
          <div className="pt-1 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
