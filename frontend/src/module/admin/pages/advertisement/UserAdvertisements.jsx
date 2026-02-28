import { useEffect, useMemo, useState } from "react"
import { Search, CheckCircle2, XCircle, Eye } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { userAdvertisementAPI } from "@/lib/api"

const ITEMS_PER_PAGE = 10

const parseTabFromSearch = (search) => {
  const allowed = new Set(["pending", "active", "rejected", "history", "list"])
  const tab = new URLSearchParams(search).get("tab")
  return allowed.has(tab) ? tab : "pending"
}

const formatDate = (value) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

const getRangeDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1
}

const getHistoryResult = (row) => {
  if (row.status !== "expired") return row.status
  return row.paymentStatus === "paid" ? "completed" : "expired"
}

const statusBadge = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "active") return "bg-emerald-100 text-emerald-700"
  if (value === "completed") return "bg-emerald-100 text-emerald-700"
  if (value === "scheduled") return "bg-indigo-100 text-indigo-700"
  if (value === "payment_pending" || value === "approved") return "bg-amber-100 text-amber-700"
  if (value === "rejected") return "bg-red-100 text-red-700"
  if (value === "expired") return "bg-slate-200 text-slate-700"
  return "bg-blue-100 text-blue-700"
}

const mapRow = (ad) => {
  const startDate = ad.startDate || null
  const endDate = ad.endDate || null
  return {
    id: ad.id,
    adId: ad.adId,
    title: ad.title,
    userName: ad.user?.name || "N/A",
    userEmail: ad.user?.email || "-",
    type: "Banner Promotion",
    duration: `${formatDate(startDate)} - ${formatDate(endDate)}`,
    durationDays: Number(ad.durationDays) > 0 ? Number(ad.durationDays) : getRangeDays(startDate, endDate),
    paymentStatus: String(ad.paymentStatus || "unpaid").toLowerCase(),
    status: String(ad.effectiveStatus || ad.status || "pending").toLowerCase(),
    rawStatus: String(ad.status || "pending").toLowerCase(),
    endDateRaw: endDate,
    bannerImage: ad.bannerImage || "",
    createdAt: ad.createdAt,
  }
}

