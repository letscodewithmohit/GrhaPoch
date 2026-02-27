import { useEffect, useMemo, useState } from "react"
import { motion as Motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  MoreVertical,
  ChevronRight,
  Plus,
  Eye,
  Pause,
  Play,
  Copy,
  Trash2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { campaignAPI } from "@/lib/api"

const ITEMS_PER_PAGE = 8

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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
  if (value === "paused") return "bg-slate-200 text-slate-700"
  if (value === "rejected") return "bg-red-100 text-red-700"
  if (value === "expired") return "bg-slate-300 text-slate-700"
  return "bg-blue-100 text-blue-700"
}

export default function AdvertisementsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState("all")
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [advertisements, setAdvertisements] = useState([])
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest(`[data-menu-id="${openMenuId}"]`)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [openMenuId])

  const loadAdvertisements = async () => {
    setLoading(true)
    try {
      const response = await campaignAPI.getRestaurantAdvertisements({ status: "all" })
      const list = response?.data?.data?.advertisements || []
      setAdvertisements(list)
      setErrorMessage("")
    } catch (error) {
      setAdvertisements([])
      setErrorMessage(error?.response?.data?.message || "Failed to load advertisements")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdvertisements()
  }, [])

  const mappedAdvertisements = useMemo(() => {
    return advertisements.map((ad) => {
      const effectiveStatus = String(ad.effectiveStatus || ad.status || "pending").toLowerCase()
      const displayStatus = effectiveStatus === "running" ? "active" : effectiveStatus
      return {
        id: ad.id,
        adId: ad.adId,
        title: ad.title || "Advertisement",
        type: ad.category || "Banner Promotion",
        status: String(ad.status || "pending").toLowerCase(),
        effectiveStatus,
        displayStatus,
        paymentStatus: String(ad.paymentStatus || "unpaid").toLowerCase(),
        createdAt: ad.createdAt,
        startDate: ad.startDate,
        endDate: ad.endDate || ad.validityDate,
      }
    })
  }, [advertisements])

  const filterCounts = useMemo(() => {
    const base = { all: mappedAdvertisements.length, pending: 0, active: 0, rejected: 0, expired: 0 }
    mappedAdvertisements.forEach((ad) => {
      if (["pending", "payment_pending"].includes(ad.status)) base.pending += 1
      if (["active", "running", "approved", "paused", "scheduled"].includes(ad.effectiveStatus)) base.active += 1
      if (ad.status === "rejected") base.rejected += 1
      if (ad.effectiveStatus === "expired") base.expired += 1
    })
    return base
  }, [mappedAdvertisements])

  const filteredAds = useMemo(() => {
    if (activeFilter === "all") return mappedAdvertisements
    if (activeFilter === "pending") {
      return mappedAdvertisements.filter((ad) => ["pending", "payment_pending"].includes(ad.status))
    }
    if (activeFilter === "active") {
      return mappedAdvertisements.filter((ad) =>
        ["active", "running", "approved", "paused", "scheduled"].includes(ad.effectiveStatus)
      )
    }
    if (activeFilter === "rejected") return mappedAdvertisements.filter((ad) => ad.status === "rejected")
    if (activeFilter === "expired") return mappedAdvertisements.filter((ad) => ad.effectiveStatus === "expired")
    return mappedAdvertisements
  }, [mappedAdvertisements, activeFilter])

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
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handlePauseResume = async (ad, action) => {
    setActionLoadingId(ad.id)
    setErrorMessage("")
    try {
      await campaignAPI.updateRestaurantAdvertisementStatus(ad.id, action)
      await loadAdvertisements()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || `Failed to ${action} advertisement`)
    } finally {
      setActionLoadingId("")
      setOpenMenuId(null)
    }
  }

  const handleDuplicate = async (ad) => {
    setActionLoadingId(ad.id)
    setErrorMessage("")
    try {
      await campaignAPI.duplicateRestaurantAdvertisement(ad.id)
      await loadAdvertisements()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to duplicate advertisement")
    } finally {
      setActionLoadingId("")
      setOpenMenuId(null)
    }
  }

  const handleDelete = async (ad) => {
    const confirmed = window.confirm("Delete this advertisement?")
    if (!confirmed) return
    setActionLoadingId(ad.id)
    setErrorMessage("")
    try {
      await campaignAPI.deleteRestaurantAdvertisement(ad.id)
      await loadAdvertisements()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to delete advertisement")
    } finally {
      setActionLoadingId("")
      setOpenMenuId(null)
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
    <div className="min-h-screen bg-slate-50 overflow-x-hidden pb-6">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Advertisement List</h1>
      </div>

      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-[57px] z-40">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filters.map((filter, index) => (
            <Motion.button
              key={filter.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveFilter(filter.id)}
              className={`relative z-10 flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeFilter === filter.id ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {activeFilter === filter.id && (
                <Motion.div
                  layoutId="activeFilter"
                  className="absolute inset-0 bg-blue-600 rounded-full z-0"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10 font-bold">
                {filter.label} {filter.count > 0 ? filter.count : ""}
              </span>
            </Motion.button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        {loading && <p className="text-sm text-gray-500 text-center py-10">Loading advertisements...</p>}

        {!loading && filteredAds.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No advertisements found</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!loading &&
            paginatedAds.map((ad, index) => (
              <Motion.div
                key={ad.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <Card
                  className="bg-white shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/restaurant/advertisements/${ad.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="text-base font-bold text-gray-900">Ads ID #{ad.adId || ad.id}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(ad.displayStatus)}`}>
                            {formatStatus(ad.displayStatus)}
                          </span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              ad.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {formatStatus(ad.paymentStatus)}
                          </span>
                        </div>

                        <p className="text-sm text-gray-700 mb-2">{ad.type}</p>

                        <div className="space-y-1 text-xs text-gray-600">
                          <p>Ads Placed: {formatDate(ad.createdAt)}</p>
                          <p>
                            Duration: {formatDate(ad.startDate)} - {formatDate(ad.endDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === ad.id ? null : ad.id)
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
                          data-menu-id={ad.id}
                          disabled={actionLoadingId === ad.id}
                        >
                          <MoreVertical className="w-5 h-5 text-gray-600" />
                        </button>

                        <AnimatePresence>
                          {openMenuId === ad.id && (
                            <Motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              transition={{ duration: 0.2 }}
                              className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[190px]"
                              data-menu-id={ad.id}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/restaurant/advertisements/${ad.id}`)
                                  setOpenMenuId(null)
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                              </button>

                              {ad.status === "paused" ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handlePauseResume(ad, "resume")
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <Play className="w-4 h-4" />
                                  <span>Resume</span>
                                </button>
                              ) : (
                                ["active", "running", "approved"].includes(ad.effectiveStatus) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handlePauseResume(ad, "pause")
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    <Pause className="w-4 h-4" />
                                    <span>Pause</span>
                                  </button>
                                )
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDuplicate(ad)
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                <Copy className="w-4 h-4" />
                                <span>Duplicate</span>
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(ad)
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </button>
                            </Motion.div>
                          )}
                        </AnimatePresence>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/restaurant/advertisements/${ad.id}`)
                          }}
                          className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-white" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Motion.div>
            ))}
        </AnimatePresence>
      </div>

      {!loading && filteredAds.length > 0 && (
        <div className="px-4 pb-2 flex items-center justify-between">
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

      <Motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate("/restaurant/advertisements/new")}
        className="fixed bottom-6 right-4 md:right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </Motion.button>
    </div>
  )
}

