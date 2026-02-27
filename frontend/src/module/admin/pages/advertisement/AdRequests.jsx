import { useEffect, useMemo, useState } from "react"
import { Search, CheckCircle2, XCircle, Eye } from "lucide-react"
import { campaignAPI } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocation } from "react-router-dom"

const ITEMS_PER_PAGE = 10

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const mapRow = (ad) => ({
  id: ad.id,
  adsId: ad.adId,
  adsTitle: ad.title,
  restaurantName: ad.restaurant?.name || "N/A",
  restaurantEmail: ad.restaurant?.email || "-",
  adsType: ad.category || "-",
  duration: `${formatDate(ad.startDate)} - ${formatDate(ad.endDate || ad.validityDate)}`,
  status: String(ad.effectiveStatus || ad.status || "pending").toLowerCase(),
  description: ad.description || "",
})

const parseTabFromSearch = (search) => {
  const allowed = new Set(["pending", "active", "rejected"])
  const tab = new URLSearchParams(search).get("tab")
  return allowed.has(tab) ? tab : "pending"
}

const statusBadge = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "active") return "bg-emerald-100 text-emerald-700"
  if (value === "scheduled") return "bg-indigo-100 text-indigo-700"
  if (value === "payment_pending" || value === "approved") return "bg-amber-100 text-amber-700"
  if (value === "rejected") return "bg-red-100 text-red-700"
  if (value === "expired") return "bg-slate-200 text-slate-700"
  return "bg-blue-100 text-blue-700"
}

export default function AdRequests() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(() => parseTabFromSearch(location.search))
  const [loading, setLoading] = useState(true)
  const [priceLoading, setPriceLoading] = useState(true)
  const [priceSaving, setPriceSaving] = useState(false)
  const [pricePerDay, setPricePerDay] = useState("150")
  const [searchQuery, setSearchQuery] = useState("")
  const [requests, setRequests] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadRequests = async () => {
    setLoading(true)
    try {
      const response = await campaignAPI.getAdminAdvertisements({ status: "all" })
      const list = response?.data?.data?.advertisements || []
      setRequests(list.map(mapRow))
      setErrorMessage("")
    } catch (error) {
      setRequests([])
      setErrorMessage(error?.response?.data?.message || "Failed to load advertisement requests")
    } finally {
      setLoading(false)
    }
  }

  const loadPricing = async () => {
    setPriceLoading(true)
    try {
      const response = await campaignAPI.getAdminAdvertisementPricing()
      const amount = Number(response?.data?.data?.pricePerDay || 150)
      setPricePerDay(Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "150.00")
    } catch {
      // keep old value
    } finally {
      setPriceLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
    loadPricing()
  }, [])

  useEffect(() => {
    setActiveTab(parseTabFromSearch(location.search))
  }, [location.search])

  const filteredRequests = useMemo(() => {
    let rows = [...requests]

    if (activeTab === "pending") rows = rows.filter((r) => ["pending", "payment_pending"].includes(r.status))
    if (activeTab === "active") rows = rows.filter((r) => ["active", "scheduled"].includes(r.status))
    if (activeTab === "rejected") rows = rows.filter((r) => r.status === "rejected")

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      rows = rows.filter((r) =>
        r.adsId?.toLowerCase().includes(query) ||
        r.adsTitle?.toLowerCase().includes(query) ||
        r.restaurantName?.toLowerCase().includes(query)
      )
    }

    return rows
  }, [requests, activeTab, searchQuery])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE)),
    [filteredRequests.length]
  )

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredRequests.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredRequests, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleApprove = async (id) => {
    try {
      await campaignAPI.approveAdvertisement(id)
      await loadRequests()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to approve advertisement")
    }
  }

  const handleDeleteRequest = async (id) => {
    const confirmed = window.confirm("Delete this advertisement request permanently?")
    if (!confirmed) return

    try {
      await campaignAPI.deleteAdvertisementByAdmin(id)
      await loadRequests()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to delete advertisement")
    }
  }

  const handleUpdatePricing = async () => {
    const amount = Number(pricePerDay)
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Price per day must be a positive number")
      return
    }

    setPriceSaving(true)
    try {
      await campaignAPI.updateAdminAdvertisementPricing(Number(amount.toFixed(2)))
      await loadPricing()
      setErrorMessage("")
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to update ad price per day")
    } finally {
      setPriceSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Advertisements</h1>
          <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">{filteredRequests.length}</span>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 mb-4">
          {[{ key: "pending", label: "Pending Requests" }, { key: "active", label: "Active Ads" }, { key: "rejected", label: "Rejected Ads" }].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm">
          <input
            type="text"
            placeholder="Search by ad ID, title, restaurant"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>

        <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50 max-w-xl">
          <p className="text-xs font-semibold text-slate-700 mb-2">Banner Price Configuration</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="0.01"
              value={pricePerDay}
              onChange={(e) => setPricePerDay(e.target.value)}
              className="w-40 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none"
              disabled={priceLoading || priceSaving}
            />
            <span className="text-sm text-slate-600">INR / day</span>
            <button
              onClick={handleUpdatePricing}
              disabled={priceLoading || priceSaving}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {priceSaving ? "Saving..." : "Update Price"}
            </button>
          </div>
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600 mb-4">{errorMessage}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">SI</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Ads ID</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Title</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Restaurant</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Type</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Duration</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Status</th>
              <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500">Loading...</td></tr>
            ) : filteredRequests.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500">No advertisements found</td></tr>
            ) : (
              paginatedRequests.map((request, index) => (
                <tr key={request.id}>
                  <td className="px-6 py-4 text-sm text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{request.adsId}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{request.adsTitle}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{request.restaurantName}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{request.adsType}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{request.duration}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(request.status)}`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setSelectedRequest(request); setIsViewOpen(true) }} className="p-2 rounded hover:bg-slate-100"><Eye className="w-4 h-4 text-slate-700" /></button>
                      {activeTab === "pending" && ["pending", "payment_pending"].includes(request.status) && (
                        <>
                          {request.status === "pending" && (
                            <button onClick={() => handleApprove(request.id)} className="p-2 rounded hover:bg-emerald-50"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></button>
                          )}
                          <button onClick={() => handleDeleteRequest(request.id)} className="p-2 rounded hover:bg-red-50"><XCircle className="w-4 h-4 text-red-600" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filteredRequests.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-2xl bg-white p-0">
          <DialogHeader className="px-6 pt-6 pb-4"><DialogTitle>Advertisement Details</DialogTitle></DialogHeader>
          {selectedRequest && (
            <div className="px-6 pb-6 grid grid-cols-2 gap-4 text-sm">
              <div><p className="font-semibold text-slate-700">Ads ID</p><p>{selectedRequest.adsId}</p></div>
              <div><p className="font-semibold text-slate-700">Status</p><p>{selectedRequest.status}</p></div>
              <div><p className="font-semibold text-slate-700">Title</p><p>{selectedRequest.adsTitle}</p></div>
              <div><p className="font-semibold text-slate-700">Type</p><p>{selectedRequest.adsType}</p></div>
              <div><p className="font-semibold text-slate-700">Restaurant</p><p>{selectedRequest.restaurantName}</p></div>
              <div><p className="font-semibold text-slate-700">Email</p><p>{selectedRequest.restaurantEmail}</p></div>
              <div className="col-span-2"><p className="font-semibold text-slate-700">Description</p><p>{selectedRequest.description || "-"}</p></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