export default function UserAdvertisements() {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(() => parseTabFromSearch(location.search))
  const [loading, setLoading] = useState(true)
  const [priceLoading, setPriceLoading] = useState(true)
  const [priceSaving, setPriceSaving] = useState(false)
  const [pricePerDay, setPricePerDay] = useState("150")
  const [rows, setRows] = useState([])
  const [searchQuery, setSearchQuery] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedRow, setSelectedRow] = useState(null)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectTargetId, setRejectTargetId] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const loadRows = async () => {
    setLoading(true)
    try {
      const response = await userAdvertisementAPI.getAdminUserAdvertisements({ status: "all" })
      const list = response?.data?.data?.advertisements || []
      setRows(list.map(mapRow))
      setErrorMessage("")
    } catch (error) {
      setRows([])
      setErrorMessage(error?.response?.data?.message || "Failed to load user advertisements")
    } finally {
      setLoading(false)
    }
  }

  const loadPricing = async () => {
    setPriceLoading(true)
    try {
      const response = await userAdvertisementAPI.getAdminUserAdvertisementPricing()
      const amount = Number(response?.data?.data?.pricePerDay || 150)
      setPricePerDay(Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "150.00")
    } catch {
      // keep old value
    } finally {
      setPriceLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
    loadPricing()
  }, [])

  useEffect(() => {
    setActiveTab(parseTabFromSearch(location.search))
  }, [location.search])

  const filteredRows = useMemo(() => {
    let list = [...rows]

    if (activeTab === "pending") {
      list = list.filter((row) => ["pending", "approved", "payment_pending"].includes(row.status))
    }
    if (activeTab === "active") {
      list = list.filter((row) => ["active", "scheduled"].includes(row.status))
    }
    if (activeTab === "rejected") {
      list = list.filter((row) => row.status === "rejected")
    }
    if (activeTab === "history") {
      list = list
        .filter((row) => row.status === "expired")
        .sort((a, b) => new Date(b.endDateRaw || 0).getTime() - new Date(a.endDateRaw || 0).getTime())
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      list = list.filter((row) =>
        row.adId?.toLowerCase().includes(query) ||
        row.title?.toLowerCase().includes(query) ||
        row.userName?.toLowerCase().includes(query)
      )
    }

    return list
  }, [rows, activeTab, searchQuery])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE)),
    [filteredRows.length]
  )

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredRows.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredRows, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchQuery])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handleUpdatePricing = async () => {
    const amount = Number(pricePerDay)
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Price per day must be a positive number")
      return
    }

    setPriceSaving(true)
    try {
      await userAdvertisementAPI.updateAdminUserAdvertisementPricing(Number(amount.toFixed(2)))
      await loadPricing()
      setErrorMessage("")
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to update user ad price per day")
    } finally {
      setPriceSaving(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      await userAdvertisementAPI.approveAdminUserAdvertisement(id)
      await loadRows()
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to approve user advertisement")
    }
  }

  const handleRejectRequest = async (id) => {
    setIsRejecting(true)
    try {
      await userAdvertisementAPI.rejectAdminUserAdvertisement(id)
      await loadRows()
      setIsRejectDialogOpen(false)
      setRejectTargetId("")
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || "Failed to reject user advertisement")
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-slate-900">User Advertisements</h1>
          <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">{filteredRows.length}</span>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 mb-4">
          {[{ key: "pending", label: "Pending Requests" }, { key: "active", label: "Active Ads" }, { key: "rejected", label: "Rejected Ads" }, { key: "history", label: "History" }].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                navigate(`/admin/user-advertisements?tab=${tab.key}`, { replace: true })
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm">
          <input
            type="text"
            placeholder="Search by ad ID, title, user"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>

        <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50 max-w-xl">
          <p className="text-xs font-semibold text-slate-700 mb-2">User Banner Price Configuration</p>
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
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">User</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Type</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Duration</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">{activeTab === "history" ? "Result" : "Status"}</th>
              <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500">Loading...</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500">No advertisements found</td></tr>
            ) : (
              paginatedRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="px-6 py-4 text-sm text-slate-700">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{row.adId}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{row.title}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.userName}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.type}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.duration}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(activeTab === "history" ? getHistoryResult(row) : row.status)}`}>
                      {activeTab === "history" ? getHistoryResult(row) : row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setSelectedRow(row); setIsViewOpen(true) }} className="p-2 rounded hover:bg-slate-100">
                        <Eye className="w-4 h-4 text-slate-700" />
                      </button>

                      {activeTab === "pending" && ["pending", "approved", "payment_pending"].includes(row.status) && (
                        <>
                          {row.status === "pending" && (
                            <button onClick={() => handleApprove(row.id)} className="p-2 rounded hover:bg-emerald-50">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setRejectTargetId(row.id)
                              setIsRejectDialogOpen(true)
                            }}
                            className="p-2 rounded hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </button>
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

      {!loading && filteredRows.length > 0 && (
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
          <DialogHeader className="px-6 pt-6 pb-4"><DialogTitle>User Advertisement Details</DialogTitle></DialogHeader>
          {selectedRow && (
            <div className="px-6 pb-6 grid grid-cols-2 gap-4 text-sm">
              <div><p className="font-semibold text-slate-700">Ads ID</p><p>{selectedRow.adId}</p></div>
              <div><p className="font-semibold text-slate-700">Status</p><p>{selectedRow.status}</p></div>
              <div><p className="font-semibold text-slate-700">User</p><p>{selectedRow.userName}</p></div>
              <div><p className="font-semibold text-slate-700">Email</p><p>{selectedRow.userEmail}</p></div>
              <div><p className="font-semibold text-slate-700">Type</p><p>{selectedRow.type}</p></div>
              <div><p className="font-semibold text-slate-700">Duration</p><p>{selectedRow.duration}</p></div>
              <div><p className="font-semibold text-slate-700">Selected Days</p><p>{selectedRow.durationDays} day(s)</p></div>
              <div><p className="font-semibold text-slate-700">Created</p><p>{formatDate(selectedRow.createdAt)}</p></div>
              {selectedRow.bannerImage && (
                <div className="col-span-2">
                  <p className="font-semibold text-slate-700 mb-2">Banner</p>
                  <img src={selectedRow.bannerImage} alt={selectedRow.title} className="w-full h-48 object-cover rounded-lg border border-slate-200" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isRejectDialogOpen}
        onOpenChange={(open) => {
          if (!isRejecting) {
            setIsRejectDialogOpen(open)
            if (!open) setRejectTargetId("")
          }
        }}
      >
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Reject User Advertisement</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-600">Reject this user advertisement request?</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isRejecting) return
                  setIsRejectDialogOpen(false)
                  setRejectTargetId("")
                }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={isRejecting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rejectTargetId) handleRejectRequest(rejectTargetId)
                }}
                className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                disabled={isRejecting || !rejectTargetId}
              >
                {isRejecting ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
